/**
 * Atualiza CONFIG_SESSION_PHONE_VERSION no EasyPanel via API tRPC
 * e reinicia o serviço da Evolution API.
 * Proteção anti-loop: não reinicia se já reiniciou nos últimos 15 min.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function epGet(baseUrl, token, path, queryInput = null) {
  let url = `${baseUrl.replace(/\/$/, '')}${path}`;
  if (queryInput !== null) {
    url += `?input=${encodeURIComponent(JSON.stringify(queryInput))}`;
  }
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    signal: AbortSignal.timeout(15000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`EasyPanel GET ${path} [${resp.status}]: ${text.substring(0, 300)}`);
  const data = JSON.parse(text);
  return data?.result?.data?.json ?? data?.result?.data ?? data;
}

async function epPost(baseUrl, token, path, body) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ json: body }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`EasyPanel POST ${path} [${resp.status}]: ${text.substring(0, 300)}`);
  const data = JSON.parse(text);
  return data?.result?.data?.json ?? data?.result?.data ?? data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { versao_nova, forcar = false } = payload;

    const epUrl = Deno.env.get('EASYPANEL_URL');
    const epToken = Deno.env.get('EASYPANEL_TOKEN');
    const epProject = Deno.env.get('EASYPANEL_PROJECT');
    const epService = Deno.env.get('EASYPANEL_SERVICE');

    if (!epUrl || !epToken || !epProject || !epService) {
      return Response.json({ success: false, error: 'Secrets do EasyPanel não configurados (EASYPANEL_URL, EASYPANEL_TOKEN, EASYPANEL_PROJECT, EASYPANEL_SERVICE).' }, { status: 400 });
    }

    // Proteção anti-loop
    const LOCK_KEY = 'easypanel_ultimo_restart';
    let lockId = null;
    let ultimoRestart = null;
    try {
      const locks = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: LOCK_KEY });
      if (locks.length > 0) { ultimoRestart = locks[0].valor ? new Date(locks[0].valor) : null; lockId = locks[0].id; }
    } catch (_) {}

    if (!forcar && ultimoRestart) {
      const minutosPassados = (Date.now() - ultimoRestart.getTime()) / 60000;
      if (minutosPassados < 15) {
        const restante = Math.ceil(15 - minutosPassados);
        return Response.json({ success: false, bloqueado: true, error: `Anti-loop: último reinício há ${Math.floor(minutosPassados)} min. Aguarde ${restante} min ou use forcar=true.`, proximo_restart_em: restante });
      }
    }

    // Buscar versão mais recente se não informada
    let versaoAlvo = versao_nova;
    if (!versaoAlvo) {
      try {
        const resp = await fetch('https://wppconnect.io/whatsapp-versions/', {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CRM-Bot/1.0)' },
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const html = await resp.text();
          const matches = html.match(/(\d+\.\d+\.\d+[\.\d]*)/g) || [];
          const versoes = matches.filter(v => v.startsWith('2.') && v.split('.').length >= 3);
          versoes.sort((a, b) => {
            const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
              const d = (pb[i] || 0) - (pa[i] || 0);
              if (d !== 0) return d;
            }
            return 0;
          });
          if (versoes.length > 0) versaoAlvo = versoes[0];
        }
      } catch (_) {}
    }

    if (!versaoAlvo) return Response.json({ success: false, error: 'Não foi possível detectar a versão mais recente.' }, { status: 400 });

    // Versão anterior
    let versaoAnterior = null, versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) { versaoAnterior = configs[0].valor; versaoConfigId = configs[0].id; }
    } catch (_) {}

    // Passo 1: Inspecionar serviço para obter env vars atuais
    // CRÍTICO: Se não conseguir ler as vars atuais, ABORTAR para não sobrescrever tudo com env vazio
    let envVarsAtuais = {};
    let inspecaoOk = false;
    let envStrOriginal = '';

    // Tentar múltiplos endpoints de inspeção
    const endpointsInspecao = [
      '/api/trpc/services.app.inspectService',
      '/api/trpc/apps.inspect',
      '/api/trpc/services.inspect',
    ];

    for (const endpoint of endpointsInspecao) {
      try {
        const serviceData = await epGet(epUrl, epToken, endpoint, {
          input: { json: { projectName: epProject, serviceName: epService } }
        });
        const envStr = serviceData?.env || serviceData?.source?.env || serviceData?.config?.env || serviceData?.envVars || '';
        if (envStr && envStr.trim().length > 0) {
          envStrOriginal = envStr;
          envStr.split('\n').forEach(line => {
            const [k, ...v] = line.split('=');
            if (k?.trim()) envVarsAtuais[k.trim()] = v.join('=').trim();
          });
          inspecaoOk = true;
          console.log(`✅ Serviço inspecionado via ${endpoint}, env vars encontradas: ${Object.keys(envVarsAtuais).length}`);
          break;
        }
      } catch (e) {
        console.warn(`⚠️ Endpoint ${endpoint} falhou: ${e.message}`);
      }
    }

    // PROTEÇÃO CRÍTICA: Se não encontrou nenhuma env var, ABORTAR
    // para não sobrescrever o ambiente com apenas 3 variáveis e derrubar o Evolution
    if (!inspecaoOk || Object.keys(envVarsAtuais).length === 0) {
      const msg = 'SEGURANÇA: Não foi possível ler as variáveis de ambiente atuais do EasyPanel. Operação ABORTADA para evitar apagar as configurações do Evolution API.';
      console.error('🛑 ' + msg);

      // Log no banco
      try {
        await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
          versao_anterior: versaoAnterior, versao_nova: versaoAlvo,
          precisou_reiniciar: false, instancias_reconectadas: false,
          acao: 'alerta_falha', sucesso: false,
          erro: msg
        });
      } catch (_) {}

      return Response.json({ success: false, abortado: true, error: msg }, { status: 500 });
    }

    console.log(`📋 Env vars lidas (${Object.keys(envVarsAtuais).length} variáveis). Atualizando apenas CONFIG_SESSION_PHONE_*`);

    // Atualizar SOMENTE as variáveis do WhatsApp — manter todo o resto intacto
    envVarsAtuais['CONFIG_SESSION_PHONE_VERSION'] = versaoAlvo;
    envVarsAtuais['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
    envVarsAtuais['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';

    const novaEnvStr = Object.entries(envVarsAtuais).map(([k, v]) => `${k}=${v}`).join('\n');

    // Passo 2: Atualizar env vars
    let easypanelAtualizou = false;
    try {
      await epPost(epUrl, epToken, '/api/trpc/services.app.updateEnv', {
        projectName: epProject, serviceName: epService, env: novaEnvStr
      });
      easypanelAtualizou = true;
      console.log('✅ Env vars atualizadas via services.app.updateEnv');
    } catch (e) {
      console.error('❌ updateEnv falhou:', e.message);
    }

    // Passo 3: Fazer deploy/restart
    let reiniciou = false;
    if (easypanelAtualizou) {
      try {
        await epPost(epUrl, epToken, '/api/trpc/services.app.deployService', {
          projectName: epProject, serviceName: epService
        });
        reiniciou = true;
        console.log('✅ Deploy iniciado via services.app.deployService');
      } catch (e) {
        console.error('❌ deployService falhou:', e.message);
      }
    }

    // Salvar lock anti-loop
    if (reiniciou) {
      try {
        const agora = new Date().toISOString();
        if (lockId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(lockId, { valor: agora });
        else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: LOCK_KEY, valor: agora, descricao: 'Timestamp último restart EasyPanel (anti-loop)' });
      } catch (_) {}
    }

    // Passo 4: Aguardar e verificar instâncias
    let statusInstancias = [];
    if (reiniciou) {
      console.log('⏳ Aguardando serviço reiniciar (20s)...');
      await new Promise(r => setTimeout(r, 20000));
      const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
      const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
      if (evolutionUrl && evolutionKey) {
        for (let t = 1; t <= 3; t++) {
          try {
            const resp = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
              headers: { 'apikey': evolutionKey }, signal: AbortSignal.timeout(10000)
            });
            if (resp.ok) {
              const data = await resp.json();
              statusInstancias = (Array.isArray(data) ? data : (data.instances || [])).map(i => ({
                nome: i.instance?.instanceName || i.name || i.instanceName,
                status: i.instance?.status || i.status || i.state || 'unknown'
              }));
              break;
            }
          } catch (_) { if (t < 3) await new Promise(r => setTimeout(r, 5000)); }
        }
        // Reconectar desconectadas
        for (const inst of statusInstancias.filter(i => !['open', 'connected', 'CONNECTED'].includes(i.status))) {
          try {
            await fetch(`${evolutionUrl}/instance/connect/${inst.nome}`, { headers: { 'apikey': evolutionKey }, signal: AbortSignal.timeout(10000) });
          } catch (_) {}
        }
      }
    }

    // Salvar versão no banco
    try {
      if (versaoConfigId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(versaoConfigId, { valor: versaoAlvo });
      else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: 'whatsapp_versao_configurada', valor: versaoAlvo, descricao: 'Versão WhatsApp Web configurada na Evolution API' });
    } catch (_) {}

    // Log no banco
    const instConectadas = statusInstancias.filter(i => ['open', 'connected', 'CONNECTED'].includes(i.status));
    try {
      await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
        versao_anterior: versaoAnterior, versao_nova: versaoAlvo,
        precisou_reiniciar: reiniciou, instancias_reconectadas: instConectadas.length === statusInstancias.length && statusInstancias.length > 0,
        acao: 'atualizacao_automatica', sucesso: easypanelAtualizou,
        detalhes: JSON.stringify({ easypanel_atualizou: easypanelAtualizou, reiniciou, instancias: statusInstancias }),
        erro: !easypanelAtualizou ? 'EasyPanel não atualizou as env vars' : null
      });
    } catch (_) {}

    // Notificar Telegram
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tgChat = Deno.env.get('TELEGRAM_CHAT_ID');
    if (tgToken && tgChat) {
      const msg = `${easypanelAtualizou ? '✅' : '⚠️'} *EasyPanel - Versão WhatsApp Atualizada*\n\n• Versão anterior: \`${versaoAnterior || 'N/A'}\`\n• Nova versão: \`${versaoAlvo}\`\n• EasyPanel atualizou: ${easypanelAtualizou ? '✅' : '❌'}\n• Reiniciado: ${reiniciou ? '✅' : '❌'}\n• Instâncias online: ${instConectadas.length}/${statusInstancias.length}`;
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: 'Markdown' })
      }).catch(() => {});
    }

    return Response.json({
      success: easypanelAtualizou, versao_anterior: versaoAnterior, versao_nova: versaoAlvo,
      easypanel_atualizou: easypanelAtualizou, reiniciou, instancias: statusInstancias,
      instancias_conectadas: instConectadas.length,
      aviso: !easypanelAtualizou ? 'Não foi possível atualizar via EasyPanel API. Verifique o token, URL, project e service.' : null
    });

  } catch (error) {
    console.error('Erro crítico:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
/**
 * Atualiza APENAS CONFIG_SESSION_PHONE_VERSION no EasyPanel.
 * ESTRATÉGIA SEGURA:
 * 1. Lê env vars atuais
 * 2. Faz PATCH apenas nas 3 variáveis CONFIG_SESSION_PHONE_*
 * 3. Se não conseguir ler env atual → ABORTA (não sobrescreve nada)
 * 4. Verifica que todas as outras variáveis foram preservadas antes de salvar
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
  return JSON.parse(text);
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
  return JSON.parse(text);
}

function parseEnvStr(envStr) {
  const vars = {};
  if (!envStr) return vars;
  envStr.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const k = trimmed.substring(0, idx).trim();
    const v = trimmed.substring(idx + 1); // NÃO trim() no valor — preservar espaços/vazios
    if (k) vars[k] = v;
  });
  return vars;
}

function buildEnvStr(vars) {
  return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n');
}

async function lerEnvVarsAtuais(epUrl, epToken, epProject, epService) {
  // Tenta múltiplos formatos do endpoint EasyPanel tRPC
  const tentativas = [
    async () => {
      const data = await epGet(epUrl, epToken, `/api/trpc/services.app.inspectService`, {
        projectName: epProject, serviceName: epService
      });
      const d = data?.result?.data?.json ?? data?.result?.data ?? data;
      return d?.env || d?.source?.env || d?.config?.env || null;
    },
    async () => {
      const data = await epGet(epUrl, epToken, `/api/trpc/services.app.inspectService?input=${encodeURIComponent(JSON.stringify({ json: { projectName: epProject, serviceName: epService } }))}`);
      const d = data?.result?.data?.json ?? data?.result?.data ?? data;
      return d?.env || d?.source?.env || d?.config?.env || null;
    },
    async () => {
      const data = await epGet(epUrl, epToken, `/api/trpc/apps.inspect?input=${encodeURIComponent(JSON.stringify({ json: { projectName: epProject, appName: epService } }))}`);
      const d = data?.result?.data?.json ?? data?.result?.data ?? data;
      return d?.env || d?.source?.env || null;
    },
  ];

  for (let i = 0; i < tentativas.length; i++) {
    try {
      const envStr = await tentativas[i]();
      if (envStr && typeof envStr === 'string' && envStr.trim().length > 10) {
        const vars = parseEnvStr(envStr);
        const qtd = Object.keys(vars).length;
        console.log(`✅ Env lida na tentativa ${i + 1}: ${qtd} variáveis`);
        if (qtd >= 5) return { envStr, vars }; // mínimo 5 vars para ser válido
      }
    } catch (e) {
      console.warn(`⚠️ Tentativa ${i + 1} falhou: ${e.message}`);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { versao_nova, forcar = false, apenas_inspecionar = false } = payload;

    const epUrl = Deno.env.get('EASYPANEL_URL');
    const epToken = Deno.env.get('EASYPANEL_TOKEN');
    const epProject = Deno.env.get('EASYPANEL_PROJECT');
    const epService = Deno.env.get('EASYPANEL_SERVICE');

    if (!epUrl || !epToken || !epProject || !epService) {
      return Response.json({ success: false, error: 'Secrets do EasyPanel não configurados.' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────────────
    // MODO APENAS INSPECIONAR: retorna env atual sem modificar nada
    // ──────────────────────────────────────────────────────────────────────
    if (apenas_inspecionar) {
      const resultado = await lerEnvVarsAtuais(epUrl, epToken, epProject, epService);
      if (!resultado) return Response.json({ success: false, error: 'Não conseguiu ler env vars' });
      return Response.json({
        success: true,
        total_vars: Object.keys(resultado.vars).length,
        vars_config_session: {
          CONFIG_SESSION_PHONE_VERSION: resultado.vars['CONFIG_SESSION_PHONE_VERSION'] || null,
          CONFIG_SESSION_PHONE_NAME: resultado.vars['CONFIG_SESSION_PHONE_NAME'] || null,
          CONFIG_SESSION_PHONE_CLIENT: resultado.vars['CONFIG_SESSION_PHONE_CLIENT'] || null,
        },
        env_preview: resultado.envStr.substring(0, 500) + '...',
      });
    }

    // ──────────────────────────────────────────────────────────────────────
    // PROTEÇÃO ANTI-LOOP
    // ──────────────────────────────────────────────────────────────────────
    const LOCK_KEY = 'easypanel_ultimo_restart';
    let lockId = null, ultimoRestart = null;
    try {
      const locks = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: LOCK_KEY });
      if (locks.length > 0) { ultimoRestart = locks[0].valor ? new Date(locks[0].valor) : null; lockId = locks[0].id; }
    } catch (_) {}

    if (!forcar && ultimoRestart) {
      const minutosPassados = (Date.now() - ultimoRestart.getTime()) / 60000;
      if (minutosPassados < 15) {
        const restante = Math.ceil(15 - minutosPassados);
        return Response.json({ success: false, bloqueado: true, error: `Anti-loop: último reinício há ${Math.floor(minutosPassados)} min. Aguarde ${restante} min ou use forcar=true.` });
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // BUSCAR VERSÃO MAIS RECENTE (se não informada)
    // ──────────────────────────────────────────────────────────────────────
    let versaoAlvo = versao_nova;
    if (!versaoAlvo) {
      try {
        const resp = await fetch('https://wppconnect.io/whatsapp-versions/', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
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

    // Versão anterior no banco
    let versaoAnterior = null, versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) { versaoAnterior = configs[0].valor; versaoConfigId = configs[0].id; }
    } catch (_) {}

    // ──────────────────────────────────────────────────────────────────────
    // PASSO CRÍTICO: LER ENV VARS ATUAIS
    // Se falhar → ABORTAR COMPLETAMENTE
    // ──────────────────────────────────────────────────────────────────────
    console.log('📖 Lendo env vars atuais do EasyPanel...');
    const leituraAtual = await lerEnvVarsAtuais(epUrl, epToken, epProject, epService);

    if (!leituraAtual) {
      const msg = '🛑 ABORTADO: Não foi possível ler as variáveis de ambiente atuais. Operação cancelada para proteger o Evolution API.';
      console.error(msg);
      try {
        await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
          versao_anterior: versaoAnterior, versao_nova: versaoAlvo,
          acao: 'alerta_falha', sucesso: false, erro: msg
        });
      } catch (_) {}
      return Response.json({ success: false, abortado: true, error: msg }, { status: 500 });
    }

    const { vars: envVarsAtuais, envStr: envStrOriginal } = leituraAtual;
    const totalVarsAntes = Object.keys(envVarsAtuais).length;
    console.log(`✅ ${totalVarsAntes} variáveis lidas. Fazendo patch apenas nas CONFIG_SESSION_PHONE_*`);

    // ──────────────────────────────────────────────────────────────────────
    // PATCH: Atualizar SOMENTE as 3 variáveis de versão
    // Todas as outras (~150 vars) são preservadas intactas
    // ──────────────────────────────────────────────────────────────────────
    const versaoAtualNoEasyPanel = envVarsAtuais['CONFIG_SESSION_PHONE_VERSION'];
    if (versaoAtualNoEasyPanel === versaoAlvo && !forcar) {
      return Response.json({
        success: true,
        sem_mudanca: true,
        mensagem: `Versão ${versaoAlvo} já está configurada no EasyPanel. Use forcar=true para forçar.`,
        versao_atual: versaoAtualNoEasyPanel
      });
    }

    // Clonar vars e atualizar apenas as 3
    const envVarsNovo = { ...envVarsAtuais };
    envVarsNovo['CONFIG_SESSION_PHONE_VERSION'] = versaoAlvo;
    envVarsNovo['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
    envVarsNovo['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';

    const totalVarsDepois = Object.keys(envVarsNovo).length;

    // VERIFICAÇÃO DE SEGURANÇA: número de vars deve ser igual (só atualizamos, não removemos)
    if (totalVarsDepois < totalVarsAntes) {
      const msg = `🛑 ABORTADO: Verificação de segurança falhou. Antes: ${totalVarsAntes} vars, depois: ${totalVarsDepois} vars. Algo removeria variáveis.`;
      console.error(msg);
      return Response.json({ success: false, abortado: true, error: msg }, { status: 500 });
    }

    const novaEnvStr = buildEnvStr(envVarsNovo);

    // ──────────────────────────────────────────────────────────────────────
    // SALVAR ENV ATUALIZADA NO EASYPANEL
    // ──────────────────────────────────────────────────────────────────────
    let easypanelAtualizou = false;
    try {
      await epPost(epUrl, epToken, '/api/trpc/services.app.updateEnv', {
        projectName: epProject, serviceName: epService, env: novaEnvStr
      });
      easypanelAtualizou = true;
      console.log(`✅ Env salva: ${totalVarsDepois} vars preservadas, CONFIG_SESSION_PHONE_VERSION=${versaoAlvo}`);
    } catch (e) {
      console.error('❌ updateEnv falhou:', e.message);
      return Response.json({ success: false, error: `Falha ao salvar env no EasyPanel: ${e.message}` }, { status: 500 });
    }

    // ──────────────────────────────────────────────────────────────────────
    // DEPLOY/RESTART
    // ──────────────────────────────────────────────────────────────────────
    let reiniciou = false;
    try {
      await epPost(epUrl, epToken, '/api/trpc/services.app.deployService', {
        projectName: epProject, serviceName: epService
      });
      reiniciou = true;
      console.log('✅ Deploy iniciado');
    } catch (e) {
      console.error('❌ deployService falhou:', e.message);
    }

    // Lock anti-loop
    if (reiniciou) {
      try {
        const agora = new Date().toISOString();
        if (lockId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(lockId, { valor: agora });
        else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: LOCK_KEY, valor: agora, descricao: 'Timestamp último restart EasyPanel (anti-loop)' });
      } catch (_) {}
    }

    // ──────────────────────────────────────────────────────────────────────
    // AGUARDAR E VERIFICAR INSTÂNCIAS
    // ──────────────────────────────────────────────────────────────────────
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

    const instConectadas = statusInstancias.filter(i => ['open', 'connected', 'CONNECTED'].includes(i.status));

    // Log no banco
    try {
      await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
        versao_anterior: versaoAnterior, versao_nova: versaoAlvo,
        precisou_reiniciar: reiniciou, instancias_reconectadas: instConectadas.length === statusInstancias.length && statusInstancias.length > 0,
        acao: 'atualizacao_automatica', sucesso: easypanelAtualizou,
        detalhes: JSON.stringify({ total_vars_preservadas: totalVarsDepois, reiniciou, instancias: statusInstancias }),
      });
    } catch (_) {}

    // Notificar Telegram
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tgChat = Deno.env.get('TELEGRAM_CHAT_ID');
    if (tgToken && tgChat) {
      const msg = `✅ *EasyPanel - Versão WhatsApp Atualizada*\n\n• Versão anterior: \`${versaoAnterior || 'N/A'}\`\n• Nova versão: \`${versaoAlvo}\`\n• Variáveis preservadas: ${totalVarsDepois}\n• Reiniciado: ${reiniciou ? '✅' : '❌'}\n• Instâncias online: ${instConectadas.length}/${statusInstancias.length}`;
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: 'Markdown' })
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      versao_anterior: versaoAnterior,
      versao_nova: versaoAlvo,
      total_vars_preservadas: totalVarsDepois,
      reiniciou,
      instancias: statusInstancias,
      instancias_conectadas: instConectadas.length,
    });

  } catch (error) {
    console.error('Erro crítico:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
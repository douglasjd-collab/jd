/**
 * Atualiza CONFIG_SESSION_PHONE_VERSION no EasyPanel via API tRPC
 * e reinicia apenas o serviço da Evolution API.
 * Proteção anti-loop: não reinicia se já reiniciou nos últimos 15 min.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Chama a API tRPC do EasyPanel
async function easypanelCall(easypanelUrl, token, procedure, input) {
  const url = `${easypanelUrl.replace(/\/$/, '')}/api/trpc/${procedure}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`EasyPanel API ${procedure} falhou [${resp.status}]: ${text.substring(0, 300)}`);
  }
  try {
    const data = JSON.parse(text);
    return data?.result?.data?.json ?? data?.result?.data ?? data;
  } catch (_) {
    return text;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['master', 'super_admin', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { versao_nova, forcar = false } = payload;

    const easypanelUrl = Deno.env.get('EASYPANEL_URL');
    const easypanelToken = Deno.env.get('EASYPANEL_TOKEN');
    const easypanelProject = Deno.env.get('EASYPANEL_PROJECT');
    const easypanelService = Deno.env.get('EASYPANEL_SERVICE');

    if (!easypanelUrl || !easypanelToken || !easypanelProject || !easypanelService) {
      return Response.json({
        success: false,
        error: 'Secrets do EasyPanel não configurados. Configure EASYPANEL_URL, EASYPANEL_TOKEN, EASYPANEL_PROJECT e EASYPANEL_SERVICE.'
      }, { status: 400 });
    }

    // --- Proteção anti-loop: verificar último reinício ---
    const LOCK_KEY = 'easypanel_ultimo_restart';
    const LOCK_MINUTES = 15;
    let ultimoRestart = null;
    let lockId = null;
    try {
      const locks = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: LOCK_KEY });
      if (locks.length > 0) {
        ultimoRestart = locks[0].valor ? new Date(locks[0].valor) : null;
        lockId = locks[0].id;
      }
    } catch (_) {}

    if (!forcar && ultimoRestart) {
      const minutosPassados = (Date.now() - ultimoRestart.getTime()) / 60000;
      if (minutosPassados < LOCK_MINUTES) {
        const restante = Math.ceil(LOCK_MINUTES - minutosPassados);
        return Response.json({
          success: false,
          bloqueado: true,
          error: `Proteção anti-loop: último reinício foi há ${Math.floor(minutosPassados)} min. Aguarde ${restante} min ou use forcar=true.`,
          proximo_restart_em: restante
        });
      }
    }

    // --- Buscar versão mais recente se não informada ---
    let versaoAlvo = versao_nova;
    if (!versaoAlvo) {
      try {
        const resp = await fetch('https://wppconnect.io/whatsapp-versions/', {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CRM-Bot/1.0)' },
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const html = await resp.text();
          const matches = html.match(/(\d+\.\d+\.\d+[\.\d]*)/g);
          if (matches) {
            const versoes = matches.filter(v => v.startsWith('2.') && v.split('.').length >= 3);
            versoes.sort((a, b) => {
              const pa = a.split('.').map(Number);
              const pb = b.split('.').map(Number);
              for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const d = (pb[i] || 0) - (pa[i] || 0);
                if (d !== 0) return d;
              }
              return 0;
            });
            if (versoes.length > 0) versaoAlvo = versoes[0];
          }
        }
      } catch (_) {}
    }

    if (!versaoAlvo) {
      return Response.json({ success: false, error: 'Não foi possível detectar a versão mais recente.' }, { status: 400 });
    }

    // --- Versão anterior salva no banco ---
    let versaoAnterior = null;
    let versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) {
        versaoAnterior = configs[0].valor;
        versaoConfigId = configs[0].id;
      }
    } catch (_) {}

    const acoes = [];

    // --- Passo 1: Buscar configuração atual do serviço no EasyPanel ---
    let serviceConfig = null;
    try {
      serviceConfig = await easypanelCall(
        easypanelUrl, easypanelToken,
        'services.inspect',
        { projectName: easypanelProject, serviceName: easypanelService }
      );
      acoes.push({ acao: 'easypanel_inspect', sucesso: true });
      console.log('✅ Serviço inspecionado:', JSON.stringify(serviceConfig).substring(0, 300));
    } catch (e) {
      acoes.push({ acao: 'easypanel_inspect', sucesso: false, erro: e.message });
      console.error('❌ Erro ao inspecionar serviço:', e.message);
    }

    // --- Passo 2: Montar env vars atualizadas ---
    // Preservar todas as vars existentes, só substituir/adicionar as 3 do WhatsApp
    let envVarsAtuais = {};
    try {
      // O EasyPanel geralmente retorna as env vars em serviceConfig.env ou serviceConfig.source.env
      const envStr = serviceConfig?.env || serviceConfig?.source?.env || '';
      if (envStr) {
        envStr.split('\n').forEach(line => {
          const [k, ...v] = line.split('=');
          if (k?.trim()) envVarsAtuais[k.trim()] = v.join('=').trim();
        });
      }
    } catch (_) {}

    // Atualizar apenas as 3 variáveis do WhatsApp
    envVarsAtuais['CONFIG_SESSION_PHONE_VERSION'] = versaoAlvo;
    envVarsAtuais['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
    envVarsAtuais['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';

    // Reconstruir string de env vars
    const novaEnvStr = Object.entries(envVarsAtuais)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // --- Passo 3: Atualizar env vars no EasyPanel via tRPC ---
    let easypanelAtualizou = false;
    try {
      // Tentar endpoint de update de app service
      await easypanelCall(
        easypanelUrl, easypanelToken,
        'services.updateApp',
        {
          projectName: easypanelProject,
          serviceName: easypanelService,
          env: novaEnvStr,
        }
      );
      easypanelAtualizou = true;
      acoes.push({ acao: 'easypanel_update_env', sucesso: true });
      console.log('✅ Env vars atualizadas no EasyPanel');
    } catch (e) {
      acoes.push({ acao: 'easypanel_update_env', sucesso: false, erro: e.message });
      console.error('❌ Erro ao atualizar env:', e.message);

      // Fallback: tentar endpoint alternativo
      try {
        await easypanelCall(
          easypanelUrl, easypanelToken,
          'services.updateSource',
          {
            projectName: easypanelProject,
            serviceName: easypanelService,
            env: novaEnvStr,
          }
        );
        easypanelAtualizou = true;
        acoes.push({ acao: 'easypanel_update_source_env', sucesso: true });
      } catch (e2) {
        acoes.push({ acao: 'easypanel_update_source_env', sucesso: false, erro: e2.message });
      }
    }

    // --- Passo 4: Reiniciar serviço no EasyPanel ---
    let reiniciou = false;
    if (easypanelAtualizou) {
      try {
        await easypanelCall(
          easypanelUrl, easypanelToken,
          'services.redeploy',
          { projectName: easypanelProject, serviceName: easypanelService }
        );
        reiniciou = true;
        acoes.push({ acao: 'easypanel_redeploy', sucesso: true });
        console.log('✅ Serviço reiniciado via EasyPanel');
      } catch (e) {
        acoes.push({ acao: 'easypanel_redeploy', sucesso: false, erro: e.message });
        console.error('❌ Erro ao reiniciar:', e.message);

        // Fallback: restart sem redeploy
        try {
          await easypanelCall(
            easypanelUrl, easypanelToken,
            'services.restart',
            { projectName: easypanelProject, serviceName: easypanelService }
          );
          reiniciou = true;
          acoes.push({ acao: 'easypanel_restart', sucesso: true });
        } catch (e2) {
          acoes.push({ acao: 'easypanel_restart', sucesso: false, erro: e2.message });
        }
      }
    }

    // --- Passo 5: Salvar timestamp do reinício (lock anti-loop) ---
    if (reiniciou) {
      try {
        const agora = new Date().toISOString();
        if (lockId) {
          await base44.asServiceRole.entities.ConfiguracaoSistema.update(lockId, { valor: agora });
        } else {
          const novoLock = await base44.asServiceRole.entities.ConfiguracaoSistema.create({
            chave: LOCK_KEY,
            valor: agora,
            descricao: 'Timestamp do último restart do EasyPanel (proteção anti-loop)'
          });
          lockId = novoLock.id;
        }
      } catch (_) {}
    }

    // --- Passo 6: Aguardar Evolution subir e verificar instâncias ---
    let statusInstancias = [];
    if (reiniciou) {
      console.log('⏳ Aguardando serviço reiniciar (20s)...');
      await new Promise(r => setTimeout(r, 20000));

      const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
      const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

      if (evolutionUrl && evolutionKey) {
        // Tentar até 3 vezes
        for (let tentativa = 1; tentativa <= 3; tentativa++) {
          try {
            const resp = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
              headers: { 'apikey': evolutionKey },
              signal: AbortSignal.timeout(10000)
            });
            if (resp.ok) {
              const data = await resp.json();
              const instancias = Array.isArray(data) ? data : (data.instances || []);
              statusInstancias = instancias.map(inst => ({
                nome: inst.instance?.instanceName || inst.name || inst.instanceName,
                status: inst.instance?.status || inst.status || inst.state || 'unknown'
              }));
              console.log(`✅ Instâncias verificadas (tentativa ${tentativa}):`, statusInstancias);
              break;
            }
          } catch (_) {
            if (tentativa < 3) await new Promise(r => setTimeout(r, 5000));
          }
        }

        // Tentar reconectar instâncias desconectadas
        const desconectadas = statusInstancias.filter(i =>
          !['open', 'connected', 'CONNECTED'].includes(i.status)
        );
        for (const inst of desconectadas) {
          try {
            await fetch(`${evolutionUrl}/instance/connect/${inst.nome}`, {
              method: 'GET',
              headers: { 'apikey': evolutionKey },
              signal: AbortSignal.timeout(10000)
            });
            acoes.push({ acao: `reconectar_${inst.nome}`, sucesso: true });
            console.log(`🔄 Tentou reconectar: ${inst.nome}`);
          } catch (_) {}
        }
      }
    }

    // --- Passo 7: Salvar versão no banco ---
    try {
      if (versaoConfigId) {
        await base44.asServiceRole.entities.ConfiguracaoSistema.update(versaoConfigId, { valor: versaoAlvo });
      } else {
        await base44.asServiceRole.entities.ConfiguracaoSistema.create({
          chave: 'whatsapp_versao_configurada',
          valor: versaoAlvo,
          descricao: 'Versão do WhatsApp Web configurada na Evolution API'
        });
      }
    } catch (_) {}

    // --- Passo 8: Log no banco ---
    const instanciasConectadas = statusInstancias.filter(i =>
      ['open', 'connected', 'CONNECTED'].includes(i.status)
    );
    try {
      await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
        versao_anterior: versaoAnterior,
        versao_nova: versaoAlvo,
        status_antes: 'reiniciando',
        status_depois: JSON.stringify(statusInstancias),
        precisou_reiniciar: reiniciou,
        instancias_reconectadas: instanciasConectadas.length === statusInstancias.length && statusInstancias.length > 0,
        acao: 'atualizacao_automatica',
        sucesso: easypanelAtualizou,
        detalhes: JSON.stringify(acoes),
        erro: !easypanelAtualizou ? 'EasyPanel não atualizou as env vars' : null
      });
    } catch (_) {}

    // --- Passo 9: Notificar via Telegram ---
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (telegramToken && telegramChatId) {
      const icon = easypanelAtualizou ? '✅' : '⚠️';
      const msg = `${icon} *EasyPanel - Versão WhatsApp Atualizada*\n\n` +
        `• Versão anterior: \`${versaoAnterior || 'N/A'}\`\n` +
        `• Nova versão: \`${versaoAlvo}\`\n` +
        `• EasyPanel atualizou: ${easypanelAtualizou ? '✅ Sim' : '❌ Não'}\n` +
        `• Serviço reiniciado: ${reiniciou ? '✅ Sim' : '❌ Não'}\n` +
        `• Instâncias online: ${instanciasConectadas.length}/${statusInstancias.length}`;
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramChatId, text: msg, parse_mode: 'Markdown' })
      }).catch(() => {});
    }

    return Response.json({
      success: easypanelAtualizou,
      versao_anterior: versaoAnterior,
      versao_nova: versaoAlvo,
      easypanel_atualizou: easypanelAtualizou,
      reiniciou,
      instancias: statusInstancias,
      instancias_conectadas: instanciasConectadas.length,
      acoes,
      aviso: !easypanelAtualizou
        ? 'Não foi possível atualizar via EasyPanel API. Verifique o token e a URL do EasyPanel.'
        : null
    });

  } catch (error) {
    console.error('Erro crítico:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
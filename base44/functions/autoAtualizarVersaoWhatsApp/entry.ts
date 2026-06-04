/**
 * Automação: Verifica se há nova versão do WhatsApp Web e atualiza automaticamente
 * via EasyPanel API se a versão mudou. Roda a cada 10 minutos via scheduler.
 * Proteção anti-loop: não reinicia se já reiniciou nos últimos 15 min.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
  if (!resp.ok) throw new Error(`EasyPanel ${procedure} [${resp.status}]: ${text.substring(0, 200)}`);
  try {
    const data = JSON.parse(text);
    return data?.result?.data?.json ?? data?.result?.data ?? data;
  } catch (_) { return text; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const easypanelUrl = Deno.env.get('EASYPANEL_URL');
    const easypanelToken = Deno.env.get('EASYPANEL_TOKEN');
    const easypanelProject = Deno.env.get('EASYPANEL_PROJECT');
    const easypanelService = Deno.env.get('EASYPANEL_SERVICE');
    const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');

    // --- 1. Buscar versão mais recente ---
    let versaoRecente = null;
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
          if (versoes.length > 0) versaoRecente = versoes[0];
        }
      }
    } catch (_) {}

    if (!versaoRecente) {
      console.log('⚠️ Não foi possível buscar versão do WhatsApp Web');
      return Response.json({ success: false, motivo: 'Não foi possível buscar versão' });
    }

    // --- 2. Comparar com versão configurada ---
    let versaoAtual = null;
    let versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) {
        versaoAtual = configs[0].valor;
        versaoConfigId = configs[0].id;
      }
    } catch (_) {}

    console.log(`📊 Versão atual: ${versaoAtual} | Versão recente: ${versaoRecente}`);

    if (versaoAtual === versaoRecente) {
      console.log('✅ Versão já está atualizada. Nada a fazer.');
      return Response.json({ success: true, motivo: 'Versão já atualizada', versao: versaoRecente });
    }

    console.log(`🔄 Nova versão detectada: ${versaoAtual} → ${versaoRecente}`);

    // --- 3. Proteção anti-loop (15 min) ---
    const LOCK_KEY = 'easypanel_ultimo_restart';
    let ultimoRestart = null;
    let lockId = null;
    try {
      const locks = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: LOCK_KEY });
      if (locks.length > 0) {
        ultimoRestart = locks[0].valor ? new Date(locks[0].valor) : null;
        lockId = locks[0].id;
      }
    } catch (_) {}

    if (ultimoRestart) {
      const minutosPassados = (Date.now() - ultimoRestart.getTime()) / 60000;
      if (minutosPassados < 15) {
        const restante = Math.ceil(15 - minutosPassados);
        console.log(`🔒 Anti-loop: último restart há ${Math.floor(minutosPassados)} min. Aguardando ${restante} min.`);
        return Response.json({ success: false, motivo: `Anti-loop: aguardando ${restante} min`, bloqueado: true });
      }
    }

    // --- 4. Atualizar via EasyPanel (se configurado) ---
    let easypanelOk = false;
    if (easypanelUrl && easypanelToken && easypanelProject && easypanelService) {
      // Buscar config atual do serviço
      let envVarsAtuais = {};
      try {
        const serviceConfig = await easypanelCall(easypanelUrl, easypanelToken, 'services.inspect', {
          projectName: easypanelProject, serviceName: easypanelService
        });
        const envStr = serviceConfig?.env || serviceConfig?.source?.env || '';
        if (envStr) {
          envStr.split('\n').forEach(line => {
            const [k, ...v] = line.split('=');
            if (k?.trim()) envVarsAtuais[k.trim()] = v.join('=').trim();
          });
        }
      } catch (e) {
        console.warn('⚠️ Não conseguiu inspecionar serviço:', e.message);
      }

      envVarsAtuais['CONFIG_SESSION_PHONE_VERSION'] = versaoRecente;
      envVarsAtuais['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
      envVarsAtuais['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';

      const novaEnvStr = Object.entries(envVarsAtuais).map(([k, v]) => `${k}=${v}`).join('\n');

      // Tentar atualizar env e reiniciar
      try {
        await easypanelCall(easypanelUrl, easypanelToken, 'services.updateApp', {
          projectName: easypanelProject, serviceName: easypanelService, env: novaEnvStr
        });
        easypanelOk = true;
      } catch (e) {
        console.warn('⚠️ updateApp falhou, tentando updateSource:', e.message);
        try {
          await easypanelCall(easypanelUrl, easypanelToken, 'services.updateSource', {
            projectName: easypanelProject, serviceName: easypanelService, env: novaEnvStr
          });
          easypanelOk = true;
        } catch (_) {}
      }

      if (easypanelOk) {
        // Redeploy
        try {
          await easypanelCall(easypanelUrl, easypanelToken, 'services.redeploy', {
            projectName: easypanelProject, serviceName: easypanelService
          });
          console.log('✅ Serviço reiniciado via EasyPanel redeploy');
        } catch (_) {
          try {
            await easypanelCall(easypanelUrl, easypanelToken, 'services.restart', {
              projectName: easypanelProject, serviceName: easypanelService
            });
            console.log('✅ Serviço reiniciado via EasyPanel restart');
          } catch (e2) {
            console.warn('⚠️ Restart falhou:', e2.message);
          }
        }

        // Salvar lock
        try {
          const agora = new Date().toISOString();
          if (lockId) {
            await base44.asServiceRole.entities.ConfiguracaoSistema.update(lockId, { valor: agora });
          } else {
            await base44.asServiceRole.entities.ConfiguracaoSistema.create({
              chave: LOCK_KEY, valor: agora,
              descricao: 'Timestamp do último restart EasyPanel (anti-loop)'
            });
          }
        } catch (_) {}

        // Aguardar e reconectar instâncias
        if (evolutionUrl && evolutionKey) {
          await new Promise(r => setTimeout(r, 20000));
          let instancias = [];
          for (let t = 1; t <= 3; t++) {
            try {
              const resp = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
                headers: { 'apikey': evolutionKey }, signal: AbortSignal.timeout(10000)
              });
              if (resp.ok) {
                const data = await resp.json();
                instancias = (Array.isArray(data) ? data : (data.instances || [])).map(i => ({
                  nome: i.instance?.instanceName || i.name || i.instanceName,
                  status: i.instance?.status || i.status || i.state || 'unknown'
                }));
                break;
              }
            } catch (_) {
              if (t < 3) await new Promise(r => setTimeout(r, 5000));
            }
          }

          // Reconectar desconectadas
          for (const inst of instancias.filter(i => !['open', 'connected', 'CONNECTED'].includes(i.status))) {
            try {
              await fetch(`${evolutionUrl}/instance/connect/${inst.nome}`, {
                headers: { 'apikey': evolutionKey }, signal: AbortSignal.timeout(10000)
              });
              console.log(`🔄 Reconectando: ${inst.nome}`);
            } catch (_) {}
          }
        }
      }
    } else {
      console.log('⚠️ EasyPanel não configurado — apenas salvando versão no banco');
    }

    // --- 5. Salvar versão no banco ---
    try {
      if (versaoConfigId) {
        await base44.asServiceRole.entities.ConfiguracaoSistema.update(versaoConfigId, { valor: versaoRecente });
      } else {
        await base44.asServiceRole.entities.ConfiguracaoSistema.create({
          chave: 'whatsapp_versao_configurada', valor: versaoRecente,
          descricao: 'Versão do WhatsApp Web configurada na Evolution API'
        });
      }
    } catch (_) {}

    // --- 6. Log no banco ---
    try {
      await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
        versao_anterior: versaoAtual,
        versao_nova: versaoRecente,
        precisou_reiniciar: easypanelOk,
        acao: 'atualizacao_automatica',
        sucesso: true,
        detalhes: `EasyPanel: ${easypanelOk ? 'atualizou' : 'não configurado ou falhou'}`
      });
    } catch (_) {}

    // --- 7. Notificar Telegram ---
    if (telegramToken && telegramChatId) {
      const msg = `🤖 *Atualização Automática WhatsApp Web*\n\n` +
        `• Versão anterior: \`${versaoAtual || 'N/A'}\`\n` +
        `• Nova versão: \`${versaoRecente}\`\n` +
        `• EasyPanel: ${easypanelOk ? '✅ Atualizado e reiniciado' : '⚠️ Não configurado — verifique os secrets'}`;
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramChatId, text: msg, parse_mode: 'Markdown' })
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      versao_anterior: versaoAtual,
      versao_nova: versaoRecente,
      easypanel_atualizou: easypanelOk,
      atualizado_em: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro crítico:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
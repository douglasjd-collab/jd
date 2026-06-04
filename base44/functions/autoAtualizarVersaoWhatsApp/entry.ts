/**
 * Automação: Verifica versão do WhatsApp Web e atualiza via EasyPanel se mudou.
 * Roda a cada 10 minutos via scheduler. Proteção anti-loop de 15 min.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function epGet(baseUrl, token, path, queryInput = null) {
  let url = `${baseUrl.replace(/\/$/, '')}${path}`;
  if (queryInput !== null) url += `?input=${encodeURIComponent(JSON.stringify(queryInput))}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    signal: AbortSignal.timeout(15000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`EasyPanel GET ${path} [${resp.status}]: ${text.substring(0, 200)}`);
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
  if (!resp.ok) throw new Error(`EasyPanel POST ${path} [${resp.status}]: ${text.substring(0, 200)}`);
  const data = JSON.parse(text);
  return data?.result?.data?.json ?? data?.result?.data ?? data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const epUrl = Deno.env.get('EASYPANEL_URL');
    const epToken = Deno.env.get('EASYPANEL_TOKEN');
    const epProject = Deno.env.get('EASYPANEL_PROJECT');
    const epService = Deno.env.get('EASYPANEL_SERVICE');
    const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tgChat = Deno.env.get('TELEGRAM_CHAT_ID');

    // 1. Buscar versão mais recente
    let versaoRecente = null;
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
        if (versoes.length > 0) versaoRecente = versoes[0];
      }
    } catch (_) {}

    if (!versaoRecente) {
      console.log('⚠️ Não foi possível buscar versão');
      return Response.json({ success: false, motivo: 'Não foi possível buscar versão' });
    }

    // 2. Comparar com versão salva
    let versaoAtual = null, versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) { versaoAtual = configs[0].valor; versaoConfigId = configs[0].id; }
    } catch (_) {}

    console.log(`📊 Versão atual: ${versaoAtual} | Versão recente: ${versaoRecente}`);

    if (versaoAtual === versaoRecente) {
      console.log('✅ Versão já atualizada.');
      return Response.json({ success: true, motivo: 'Versão já atualizada', versao: versaoRecente });
    }

    // 3. Proteção anti-loop
    const LOCK_KEY = 'easypanel_ultimo_restart';
    let lockId = null, ultimoRestart = null;
    try {
      const locks = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: LOCK_KEY });
      if (locks.length > 0) { ultimoRestart = locks[0].valor ? new Date(locks[0].valor) : null; lockId = locks[0].id; }
    } catch (_) {}

    if (ultimoRestart) {
      const min = (Date.now() - ultimoRestart.getTime()) / 60000;
      if (min < 15) {
        console.log(`🔒 Anti-loop: aguardando ${Math.ceil(15 - min)} min`);
        return Response.json({ success: false, motivo: `Anti-loop: aguardando ${Math.ceil(15 - min)} min`, bloqueado: true });
      }
    }

    console.log(`🔄 Nova versão: ${versaoAtual} → ${versaoRecente}`);

    // 4. Atualizar via EasyPanel
    let easypanelOk = false;
    if (epUrl && epToken && epProject && epService) {
      // Buscar env vars atuais
      let envVarsAtuais = {};
      try {
        const serviceData = await epGet(epUrl, epToken, '/api/trpc/services.app.inspectService', {
          input: { json: { projectName: epProject, serviceName: epService } }
        });
        const envStr = serviceData?.env || serviceData?.source?.env || serviceData?.config?.env || '';
        if (envStr) {
          envStr.split('\n').forEach(line => {
            const [k, ...v] = line.split('=');
            if (k?.trim()) envVarsAtuais[k.trim()] = v.join('=').trim();
          });
        }
      } catch (e) { console.warn('⚠️ inspectService:', e.message); }

      envVarsAtuais['CONFIG_SESSION_PHONE_VERSION'] = versaoRecente;
      envVarsAtuais['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
      envVarsAtuais['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';
      const novaEnvStr = Object.entries(envVarsAtuais).map(([k, v]) => `${k}=${v}`).join('\n');

      try {
        await epPost(epUrl, epToken, '/api/trpc/services.app.updateEnv', {
          projectName: epProject, serviceName: epService, env: novaEnvStr
        });
        easypanelOk = true;
        console.log('✅ Env vars atualizadas');
      } catch (e) { console.error('❌ updateEnv:', e.message); }

      if (easypanelOk) {
        try {
          await epPost(epUrl, epToken, '/api/trpc/services.app.deployService', {
            projectName: epProject, serviceName: epService
          });
          console.log('✅ Deploy iniciado');
        } catch (e) { console.warn('⚠️ deployService:', e.message); }

        // Salvar lock
        try {
          const agora = new Date().toISOString();
          if (lockId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(lockId, { valor: agora });
          else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: LOCK_KEY, valor: agora, descricao: 'Timestamp último restart EasyPanel' });
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
            } catch (_) { if (t < 3) await new Promise(r => setTimeout(r, 5000)); }
          }
          for (const inst of instancias.filter(i => !['open', 'connected', 'CONNECTED'].includes(i.status))) {
            try { await fetch(`${evolutionUrl}/instance/connect/${inst.nome}`, { headers: { 'apikey': evolutionKey }, signal: AbortSignal.timeout(10000) }); } catch (_) {}
          }
        }
      }
    }

    // 5. Salvar versão no banco
    try {
      if (versaoConfigId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(versaoConfigId, { valor: versaoRecente });
      else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: 'whatsapp_versao_configurada', valor: versaoRecente, descricao: 'Versão WhatsApp Web' });
    } catch (_) {}

    // 6. Log
    try {
      await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
        versao_anterior: versaoAtual, versao_nova: versaoRecente, precisou_reiniciar: easypanelOk,
        acao: 'atualizacao_automatica', sucesso: true,
        detalhes: `EasyPanel: ${easypanelOk ? 'atualizou e reiniciou' : 'não configurado ou falhou'}`
      });
    } catch (_) {}

    // 7. Telegram
    if (tgToken && tgChat) {
      const msg = `🤖 *Atualização Automática WhatsApp Web*\n\n• Versão anterior: \`${versaoAtual || 'N/A'}\`\n• Nova versão: \`${versaoRecente}\`\n• EasyPanel: ${easypanelOk ? '✅ Atualizado e reiniciado' : '⚠️ Não configurado ou falhou'}`;
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: 'Markdown' })
      }).catch(() => {});
    }

    return Response.json({ success: true, versao_anterior: versaoAtual, versao_nova: versaoRecente, easypanel_atualizou: easypanelOk });

  } catch (error) {
    console.error('Erro crítico:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
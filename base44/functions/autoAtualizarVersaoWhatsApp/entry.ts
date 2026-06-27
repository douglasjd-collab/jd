/**
 * Automação: Verifica versão do WhatsApp Web e atualiza via EasyPanel se mudou.
 * Usa /api/rpc/ (não /api/trpc/) com Bearer token.
 * Lê env vars via listProjectsAndServices e faz patch via updateEnv.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function parseEnvStr(envStr) {
  const vars = {};
  if (!envStr) return vars;
  envStr.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const k = trimmed.substring(0, idx).trim();
    const v = trimmed.substring(idx + 1);
    if (k) vars[k] = v;
  });
  return vars;
}

function buildEnvStr(vars) {
  return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n');
}

async function lerEnvViaListServices(epUrl, epToken, epProject, epService) {
  const r = await fetch(`${epUrl.replace(/\/$/, '')}/api/rpc/projects/listProjectsAndServices`, {
    headers: { 'Authorization': `Bearer ${epToken}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`listProjectsAndServices retornou ${r.status}`);
  const data = await r.json();
  const services = data?.json?.services || [];
  const svc = services.find(s => s.name === epService && s.projectName === epProject);
  if (!svc) throw new Error(`Serviço "${epService}" não encontrado no projeto "${epProject}"`);
  return svc.env || '';
}

async function updateEnv(epUrl, epToken, epProject, epService, envStr) {
  const r = await fetch(`${epUrl.replace(/\/$/, '')}/api/rpc/services/app/updateEnv`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${epToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { projectName: epProject, serviceName: epService, env: envStr } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`updateEnv retornou ${r.status}: ${await r.text()}`);
  return true;
}

async function deployService(epUrl, epToken, epProject, epService) {
  const r = await fetch(`${epUrl.replace(/\/$/, '')}/api/rpc/services/app/deployService`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${epToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { projectName: epProject, serviceName: epService } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`deployService retornou ${r.status}: ${await r.text()}`);
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const epUrl = Deno.env.get('EASYPANEL_URL');
    const epToken = Deno.env.get('EASYPANEL_TOKEN');
    // Projeto e serviço fixos — o evolution-api fica sempre em supabase/evolution-api
    const epProject = 'supabase';
    const epService = 'evolution-api';
    const evolutionUrl = 'https://supabase-evolution-api.0ntuaf.easypanel.host';
    const evolutionKey = '429683C4C977415CAAFCCE10F7D57E11';
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tgChat = Deno.env.get('TELEGRAM_CHAT_ID');

    // 1. Buscar versão mais recente do WhatsApp Web
    let versaoRecente = null;
    const FONTES_VERSAO = [
      'https://wppconnect.io/pt-BR/whatsapp-versions/',
      'https://wppconnect.io/whatsapp-versions/',
    ];

    for (const url of FONTES_VERSAO) {
      if (versaoRecente) break;
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(15000)
        });
        if (!resp.ok) continue;
        const html = await resp.text();
        const matches = html.match(/\b(2\.\d{3,4}\.\d+(?:\.\d+)*(?:-[a-zA-Z0-9]+)?)\b/g) || [];
        const versoes = [...new Set(matches)].filter(v => v.split('.').length >= 3);
        const numBase = (v) => v.replace(/-.*$/, '').split('.').map(Number);
        versoes.sort((a, b) => {
          const pa = numBase(a), pb = numBase(b);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const d = (pb[i] || 0) - (pa[i] || 0);
            if (d !== 0) return d;
          }
          return 0;
        });
        if (versoes.length > 0) {
          versaoRecente = versoes[0];
          console.log(`✅ Versão detectada em ${url}: ${versaoRecente}`);
        }
      } catch (e) {
        console.warn(`⚠️ Falha ao buscar versão em ${url}: ${e.message}`);
      }
    }

    // Fallback: GitHub
    if (!versaoRecente) {
      try {
        const resp = await fetch('https://raw.githubusercontent.com/nicekiwi/whatsapp-web-versions/main/versions.json', { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) { versaoRecente = data[data.length - 1]; console.log(`✅ Versão do GitHub: ${versaoRecente}`); }
        }
      } catch (_) {}
    }

    if (!versaoRecente) {
      return Response.json({ success: false, motivo: 'Não foi possível buscar versão' });
    }

    // 2. Comparar com versão salva no banco
    let versaoAtual = null, versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) { versaoAtual = configs[0].valor; versaoConfigId = configs[0].id; }
    } catch (_) {}

    console.log(`📊 Versão banco: ${versaoAtual} | Versão recente: ${versaoRecente}`);

    const baseVersao = (v) => (v || '').replace(/-.*$/, '').trim();
    if (baseVersao(versaoAtual) === baseVersao(versaoRecente) && versaoAtual === versaoRecente) {
      return Response.json({ success: true, motivo: 'Versão já atualizada', versao: versaoRecente });
    }

    // 3. Proteção anti-loop (15 min)
    const LOCK_KEY = 'easypanel_ultimo_restart';
    let lockId = null, ultimoRestart = null;
    try {
      const locks = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: LOCK_KEY });
      if (locks.length > 0) { ultimoRestart = locks[0].valor ? new Date(locks[0].valor) : null; lockId = locks[0].id; }
    } catch (_) {}

    if (ultimoRestart) {
      const min = (Date.now() - ultimoRestart.getTime()) / 60000;
      if (min < 15) {
        return Response.json({ success: false, motivo: `Anti-loop: aguardando ${Math.ceil(15 - min)} min`, bloqueado: true });
      }
    }

    console.log(`🔄 Nova versão: ${versaoAtual} → ${versaoRecente}`);

    // 4. Atualizar via EasyPanel (endpoint /api/rpc/ com Bearer token)
    let easypanelOk = false;
    if (epUrl && epToken && epProject && epService) {
      try {
        // Ler env vars atuais via listProjectsAndServices
        console.log(`📖 Lendo env vars do serviço "${epService}" projeto "${epProject}"...`);
        const envStrAtual = await lerEnvViaListServices(epUrl, epToken, epProject, epService);
        const envVars = parseEnvStr(envStrAtual);
        const totalAntes = Object.keys(envVars).length;
        console.log(`✅ ${totalAntes} variáveis lidas`);

        // Patch: atualizar apenas as variáveis de versão
        envVars['CONFIG_SESSION_PHONE_VERSION'] = versaoRecente;
        envVars['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
        envVars['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';

        const novoEnvStr = buildEnvStr(envVars);
        await updateEnv(epUrl, epToken, epProject, epService, novoEnvStr);
        console.log(`✅ Env atualizada: CONFIG_SESSION_PHONE_VERSION=${versaoRecente}`);

        await deployService(epUrl, epToken, epProject, epService);
        console.log(`✅ Deploy iniciado`);
        easypanelOk = true;

        // Lock anti-loop
        const agora = new Date().toISOString();
        if (lockId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(lockId, { valor: agora });
        else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: LOCK_KEY, valor: agora, descricao: 'Timestamp último restart EasyPanel' });

        // Aguardar reinício e reconectar instâncias
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
      } catch (e) {
        console.error(`❌ Falha no EasyPanel: ${e.message}`);
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
      const msg = `🤖 *Atualização Automática WhatsApp Web*\n\n• Versão anterior: \`${versaoAtual || 'N/A'}\`\n• Nova versão: \`${versaoRecente}\`\n• EasyPanel: ${easypanelOk ? '✅ Atualizado e reiniciado' : '⚠️ Falhou'}`;
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
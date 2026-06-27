/**
 * Atualiza APENAS CONFIG_SESSION_PHONE_VERSION no EasyPanel.
 * Usa /api/rpc/ com Bearer token (descoberto via OpenAPI).
 * Lê env via listProjectsAndServices e faz patch via updateEnv.
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
  if (!svc) throw new Error(`Serviço "${epService}" não encontrado no projeto "${epProject}". Serviços disponíveis: ${services.filter(s=>s.projectName===epProject).map(s=>s.name).join(', ')}`);
  return svc.env || '';
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
    // Projeto e serviço fixos — o evolution-api fica sempre em supabase/evolution-api
    const epProject = 'supabase';
    const epService = 'evolution-api';

    if (!epUrl || !epToken) {
      return Response.json({ success: false, error: 'Secrets EASYPANEL_URL e EASYPANEL_TOKEN não configurados.' }, { status: 400 });
    }

    // MODO APENAS INSPECIONAR
    if (apenas_inspecionar) {
      const envStr = await lerEnvViaListServices(epUrl, epToken, epProject, epService);
      const vars = parseEnvStr(envStr);
      return Response.json({
        success: true,
        total_vars: Object.keys(vars).length,
        vars_config_session: {
          CONFIG_SESSION_PHONE_VERSION: vars['CONFIG_SESSION_PHONE_VERSION'] || null,
          CONFIG_SESSION_PHONE_NAME: vars['CONFIG_SESSION_PHONE_NAME'] || null,
          CONFIG_SESSION_PHONE_CLIENT: vars['CONFIG_SESSION_PHONE_CLIENT'] || null,
        },
        env_preview: envStr.substring(0, 500) + '...',
      });
    }

    // Proteção anti-loop
    const LOCK_KEY = 'easypanel_ultimo_restart';
    let lockId = null, ultimoRestart = null;
    try {
      const locks = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: LOCK_KEY });
      if (locks.length > 0) { ultimoRestart = locks[0].valor ? new Date(locks[0].valor) : null; lockId = locks[0].id; }
    } catch (_) {}

    if (!forcar && ultimoRestart) {
      const minutosPassados = (Date.now() - ultimoRestart.getTime()) / 60000;
      if (minutosPassados < 15) {
        return Response.json({ success: false, bloqueado: true, error: `Anti-loop: aguarde ${Math.ceil(15 - minutosPassados)} min ou use forcar=true.` });
      }
    }

    // Buscar versão mais recente se não informada
    let versaoAlvo = versao_nova;
    if (!versaoAlvo) {
      const FONTES = [
        'https://wppconnect.io/pt-BR/whatsapp-versions/',
        'https://wppconnect.io/whatsapp-versions/',
      ];
      for (const srcUrl of FONTES) {
        if (versaoAlvo) break;
        try {
          const resp = await fetch(srcUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
          if (versoes.length > 0) { versaoAlvo = versoes[0]; console.log(`✅ Versão detectada: ${versaoAlvo}`); }
        } catch (e) { console.warn(`⚠️ Falha ao buscar em ${srcUrl}: ${e.message}`); }
      }
      // Fallback GitHub
      if (!versaoAlvo) {
        try {
          const gr = await fetch('https://raw.githubusercontent.com/nicekiwi/whatsapp-web-versions/main/versions.json', { signal: AbortSignal.timeout(8000) });
          if (gr.ok) { const d = await gr.json(); if (Array.isArray(d) && d.length > 0) versaoAlvo = d[d.length - 1]; }
        } catch (_) {}
      }
    }
    if (!versaoAlvo) return Response.json({ success: false, error: 'Não foi possível detectar a versão mais recente.' }, { status: 400 });

    // Versão anterior no banco
    let versaoAnterior = null, versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) { versaoAnterior = configs[0].valor; versaoConfigId = configs[0].id; }
    } catch (_) {}

    // PASSO CRÍTICO: ler env vars atuais
    console.log(`📖 Lendo env vars do serviço "${epService}" projeto "${epProject}"...`);
    const envStrAtual = await lerEnvViaListServices(epUrl, epToken, epProject, epService);
    const envVarsAtuais = parseEnvStr(envStrAtual);
    const totalAntes = Object.keys(envVarsAtuais).length;
    console.log(`✅ ${totalAntes} variáveis lidas. CONFIG_SESSION_PHONE_VERSION atual: ${envVarsAtuais['CONFIG_SESSION_PHONE_VERSION'] || 'não definida'}`);

    if (envVarsAtuais['CONFIG_SESSION_PHONE_VERSION'] === versaoAlvo && !forcar) {
      return Response.json({ success: true, sem_mudanca: true, mensagem: `Versão ${versaoAlvo} já está configurada.`, versao_atual: versaoAlvo });
    }

    // Patch: atualizar apenas as 3 variáveis de versão
    const envVarsNovo = { ...envVarsAtuais };
    envVarsNovo['CONFIG_SESSION_PHONE_VERSION'] = versaoAlvo;
    envVarsNovo['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
    envVarsNovo['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';

    const totalDepois = Object.keys(envVarsNovo).length;
    if (totalDepois < totalAntes) {
      return Response.json({ success: false, abortado: true, error: `Segurança: antes=${totalAntes}, depois=${totalDepois}` }, { status: 500 });
    }

    const novaEnvStr = buildEnvStr(envVarsNovo);

    // Salvar env atualizada
    const updateResp = await fetch(`${epUrl.replace(/\/$/, '')}/api/rpc/services/app/updateEnv`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${epToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { projectName: epProject, serviceName: epService, env: novaEnvStr } }),
      signal: AbortSignal.timeout(15000)
    });
    if (!updateResp.ok) throw new Error(`updateEnv falhou: ${updateResp.status} ${await updateResp.text()}`);
    console.log(`✅ Env salva: ${totalDepois} vars, CONFIG_SESSION_PHONE_VERSION=${versaoAlvo}`);

    // Deploy
    let reiniciou = false;
    try {
      const deployResp = await fetch(`${epUrl.replace(/\/$/, '')}/api/rpc/services/app/deployService`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${epToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { projectName: epProject, serviceName: epService } }),
        signal: AbortSignal.timeout(15000)
      });
      reiniciou = deployResp.ok;
      console.log(`✅ Deploy iniciado`);
    } catch (e) { console.error('❌ deployService falhou:', e.message); }

    // Lock anti-loop
    if (reiniciou) {
      try {
        const agora = new Date().toISOString();
        if (lockId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(lockId, { valor: agora });
        else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: LOCK_KEY, valor: agora, descricao: 'Timestamp último restart EasyPanel' });
      } catch (_) {}
    }

    // Aguardar e verificar instâncias
    let statusInstancias = [];
    if (reiniciou) {
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
          try { await fetch(`${evolutionUrl}/instance/connect/${inst.nome}`, { headers: { 'apikey': evolutionKey }, signal: AbortSignal.timeout(10000) }); } catch (_) {}
        }
      }
    }

    // Salvar versão no banco
    try {
      if (versaoConfigId) await base44.asServiceRole.entities.ConfiguracaoSistema.update(versaoConfigId, { valor: versaoAlvo });
      else await base44.asServiceRole.entities.ConfiguracaoSistema.create({ chave: 'whatsapp_versao_configurada', valor: versaoAlvo, descricao: 'Versão WhatsApp Web configurada na Evolution API' });
    } catch (_) {}

    const instConectadas = statusInstancias.filter(i => ['open', 'connected', 'CONNECTED'].includes(i.status));

    // Log
    try {
      await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
        versao_anterior: versaoAnterior, versao_nova: versaoAlvo,
        precisou_reiniciar: reiniciou, instancias_reconectadas: instConectadas.length === statusInstancias.length && statusInstancias.length > 0,
        acao: 'atualizacao_automatica', sucesso: true,
        detalhes: JSON.stringify({ total_vars_preservadas: totalDepois, reiniciou, instancias: statusInstancias }),
      });
    } catch (_) {}

    // Telegram
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tgChat = Deno.env.get('TELEGRAM_CHAT_ID');
    if (tgToken && tgChat) {
      const msg = `✅ *EasyPanel - Versão WhatsApp Atualizada*\n\n• Versão anterior: \`${versaoAnterior || 'N/A'}\`\n• Nova versão: \`${versaoAlvo}\`\n• Variáveis preservadas: ${totalDepois}\n• Reiniciado: ${reiniciou ? '✅' : '❌'}\n• Instâncias online: ${instConectadas.length}/${statusInstancias.length}`;
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: 'Markdown' })
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      versao_anterior: versaoAnterior,
      versao_nova: versaoAlvo,
      total_vars_preservadas: totalDepois,
      reiniciou,
      instancias: statusInstancias,
      instancias_conectadas: instConectadas.length,
    });

  } catch (error) {
    console.error('Erro crítico:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
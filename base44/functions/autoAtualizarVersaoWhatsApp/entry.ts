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

// Lê env vars atuais tentando múltiplos formatos do endpoint tRPC EasyPanel.
// Retorna null se não conseguir ler pelo menos 5 variáveis (proteção).
async function lerEnvVarsAtuais(epUrl, epToken, epProject, epService) {
  const base = epUrl.replace(/\/$/, '');

  // Todas as variações de payload/endpoint conhecidas do EasyPanel
  const tentativas = [
    async () => {
      const url = `${base}/api/trpc/services.app.inspectService?input=${encodeURIComponent(JSON.stringify({ json: { projectName: epProject, serviceName: epService } }))}`;
      const resp = await fetch(url, { headers: { 'Content-Type': 'application/json', 'Authorization': epToken }, signal: AbortSignal.timeout(15000) });
      const raw = JSON.parse(await resp.text());
      const d = raw?.result?.data?.json ?? raw?.result?.data ?? raw;
      return d?.env || d?.source?.env || d?.config?.env || null;
    },
    async () => {
      const url = `${base}/api/trpc/services.app.inspectService?input=${encodeURIComponent(JSON.stringify({ projectName: epProject, serviceName: epService }))}`;
      const resp = await fetch(url, { headers: { 'Content-Type': 'application/json', 'Authorization': epToken }, signal: AbortSignal.timeout(15000) });
      const raw = JSON.parse(await resp.text());
      const d = raw?.result?.data?.json ?? raw?.result?.data ?? raw;
      return d?.env || d?.source?.env || d?.config?.env || null;
    },
    async () => {
      // POST direto
      const url = `${base}/api/trpc/services.app.inspectService`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': epToken },
        body: JSON.stringify({ json: { projectName: epProject, serviceName: epService } }),
        signal: AbortSignal.timeout(15000)
      });
      const raw = JSON.parse(await resp.text());
      const d = raw?.result?.data?.json ?? raw?.result?.data ?? raw;
      return d?.env || d?.source?.env || d?.config?.env || null;
    },
    async () => {
      // Endpoint alternativo apps.inspect
      const url = `${base}/api/trpc/apps.inspect?input=${encodeURIComponent(JSON.stringify({ json: { projectName: epProject, appName: epService } }))}`;
      const resp = await fetch(url, { headers: { 'Content-Type': 'application/json', 'Authorization': epToken }, signal: AbortSignal.timeout(15000) });
      const raw = JSON.parse(await resp.text());
      const d = raw?.result?.data?.json ?? raw?.result?.data ?? raw;
      return d?.env || d?.source?.env || null;
    },
    async () => {
      // Endpoint services.getService
      const url = `${base}/api/trpc/services.getService?input=${encodeURIComponent(JSON.stringify({ json: { projectName: epProject, serviceName: epService } }))}`;
      const resp = await fetch(url, { headers: { 'Content-Type': 'application/json', 'Authorization': epToken }, signal: AbortSignal.timeout(15000) });
      const raw = JSON.parse(await resp.text());
      const d = raw?.result?.data?.json ?? raw?.result?.data ?? raw;
      return d?.env || d?.source?.env || d?.config?.env || null;
    },
  ];

  for (let i = 0; i < tentativas.length; i++) {
    try {
      const envStr = await tentativas[i]();
      if (envStr && typeof envStr === 'string' && envStr.trim().length > 10) {
        const vars = parseEnvStr(envStr);
        if (Object.keys(vars).length >= 5) {
          console.log(`✅ Env lida na tentativa ${i + 1}: ${Object.keys(vars).length} variáveis`);
          return { envStr, vars };
        }
      }
    } catch (e) {
      console.warn(`⚠️ Tentativa leitura env ${i + 1} falhou: ${e.message}`);
    }
  }
  return null;
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

    // 1. Buscar versão mais recente (suporta formato com -alpha e sem)
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
        if (!resp.ok) { console.warn(`⚠️ ${url} retornou ${resp.status}`); continue; }
        const html = await resp.text();
        console.log(`📄 HTML de ${url}: ${html.length} bytes | preview: ${html.substring(0, 500)}`);

        // Regex mais amplo: captura versões como 2.3000.1042251103-alpha, 2.2346.12, etc.
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
          console.log(`✅ Versão detectada em ${url}: ${versaoRecente} | todas: ${versoes.slice(0, 5).join(', ')}`);
        }
      } catch (e) {
        console.warn(`⚠️ Falha ao buscar versão em ${url}: ${e.message}`);
      }
    }

    // Fallback 1: GitHub nicekiwi/whatsapp-web-versions
    if (!versaoRecente) {
      try {
        const resp = await fetch('https://raw.githubusercontent.com/nicekiwi/whatsapp-web-versions/main/versions.json', {
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            versaoRecente = data[data.length - 1];
            console.log(`✅ Versão do GitHub (nicekiwi): ${versaoRecente}`);
          }
        }
      } catch (e) { console.warn(`⚠️ GitHub nicekiwi falhou: ${e.message}`); }
    }

    // Fallback 2: API do próprio WhatsApp Web
    if (!versaoRecente) {
      try {
        const resp = await fetch('https://web.whatsapp.com/check-update?version=1&branch=RELEASE', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000)
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.currentVersion) { versaoRecente = data.currentVersion; console.log(`✅ Versão do WhatsApp Web direto: ${versaoRecente}`); }
        }
      } catch (_) {}
    }

    if (!versaoRecente) {
      console.log('⚠️ Não foi possível buscar versão em nenhuma fonte');
      return Response.json({ success: false, motivo: 'Não foi possível buscar versão' });
    }

    // 2. Comparar com versão salva
    let versaoAtual = null, versaoConfigId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'whatsapp_versao_configurada' });
      if (configs.length > 0) { versaoAtual = configs[0].valor; versaoConfigId = configs[0].id; }
    } catch (_) {}

    console.log(`📊 Versão salva no banco: ${versaoAtual} | Versão recente detectada: ${versaoRecente}`);

    // Compara versões ignorando sufixo -alpha/-beta para evitar loops
    const baseVersao = (v) => (v || '').replace(/-.*$/, '').trim();
    if (baseVersao(versaoAtual) === baseVersao(versaoRecente) && versaoAtual === versaoRecente) {
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
      // PASSO CRÍTICO: ler env vars atuais. Se falhar → ABORTAR (não sobrescrever nada).
      const leituraAtual = await lerEnvVarsAtuais(epUrl, epToken, epProject, epService);
      if (!leituraAtual) {
        const msg = '🛑 ABORTADO: não foi possível ler as variáveis de ambiente atuais. Operação cancelada para proteger o Evolution API.';
        console.error(msg);
        try {
          await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
            versao_anterior: versaoAtual, versao_nova: versaoRecente,
            acao: 'alerta_falha', sucesso: false, erro: msg
          });
        } catch (_) {}
        return Response.json({ success: false, abortado: true, error: msg }, { status: 500 });
      }

      const envVarsAtuais = leituraAtual.vars;
      const totalVarsAntes = Object.keys(envVarsAtuais).length;

      // PATCH: atualizar SOMENTE as 3 variáveis de versão, preservando todas as outras
      const envVarsNovo = { ...envVarsAtuais };
      envVarsNovo['CONFIG_SESSION_PHONE_VERSION'] = versaoRecente;
      envVarsNovo['CONFIG_SESSION_PHONE_NAME'] = 'Chrome';
      envVarsNovo['CONFIG_SESSION_PHONE_CLIENT'] = 'Evolution API';
      const totalVarsDepois = Object.keys(envVarsNovo).length;

      // VERIFICAÇÃO DE SEGURANÇA: nunca pode remover variáveis
      if (totalVarsDepois < totalVarsAntes) {
        const msg = `🛑 ABORTADO: verificação de segurança falhou (antes: ${totalVarsAntes}, depois: ${totalVarsDepois}).`;
        console.error(msg);
        return Response.json({ success: false, abortado: true, error: msg }, { status: 500 });
      }

      const novaEnvStr = buildEnvStr(envVarsNovo);

      try {
        await epPost(epUrl, epToken, '/api/trpc/services.app.updateEnv', {
          projectName: epProject, serviceName: epService, env: novaEnvStr
        });
        easypanelOk = true;
        console.log(`✅ Env salva: ${totalVarsDepois} vars preservadas, CONFIG_SESSION_PHONE_VERSION=${versaoRecente}`);
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
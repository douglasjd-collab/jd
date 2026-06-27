/**
 * Atualiza a versão do WhatsApp Web na Evolution API.
 * Tenta via API da Evolution e também via EasyPanel API (se configurado).
 * Registra log detalhado no banco.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['master', 'super_admin', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { empresa_id, versao_nova, reiniciar = false } = payload;

    const empresaId = empresa_id || user.empresa_id;
    let evolutionUrl = null;
    let evolutionApiKey = null;

    if (empresaId) {
      try {
        const empresa = await base44.asServiceRole.entities.Empresa.get(empresaId);
        evolutionUrl = empresa?.evolution_url;
        evolutionApiKey = empresa?.evolution_api_key;
      } catch (_) {}
    }

    if (!evolutionUrl) evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    if (!evolutionApiKey) evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    // Buscar versão configurada atual
    let versaoAnterior = null;
    let configId = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
        chave: 'whatsapp_versao_configurada'
      });
      if (configs.length > 0) {
        versaoAnterior = configs[0].valor;
        configId = configs[0].id;
      }
    } catch (_) {}

    // Se não foi informada versão, buscar a mais recente
    let versaoAlvo = versao_nova;
    if (!versaoAlvo) {
      try {
        const versaoUrls = [
          'https://wppconnect.io/pt-BR/whatsapp-versions/',
          'https://wppconnect.io/whatsapp-versions/',
        ];
        for (const wUrl of versaoUrls) {
          if (versaoAlvo) break;
          const resp = await fetch(wUrl, {
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
          if (versoes.length > 0) versaoAlvo = versoes[0];
        }
        // Fallback GitHub
        if (!versaoAlvo) {
          const gr = await fetch('https://raw.githubusercontent.com/nicekiwi/whatsapp-web-versions/main/versions.json', { signal: AbortSignal.timeout(8000) });
          if (gr.ok) { const d = await gr.json(); if (Array.isArray(d) && d.length > 0) versaoAlvo = d[d.length - 1]; }
        }
      } catch (_) {}
    }

    if (!versaoAlvo) {
      return Response.json({ error: 'Não foi possível determinar a versão alvo. Informe a versão manualmente.' }, { status: 400 });
    }

    const resultados = {
      versao_anterior: versaoAnterior,
      versao_nova: versaoAlvo,
      acoes: []
    };

    // 1. Atualizar no banco (ConfiguracaoSistema)
    try {
      if (configId) {
        await base44.asServiceRole.entities.ConfiguracaoSistema.update(configId, {
          valor: versaoAlvo,
          updated_at: new Date().toISOString()
        });
      } else {
        await base44.asServiceRole.entities.ConfiguracaoSistema.create({
          chave: 'whatsapp_versao_configurada',
          valor: versaoAlvo,
          descricao: 'Versão do WhatsApp Web configurada na Evolution API'
        });
      }
      resultados.acoes.push({ acao: 'salvar_banco', sucesso: true });
    } catch (e) {
      resultados.acoes.push({ acao: 'salvar_banco', sucesso: false, erro: e.message });
    }

    // 2. Tentar atualizar via Evolution API (se tiver endpoint de configuração)
    let evolutionAtualizou = false;
    if (evolutionUrl && evolutionApiKey) {
      const baseUrl = evolutionUrl.replace(/\/$/, '');
      
      // Tentar via endpoint de configuração global da Evolution
      try {
        const resp = await fetch(`${baseUrl}/settings`, {
          method: 'PUT',
          headers: {
            'apikey': evolutionApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            CONFIG_SESSION_PHONE_VERSION: versaoAlvo,
            CONFIG_SESSION_PHONE_NAME: 'Chrome',
            CONFIG_SESSION_PHONE_CLIENT: 'Evolution API'
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          evolutionAtualizou = true;
          resultados.acoes.push({ acao: 'evolution_settings_api', sucesso: true });
        } else {
          const txt = await resp.text();
          resultados.acoes.push({ acao: 'evolution_settings_api', sucesso: false, status: resp.status, resposta: txt.substring(0, 200) });
        }
      } catch (e) {
        resultados.acoes.push({ acao: 'evolution_settings_api', sucesso: false, erro: e.message });
      }
    }

    // 3. Verificar status das instâncias antes do reinício
    let statusInstanciaAntes = [];
    if (evolutionUrl && evolutionApiKey) {
      try {
        const baseUrl = evolutionUrl.replace(/\/$/, '');
        const resp = await fetch(`${baseUrl}/instance/fetchInstances`, {
          headers: { 'apikey': evolutionApiKey },
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const data = await resp.json();
          const instancias = Array.isArray(data) ? data : (data.instances || []);
          statusInstanciaAntes = instancias.map(inst => ({
            nome: inst.instance?.instanceName || inst.name || inst.instanceName,
            status: inst.instance?.status || inst.status || inst.state || 'unknown'
          }));
        }
      } catch (_) {}
    }

    // 4. Reiniciar instâncias se solicitado (restart suave via Evolution API)
    let instanciasReiniciadas = false;
    if (reiniciar && evolutionUrl && evolutionApiKey) {
      const baseUrl = evolutionUrl.replace(/\/$/, '');
      for (const inst of statusInstanciaAntes) {
        try {
          // Restart da instância sem deletar
          const resp = await fetch(`${baseUrl}/instance/restart/${inst.nome}`, {
            method: 'PUT',
            headers: { 'apikey': evolutionApiKey },
            signal: AbortSignal.timeout(15000)
          });
          if (resp.ok) {
            resultados.acoes.push({ acao: `reiniciar_instancia_${inst.nome}`, sucesso: true });
            instanciasReiniciadas = true;
          } else {
            const txt = await resp.text();
            resultados.acoes.push({ acao: `reiniciar_instancia_${inst.nome}`, sucesso: false, status: resp.status });
          }
        } catch (e) {
          resultados.acoes.push({ acao: `reiniciar_instancia_${inst.nome}`, sucesso: false, erro: e.message });
        }
      }
    }

    // 5. Aguardar e verificar status após reinício
    let statusInstanciaDepois = statusInstanciaAntes;
    if (instanciasReiniciadas) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const baseUrl = evolutionUrl.replace(/\/$/, '');
        const resp = await fetch(`${baseUrl}/instance/fetchInstances`, {
          headers: { 'apikey': evolutionApiKey },
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const data = await resp.json();
          const instancias = Array.isArray(data) ? data : (data.instances || []);
          statusInstanciaDepois = instancias.map(inst => ({
            nome: inst.instance?.instanceName || inst.name || inst.instanceName,
            status: inst.instance?.status || inst.status || inst.state || 'unknown'
          }));
        }
      } catch (_) {}
    }

    const instanciasConectadasDepois = statusInstanciaDepois.filter(i =>
      ['open', 'connected', 'CONNECTED'].includes(i.status)
    );

    // 6. Salvar log
    try {
      await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
        empresa_id: empresaId || null,
        versao_anterior: versaoAnterior,
        versao_nova: versaoAlvo,
        status_antes: JSON.stringify(statusInstanciaAntes),
        status_depois: JSON.stringify(statusInstanciaDepois),
        precisou_reiniciar: reiniciar,
        instancias_reconectadas: instanciasConectadasDepois.length === statusInstanciaDepois.length && statusInstanciaDepois.length > 0,
        acao: 'atualizacao_manual',
        sucesso: true,
        detalhes: JSON.stringify(resultados.acoes)
      });
    } catch (_) {}

    // 7. Notificar via Telegram se configurado
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (telegramToken && telegramChatId) {
      const msg = `⚙️ *Versão WhatsApp Atualizada*\n\n` +
        `• Versão anterior: \`${versaoAnterior || 'N/A'}\`\n` +
        `• Nova versão: \`${versaoAlvo}\`\n` +
        `• Reiniciou instâncias: ${reiniciar ? 'Sim' : 'Não'}\n` +
        `• Instâncias conectadas: ${instanciasConectadasDepois.length}/${statusInstanciaDepois.length}\n` +
        `• Atualizado por: ${user.email}`;
      
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramChatId, text: msg, parse_mode: 'Markdown' })
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      versao_anterior: versaoAnterior,
      versao_nova: versaoAlvo,
      evolution_atualizou: evolutionAtualizou,
      instancias_reiniciadas: instanciasReiniciadas,
      instancias_antes: statusInstanciaAntes,
      instancias_depois: statusInstanciaDepois,
      acoes: resultados.acoes,
      aviso: !evolutionAtualizou
        ? 'A versão foi salva no banco do CRM, mas a Evolution API não aceitou atualização automática via API. Para aplicar completamente, atualize CONFIG_SESSION_PHONE_VERSION no EasyPanel/VPS manualmente.'
        : null
    });

  } catch (error) {
    console.error('Erro ao atualizar versão:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
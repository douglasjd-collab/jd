import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { empresa_id } = body;

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Buscar empresa pelo ID
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id }, null, 1);
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    if (!evolutionUrl || !instanceName) {
      return Response.json({ 
        error: 'URL ou instância Evolution não configurada na empresa',
        evolutionUrl, instanceName
      }, { status: 400 });
    }

    // A evolution_api_key da empresa pode ser a key da instância (não a global).
    // Tentar primeiro com a key da empresa, se falhar usar a global (EVOLUTION_API_KEY)
    const globalApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';

    const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${encodeURIComponent(instanceName)}`;

    console.log(`🔧 Configurando webhook para ${empresa.nome} | instância: ${instanceName}`);
    console.log(`🔗 URL: ${webhookUrl}`);
    console.log(`🌐 Evolution: ${evolutionUrl}`);

    // Tentar com ambas as keys — primeiro a da empresa, depois a global
    const keysParaTentar = [];
    if (evolutionKey) keysParaTentar.push({ key: evolutionKey, label: 'empresa' });
    if (globalApiKey && globalApiKey !== evolutionKey) keysParaTentar.push({ key: globalApiKey, label: 'global' });

    // Descobrir qual key funciona
    let keyFuncional = null;
    let webhookAtual = null;
    for (const { key, label } of keysParaTentar) {
      try {
        const resCheck = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
          headers: { 'apikey': key }
        });
        if (resCheck.ok) {
          webhookAtual = await resCheck.json();
          keyFuncional = key;
          console.log(`✅ Key funcional: ${label} | Webhook atual:`, JSON.stringify(webhookAtual));
          break;
        } else {
          console.log(`⚠️ Key ${label} retornou ${resCheck.status}`);
        }
      } catch (e) {
        console.warn(`Erro com key ${label}:`, e.message);
      }
    }

    if (!keyFuncional) {
      return Response.json({
        error: 'Nenhuma API key funcionou. Verifique as credenciais.',
        evolutionUrl, instanceName,
        keysTestadas: keysParaTentar.map(k => k.label)
      }, { status: 401 });
    }

    // Configurar webhook com a key que funciona
    const payload = {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_ACK',
        'MESSAGE_ACK'
      ]
    };

    const resSet = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': keyFuncional, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resSetText = await resSet.text();
    let resSetJson = null;
    try { resSetJson = JSON.parse(resSetText); } catch (_) { resSetJson = { raw: resSetText }; }

    console.log(`📤 Resposta configurar webhook: ${resSet.status}`, JSON.stringify(resSetJson));

    // Verificar se foi configurado corretamente
    let webhookFinal = null;
    try {
      const resVerify = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
        headers: { 'apikey': keyFuncional }
      });
      if (resVerify.ok) {
        webhookFinal = await resVerify.json();
      }
    } catch (e) {}

    const urlConfigurada = webhookFinal?.url || webhookFinal?.webhook?.url || '';
    const configuradoCorretamente = urlConfigurada.includes(instanceName);

    return Response.json({
      success: resSet.ok,
      empresa: empresa.nome,
      instancia: instanceName,
      webhook_url: webhookUrl,
      status_http: resSet.status,
      resposta: resSetJson,
      webhook_antes: webhookAtual,
      webhook_depois: webhookFinal,
      url_configurada: urlConfigurada,
      configurado_corretamente: configuradoCorretamente
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
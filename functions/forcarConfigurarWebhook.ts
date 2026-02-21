import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;

    if (!empresaId) {
      return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    }

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    console.log(`🏢 Empresa: ${empresa.nome} | Instance: ${instanceName}`);

    const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    // Deletar webhook existente primeiro
    try {
      const delResp = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
        method: 'DELETE',
        headers: { 'apikey': apiKey }
      });
      console.log(`🗑️ DELETE webhook status: ${delResp.status}`);
    } catch (e) {
      console.log(`⚠️ Erro ao deletar webhook (pode ser normal): ${e.message}`);
    }

    // Recriar webhook com configuração correta (formato Evolution API v2)
    const webhookPayload = {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false, // DESATIVAR Base64 para receber JSON puro
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE"
        ]
      }
    };

    console.log(`📡 Configurando webhook: ${webhookUrl}`);
    console.log(`📦 Payload: ${JSON.stringify(webhookPayload)}`);

    const setResp = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });

    const setResult = await setResp.json();
    console.log(`✅ Resultado configuração: ${JSON.stringify(setResult)}`);

    // Verificar webhook configurado
    const findResp = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const findResult = await findResp.json();
    console.log(`🔍 Webhook atual: ${JSON.stringify(findResult)}`);

    return Response.json({
      sucesso: true,
      webhook_configurado: webhookUrl,
      resultado_set: setResult,
      webhook_atual: findResult
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
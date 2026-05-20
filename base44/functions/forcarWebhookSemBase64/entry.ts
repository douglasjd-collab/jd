import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['super_admin', 'master', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar empresa JD PROMOTORA
    const empresas = await base44.entities.Empresa.filter({ nome: { $regex: 'JD PROMOTORA' } });
    if (!empresas?.length) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionApiKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

    const headers = { 'Content-Type': 'application/json', 'apikey': evolutionApiKey };
    const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    const events = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'SEND_MESSAGE', 'CONNECTION_UPDATE', 'CONTACTS_UPSERT', 'CHATS_UPSERT'];

    const logs = [];

    // Passo 1: Tentar via PUT (alguns versions da Evolution usam PUT para update)
    try {
      const resPut = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ webhook: { url: webhookUrl, enabled: true, webhookBase64: false, webhookByEvents: false, events } })
      });
      const putResult = await resPut.json().catch(() => ({}));
      logs.push({ step: 'PUT /webhook/set', status: resPut.status, result: putResult });
    } catch (e) { logs.push({ step: 'PUT error', error: e.message }); }

    // Passo 2: Verificar resultado atual
    const resFinal = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, { headers: { 'apikey': evolutionApiKey } });
    const finalWebhook = await resFinal.json().catch(() => ({}));
    logs.push({ step: 'verificação final', status: resFinal.status, webhookBase64: finalWebhook?.webhookBase64, url: finalWebhook?.url, events: finalWebhook?.events?.length });

    // Passo 3: Independente do resultado, testar se o webhook está recebendo AGORA
    // Enviar mensagem de teste direto para o endpoint
    const testPayload = {
      event: 'messages.upsert',
      instance: instanceName,
      data: {
        key: { remoteJid: '558781184956@s.whatsapp.net', fromMe: false, id: `WEBHOOK_TEST_${Date.now()}` },
        pushName: 'Teste Webhook',
        message: { conversation: 'Teste conectividade webhook' },
        messageType: 'conversation',
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    };

    const resTest = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const testResult = await resTest.json().catch(() => ({}));
    logs.push({ step: 'teste webhook', status: resTest.status, result: testResult });

    return Response.json({ 
      success: true, 
      webhookBase64_atual: finalWebhook?.webhookBase64,
      url_ativa: evolutionUrl,
      instance: instanceName,
      logs 
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});
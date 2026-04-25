import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const EVOLUTION_URL = 'https://jdpromotora.0ntuaf.easypanel.host';
    const EVOLUTION_KEY = '72F05FA223C5-437A-B07B-31CEE2921192';
    const INSTANCE = 'JDPROMOTORA';
    const WEBHOOK_CORRETO = 'https://app--waze-crm.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=JDPROMOTORA';

    // Verificar webhook atual
    const checkResp = await fetch(`${EVOLUTION_URL}/webhook/find/${INSTANCE}`, {
      headers: { 'apikey': EVOLUTION_KEY }
    });
    const checkData = await checkResp.json();
    const webhookAtual = checkData?.url || checkData?.webhook?.url || '';
    console.log('Webhook atual:', webhookAtual);

    // Configurar webhook correto (formato Evolution API v2)
    const setResp = await fetch(`${EVOLUTION_URL}/webhook/set/${INSTANCE}`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: WEBHOOK_CORRETO,
          byEvents: false,
          base64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE'
          ]
        }
      })
    });
    const setData = await setResp.json();
    console.log('Resultado configuração:', JSON.stringify(setData));

    // Verificar novamente
    const verifyResp = await fetch(`${EVOLUTION_URL}/webhook/find/${INSTANCE}`, {
      headers: { 'apikey': EVOLUTION_KEY }
    });
    const verifyData = await verifyResp.json();

    return Response.json({
      success: setResp.ok,
      webhook_anterior: webhookAtual,
      webhook_novo: WEBHOOK_CORRETO,
      resultado: setData,
      verificacao_final: verifyData
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
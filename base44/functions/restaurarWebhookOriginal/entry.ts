import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    
    const evolutionUrl = empresa.evolution_url?.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    const ORIGINAL_URL = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    const body = {
      webhook: {
        url: ORIGINAL_URL,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"],
        enabled: true
      }
    };

    const res = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await res.json();
    console.log('Webhook RESTAURADO:', JSON.stringify(result));

    return Response.json({ 
      ok: true, 
      url_restaurada: ORIGINAL_URL,
      webhookBase64_solicitado: false,
      resultado: result 
    });
  } catch (e) {
    return Response.json({ erro: e.message }, { status: 500 });
  }
});
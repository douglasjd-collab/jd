import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Pega a URL do domínio do request
    const url = new URL(req.url);
    const appDomain = url.hostname;
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'TESTEWAZE';
    
    const webhookUrl = `https://${appDomain}/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    
    return Response.json({
      webhookUrl,
      appDomain,
      instanceName
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
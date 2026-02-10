Deno.serve(async (req) => {
  try {
    // Pega a URL do domínio do request
    const url = new URL(req.url);
    const appDomain = url.hostname;
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const apiKey = Deno.env.get('EVOLUTION_API_KEY') ? '***' : '';
    
    const webhookUrl = `https://${appDomain}/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    
    return Response.json({
      webhookUrl,
      appDomain,
      instanceName,
      evolutionUrl,
      apiKey
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
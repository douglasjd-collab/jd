import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // Obter credenciais
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY') || '';
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'TESTEWAZE';

    // Construir URL do webhook - PADRÃO DO DEPLOYMENT
    const currentUrl = new URL(req.url);
    const baseUrl = `${currentUrl.protocol}//${currentUrl.host}`;
    const webhookUrl = `${baseUrl}/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    console.log('Base URL do deployment:', baseUrl);
    console.log('Webhook URL gerada:', webhookUrl);
    console.log('Instance Name:', instanceName);

    return Response.json({
      webhookUrl: webhookUrl,
      evolutionUrl: evolutionUrl,
      instanceName: instanceName,
      apiKey: evolutionKey,
      deployment_host: currentUrl.host
    });

  } catch (error) {
    console.error('Erro ao obter webhook URL:', error);
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});
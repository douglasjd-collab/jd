import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    console.log('🔧 Iniciando configuração automática do webhook...');

    // Obter credenciais do ambiente
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'TESTEWAZE';

    if (!evolutionUrl || !evolutionKey) {
      throw new Error('Credenciais da Evolution API não configuradas');
    }

    console.log('Evolution URL:', evolutionUrl);
    console.log('Instance Name:', instanceName);
    console.log('API Key:', evolutionKey ? '***configurada***' : 'não configurada');

    // Construir URL do webhook
    const currentUrl = new URL(req.url);
    const baseUrl = `${currentUrl.protocol}//${currentUrl.host}`;
    const webhookUrl = `${baseUrl}/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    console.log('Webhook URL a configurar:', webhookUrl);

    // Atualizar webhook na Evolution API
    const response = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey
      },
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE'
        ]
      })
    });

    console.log('Status da resposta Evolution:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da Evolution API:', errorText);
      throw new Error(`Erro ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Webhook configurado:', result);

    return Response.json({
      success: true,
      webhook_url: webhookUrl,
      evolution_response: result
    });

  } catch (error) {
    console.error('❌ Erro ao configurar webhook:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
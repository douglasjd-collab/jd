Deno.serve(async (req) => {
  try {
    // A URL correta é a URL desta própria função deployment
    const currentUrl = new URL(req.url);
    const baseUrl = `${currentUrl.protocol}//${currentUrl.host}`;
    
    // Construir URL do webhook
    const webhookUrl = `${baseUrl}/functions/receberWebhookWhatsApp?instance=TESTEWAZE`;
    
    console.log('URL Base do deployment:', baseUrl);
    console.log('URL do webhook:', webhookUrl);
    
    return Response.json({
      success: true,
      webhook_url: webhookUrl,
      base_url: baseUrl,
      deployment_info: {
        protocol: currentUrl.protocol,
        host: currentUrl.host,
        origin: currentUrl.origin
      }
    });
    
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
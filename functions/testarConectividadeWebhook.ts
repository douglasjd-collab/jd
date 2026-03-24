Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.log('🔍 TESTANDO CONECTIVIDADE DO WEBHOOK');
  console.log('='.repeat(80));
  
  try {
    const webhookUrl = 'https://appjdpromorora.base44.app/_functions/receberWebhookWhatsApp?instance=JD%20Promotora%20conta%20Super%20adm';
    
    console.log(`📍 URL webhook: ${webhookUrl}`);
    console.log(`🕐 Hora do teste: ${timestamp}`);
    
    // Simular uma mensagem do WhatsApp
    const testPayload = {
      event: 'messages.upsert',
      instance: 'JD Promotora conta Super adm',
      data: {
        key: {
          id: 'test-message-' + Date.now(),
          fromMe: false,
          remoteJid: '5585987654321'
        },
        message: {
          conversation: '🔍 Teste de conectividade - ' + timestamp
        },
        pushName: 'Teste Webhook',
        senderName: 'Teste'
      }
    };
    
    console.log('📤 Enviando payload de teste...');
    console.log(JSON.stringify(testPayload, null, 2));
    
    // Fazer requisição para o webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });
    
    const responseText = await response.text();
    
    console.log(`✅ Status da resposta: ${response.status}`);
    console.log(`📥 Resposta do webhook: ${responseText}`);
    
    let responseData = {};
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText };
    }
    
    return Response.json({
      success: response.ok,
      status: response.status,
      webhook_url: webhookUrl,
      test_timestamp: timestamp,
      resposta_webhook: responseData,
      diagnostico: {
        webhook_acessivel: response.ok,
        status_code: response.status,
        mensagem: response.ok 
          ? '✅ Webhook está acessível e respondendo!' 
          : '❌ Webhook não respondeu corretamente'
      }
    });
    
  } catch (error) {
    console.error('❌ ERRO ao testar webhook:', error.message);
    console.error('Stack:', error.stack);
    
    return Response.json({
      success: false,
      error: error.message,
      diagnostico: {
        webhook_acessivel: false,
        mensagem: '❌ Erro ao alcançar o webhook. O Evolution API pode não conseguir acessar a URL.',
        dica: 'Verifique se a URL pública está correta e acessível na internet.'
      }
    }, { status: 500 });
  }
});
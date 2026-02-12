import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('🧪 TESTE DE WEBHOOK MANUAL');
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Simular mensagem recebida
    const testPayload = {
      event: 'messages.upsert',
      instance: 'TESTEWAZE',
      data: {
        key: {
          remoteJid: '558781194149@s.whatsapp.net',
          fromMe: false,
          id: `TEST_${Date.now()}`
        },
        pushName: 'Cliente Teste',
        message: {
          conversation: `Teste manual ${new Date().toLocaleTimeString('pt-BR')}`
        }
      }
    };
    
    console.log('📤 Enviando payload de teste:', JSON.stringify(testPayload, null, 2));
    
    // Chamar o webhook localmente
    const webhookUrl = `${new URL(req.url).origin}/functions/receberWebhookWhatsApp`;
    console.log('🎯 URL do webhook:', webhookUrl);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization') || ''
      },
      body: JSON.stringify(testPayload)
    });
    
    const result = await response.json();
    
    console.log('✅ Resposta do webhook:', result);
    
    return Response.json({
      success: true,
      message: 'Teste executado',
      webhookResponse: result,
      testPayload
    });
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    console.log('='.repeat(80));
    console.log('[TESTE] Iniciando teste do webhook WhatsApp');
    console.log('[TESTE] Usuário:', user?.email);

    // Obter parâmetros
    const url = new URL(req.url);
    const telefone = url.searchParams.get('telefone') || '5581999999999';

    console.log('[TESTE] Telefone:', telefone);

    // Simular payload da Evolution API
    const payloadSimulado = {
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: telefone + '@s.whatsapp.net',
          fromMe: false,
          id: 'TEST_MSG_' + Date.now()
        },
        message: {
          conversation: '🧪 Mensagem de teste - ' + new Date().toLocaleString('pt-BR')
        },
        pushName: 'Cliente Teste',
        messageTimestamp: Date.now()
      }
    };

    console.log('[TESTE] Payload:', JSON.stringify(payloadSimulado, null, 2));

    // Chamar o webhook interno
    const webhookUrl = 'https://windy-sheep-96-y3gedbkzg1xs.deno.dev/functions/receberWebhookWhatsApp?instance=TESTEWAZE';
    
    console.log('[TESTE] Chamando webhook:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payloadSimulado)
    });

    const result = await response.json();
    
    console.log('[TESTE] Status:', response.status);
    console.log('[TESTE] Resposta:', JSON.stringify(result, null, 2));

    // Verificar se foi criado
    await new Promise(resolve => setTimeout(resolve, 1000));

    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { whatsapp_message_id: payloadSimulado.data.key.id }
    );

    console.log('[TESTE] Mensagens encontradas:', mensagens.length);

    if (mensagens.length > 0) {
      console.log('[TESTE] ✅ Mensagem criada com sucesso!');
      console.log('[TESTE] ID:', mensagens[0].id);
      console.log('[TESTE] Texto:', mensagens[0].texto);
    } else {
      console.log('[TESTE] ❌ Mensagem NÃO foi criada!');
    }

    console.log('='.repeat(80));

    return Response.json({
      success: true,
      webhook_status: response.status,
      webhook_response: result,
      mensagem_criada: mensagens.length > 0,
      mensagem_id: mensagens[0]?.id || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[TESTE] ❌ ERRO:', error.message);
    console.error('[TESTE] Stack:', error.stack);
    
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});
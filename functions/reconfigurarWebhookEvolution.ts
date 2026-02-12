import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('\n\n');
  console.log('█'.repeat(100));
  console.log('⚙️⚙️⚙️ RECONFIGURANDO WEBHOOK NA EVOLUTION API');
  console.log('█'.repeat(100));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');
    
    console.log('📋 Credenciais:');
    console.log('  URL:', evolutionUrl);
    console.log('  Key:', evolutionKey ? '***' : 'MISSING');
    console.log('  Instance:', instanceName);
    
    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({
        success: false,
        error: 'Missing Evolution API credentials'
      });
    }
    
    // Obter URL correta do deployment
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
    const baseUrl = `${proto}://${host}`;
    const webhookUrl = `${baseUrl}/functions/receberWebhookWhatsApp`;
    
    console.log('\n🌐 URL do Webhook:');
    console.log('  Proto:', proto);
    console.log('  Host:', host);
    console.log('  URL Completa:', webhookUrl);
    
    // 1. Remover webhook antigo
    console.log('\n🗑️ 1. Removendo webhook antigo...');
    const deleteUrl = `${evolutionUrl}/webhook/delete/${instanceName}`;
    console.log('   URL:', deleteUrl);
    
    try {
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'apikey': evolutionKey
        }
      });
      console.log('   Status:', deleteResponse.status);
    } catch (e) {
      console.log('   Nota: Webhook antigo pode não existir -', e.message);
    }
    
    // Aguardar um pouco
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 2. Configurar novo webhook
    console.log('\n📡 2. Configurando novo webhook...');
    const setUrl = `${evolutionUrl}/webhook/set/${instanceName}`;
    console.log('   URL:', setUrl);
    
    const payload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONNECTION_UPDATE',
          'CALL'
        ]
      }
    };
    
    console.log('   Payload:', JSON.stringify(payload, null, 2));
    
    const setResponse = await fetch(setUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey
      },
      body: JSON.stringify(payload)
    });
    
    console.log('   Status:', setResponse.status);
    const setResult = await setResponse.json();
    console.log('   Resposta:', JSON.stringify(setResult, null, 2));
    
    if (!setResponse.ok) {
      return Response.json({
        success: false,
        error: 'Falha ao configurar webhook',
        details: setResult
      }, { status: 400 });
    }
    
    // 3. Verificar webhook
    console.log('\n✅ 3. Verificando configuração...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const listUrl = `${evolutionUrl}/webhook/list/${instanceName}`;
    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'apikey': evolutionKey
      }
    });
    
    let webhookConfig = null;
    if (listResponse.ok) {
      webhookConfig = await listResponse.json();
      console.log('   Webhooks:', JSON.stringify(webhookConfig, null, 2));
    }
    
    console.log('█'.repeat(100));
    console.log('✅ WEBHOOK RECONFIGURADO COM SUCESSO!');
    console.log('Aguarde alguns minutos para as mensagens começarem a ser recebidas');
    console.log('█'.repeat(100));
    
    return Response.json({
      success: true,
      message: 'Webhook reconfigurado com sucesso',
      webhookUrl,
      configuration: webhookConfig,
      proximosPassos: [
        '1. Aguarde 2-3 minutos para Evolution API sincronizar',
        '2. Envie uma mensagem de teste do WhatsApp',
        '3. Acesse o Bate-papo para verificar se a mensagem apareceu'
      ]
    });
    
  } catch (error) {
    console.log('█'.repeat(100));
    console.log('❌ ERRO:', error.message);
    console.log('Stack:', error.stack);
    console.log('█'.repeat(100));
    
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
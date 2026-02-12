import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('='.repeat(80));
  console.log('🔧 CONFIGURAR WEBHOOK AUTOMATICAMENTE');
  console.log('='.repeat(80));
  
  try {
    // Obter credenciais do ambiente
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    console.log('📋 Verificando variáveis de ambiente:');
    console.log('- EVOLUTION_API_URL:', evolutionUrl ? '✅' : '❌ FALTANDO');
    console.log('- EVOLUTION_API_KEY:', evolutionKey ? '✅' : '❌ FALTANDO');
    console.log('- EVOLUTION_INSTANCE_NAME (env):', instanceName || '❌ FALTANDO');
    
    // Tentar obter instance da empresa do usuário autenticado
    let finalInstanceName = instanceName;
    try {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me();
      if (user?.empresa_id) {
        const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: user.empresa_id });
        if (empresas.length > 0 && empresas[0].evolution_instance_name) {
          finalInstanceName = empresas[0].evolution_instance_name;
          console.log('✅ Instance obtida da empresa:', finalInstanceName);
        }
      }
    } catch (e) {
      console.log('⚠️ Não conseguiu obter instance da empresa, usando env:', instanceName);
    }

    if (!evolutionUrl || !evolutionKey || !finalInstanceName) {
      const missing = [];
      if (!evolutionUrl) missing.push('EVOLUTION_API_URL');
      if (!evolutionKey) missing.push('EVOLUTION_API_KEY');
      if (!finalInstanceName) missing.push('EVOLUTION_INSTANCE_NAME');
      
      console.error('❌ Variáveis faltando:', missing.join(', '));
      throw new Error(`Configure estas variáveis: ${missing.join(', ')}`);
    }

    // Construir URL do webhook - Extrair do header do Deno
    // A URL correta vem do header X-Forwarded-Proto e Host
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host');
    
    console.log('🔍 Headers:');
    console.log('- x-forwarded-proto:', protocol);
    console.log('- host:', host);
    console.log('- url:', req.url);

    if (!host) {
      throw new Error('Não foi possível determinar a URL do servidor');
    }

    const baseUrl = `${protocol}://${host}`;
    const webhookUrl = `${baseUrl}/functions/receberWebhookWhatsApp?instance=${finalInstanceName}`;

    console.log('🎯 Webhook URL Gerada:', webhookUrl);
    console.log('🌐 Base URL:', baseUrl);
    console.log('📝 Instance Final:', finalInstanceName);

    // Endpoint da Evolution API
    const endpoint = `${evolutionUrl.replace(/\/$/, '')}/webhook/set/${finalInstanceName}`;
    console.log('🔗 Endpoint Evolution:', endpoint);

    // Payload
    const payload = {
      enabled: true,
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'SEND_MESSAGE'
      ]
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    console.log('🔑 API Key:', evolutionKey.substring(0, 15) + '...');

    // Fazer requisição
    console.log('📤 Enviando requisição...');
    console.log('🔑 API Key sendo usada:', evolutionKey.substring(0, 20) + '...');
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': evolutionKey,
        'api-key': evolutionKey
      },
      body: JSON.stringify(payload)
    });

    console.log('📥 Status:', response.status);
    const responseText = await response.text();
    console.log('📥 Resposta (raw):', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('❌ Evolution API retornou erro!');
      throw new Error(`Evolution API erro ${response.status}: ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { raw: responseText };
    }

    console.log('='.repeat(80));
    console.log('✅ WEBHOOK CONFIGURADO COM SUCESSO!');
    console.log('='.repeat(80));

    return Response.json({
      success: true,
      webhook_url: webhookUrl,
      evolution_response: result,
      configuracao: {
        url_evolution: evolutionUrl,
        instance: instanceName,
        webhook_configurado: webhookUrl
      }
    });

  } catch (error) {
    console.error('='.repeat(80));
    console.error('❌ ERRO CRÍTICO');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(80));
    
    return Response.json({
      success: false,
      error: error.message,
      detalhes: 'Verifique os logs do servidor para mais informações'
    }, { status: 500 });
  }
});
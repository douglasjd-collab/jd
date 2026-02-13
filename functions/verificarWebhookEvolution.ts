import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');
    
    console.log('🔍 Verificando configuração na Evolution API...');
    console.log('URL:', evolutionUrl);
    console.log('Instance:', instanceName);
    
    if (!evolutionUrl || !apiKey || !instanceName) {
      return Response.json({
        success: false,
        error: 'Faltam secrets configurados',
        detalhes: {
          url_configurada: !!evolutionUrl,
          api_key_configurada: !!apiKey,
          instance_configurada: !!instanceName
        }
      }, { status: 400 });
    }
    
    // Tentar conectar na Evolution API para verificar instância e webhooks
    const instanceUrl = `${evolutionUrl}/instance/info/${instanceName}`;
    
    console.log('📍 Chamando:', instanceUrl);
    
    const response = await fetch(instanceUrl, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    console.log('✅ Resposta da Evolution API:', JSON.stringify(data, null, 2));
    
    // Verificar se instância existe e status do webhook
    if (!response.ok) {
      return Response.json({
        success: false,
        status_code: response.status,
        error: data.message || 'Erro ao conectar na Evolution API',
        detalhes: data
      });
    }
    
    // Agora listar webhooks configurados
    const webhooksUrl = `${evolutionUrl}/webhook/find/${instanceName}`;
    
    console.log('📍 Buscando webhooks em:', webhooksUrl);
    
    const webhooksResponse = await fetch(webhooksUrl, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    const webhooksData = await webhooksResponse.json();
    
    console.log('✅ Webhooks configurados:', JSON.stringify(webhooksData, null, 2));
    
    return Response.json({
      success: true,
      instancia_info: data,
      webhooks_configurados: webhooksData,
      diagnostico: {
        instancia_existe: !!data.instance,
        instancia_conectada: data.status === 'open' || data.instance?.state === 'open',
        webhooks_count: Array.isArray(webhooksData) ? webhooksData.length : 0,
        mensagem: `Instância "${instanceName}" encontrada. ${Array.isArray(webhooksData) ? webhooksData.length : 0} webhook(s) configurado(s).`
      }
    });
    
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
    
    return Response.json({
      success: false,
      error: error.message,
      tipo_erro: error.constructor.name
    }, { status: 500 });
  }
});
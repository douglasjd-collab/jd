import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('\n\n');
  console.log('█'.repeat(100));
  console.log('🔍 VERIFICAÇÃO DE EVOLUTION API - WEBHOOK CONFIGURATION');
  console.log('█'.repeat(100));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Buscar credenciais da empresa do usuário
    let evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    let evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    let instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');
    
    try {
      if (user?.empresa_id) {
        const empresa = await base44.asServiceRole.entities.Empresa.filter({ id: user.empresa_id });
        if (empresa?.length > 0) {
          evolutionUrl = empresa[0].evolution_url || evolutionUrl;
          evolutionKey = empresa[0].evolution_api_key || evolutionKey;
          instanceName = empresa[0].evolution_instance_name || instanceName;
          console.log('✅ Usando credenciais da empresa');
        }
      }
    } catch (e) {
      console.log('⚠️ Usando credenciais de ambiente');
    }
    
    console.log('📋 Credenciais:');
    console.log('  URL:', evolutionUrl);
    console.log('  Key:', evolutionKey ? evolutionKey.substring(0, 10) + '***' : '❌ MISSING');
    console.log('  Instance:', instanceName);
    
    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({
        success: false,
        error: 'Missing Evolution API credentials',
        missing: {
          url: !evolutionUrl,
          key: !evolutionKey,
          instance: !instanceName
        }
      });
    }
    
    // 1. Testar conexão com Evolution API
    console.log('\n🔗 1. Testando conexão com Evolution API...');
    // Remover trailing slash da URL para evitar duplicação
    const baseUrl = evolutionUrl.endsWith('/') ? evolutionUrl.slice(0, -1) : evolutionUrl;
    const testUrl = `${baseUrl}/instance/info/${instanceName}`;
    console.log('   URL:', testUrl);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    let infoResponse;
    try {
      infoResponse = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'apikey': evolutionKey
        },
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('   ❌ Erro na requisição:', e.message);
      infoResponse = { ok: false, status: 0 };
    }
    clearTimeout(timeoutId);
    
    console.log('   Status:', infoResponse.status);
    
    let instanceInfo = null;
    if (infoResponse.ok) {
      instanceInfo = await infoResponse.json();
      console.log('   ✅ Conectado! Info:', JSON.stringify(instanceInfo, null, 2).substring(0, 500));
    } else {
      const errorText = await infoResponse.text();
      console.log('   ❌ Erro:', errorText.substring(0, 300));
    }
    
    // 2. Listar webhooks configurados
    console.log('\n📡 2. Verificando webhooks configurados...');
    const webhookUrl = `${baseUrl}/webhook/list/${instanceName}`;
    console.log('   URL:', webhookUrl);
    
    const webhookResponse = await fetch(webhookUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'apikey': evolutionKey
      }
    });
    
    console.log('   Status:', webhookResponse.status);
    
    let webhooksList = null;
    if (webhookResponse.ok) {
      webhooksList = await webhookResponse.json();
      console.log('   ✅ Webhooks encontrados:', JSON.stringify(webhooksList, null, 2));
    } else {
      const errorText = await webhookResponse.text();
      console.log('   ❌ Erro ao listar:', errorText.substring(0, 300));
    }
    
    // 3. Verificar se instance está conectada
    console.log('\n🟢 3. Status da instância...');
    if (instanceInfo && instanceInfo.instance) {
      const status = instanceInfo.instance.state;
      console.log('   Estado:', status);
      if (status === 'open' || status === 'connected') {
        console.log('   ✅ Instância CONECTADA ao WhatsApp');
      } else {
        console.log('   ❌ Instância NÃO está conectada! Estado:', status);
      }
    }
    
    // 4. Sugerir próximos passos
    console.log('\n📝 4. Diagnóstico:');
    const diagnostico = {
      conectado: infoResponse.ok,
      instancia_ativa: instanceInfo?.instance?.state === 'open' || instanceInfo?.instance?.state === 'connected',
      webhooks_configurados: webhooksList ? Object.keys(webhooksList).length > 0 : false,
      problemas: []
    };
    
    if (!infoResponse.ok) {
      diagnostico.problemas.push('Evolution API não respondeu - verifique URL e API Key');
    }
    if (!diagnostico.instancia_ativa) {
      diagnostico.problemas.push('Instância do WhatsApp não está conectada - reconecte via QR Code');
    }
    if (!diagnostico.webhooks_configurados) {
      diagnostico.problemas.push('Nenhum webhook configurado - clique em "Configurar Webhook Automaticamente"');
    }
    
    console.log('\n' + JSON.stringify(diagnostico, null, 2));
    console.log('█'.repeat(100));
    
    return Response.json({
      success: true,
      diagnostico,
      evolutionInfo: instanceInfo,
      webhooks: webhooksList
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
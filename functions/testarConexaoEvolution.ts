import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    console.log('='.repeat(80));
    console.log('[TESTE EVOLUTION] Iniciando teste de conexão');
    
    // Buscar credenciais
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    console.log('[TESTE] URL:', evolutionUrl);
    console.log('[TESTE] Instance:', instanceName);
    console.log('[TESTE] Key exists:', !!evolutionKey);

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({
        success: false,
        error: 'Credenciais não configuradas',
        details: {
          url: !!evolutionUrl,
          key: !!evolutionKey,
          instance: !!instanceName
        }
      }, { status: 400 });
    }

    const testes = [];

    // Teste 1: Buscar instância
    console.log('\n[TESTE 1] Buscando instância...');
    try {
      const response = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
        headers: { 'apikey': evolutionKey }
      });

      const data = await response.json();
      console.log('[TESTE 1] Status:', response.status);
      console.log('[TESTE 1] Resposta:', JSON.stringify(data, null, 2));

      testes.push({
        nome: 'Buscar Instância',
        sucesso: response.ok,
        status: response.status,
        dados: data
      });
    } catch (error) {
      console.error('[TESTE 1] Erro:', error.message);
      testes.push({
        nome: 'Buscar Instância',
        sucesso: false,
        erro: error.message
      });
    }

    // Teste 2: Status da instância
    console.log('\n[TESTE 2] Verificando status da conexão...');
    try {
      const response = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
        headers: { 'apikey': evolutionKey }
      });

      const data = await response.json();
      console.log('[TESTE 2] Status:', response.status);
      console.log('[TESTE 2] Resposta:', JSON.stringify(data, null, 2));

      testes.push({
        nome: 'Status Conexão',
        sucesso: response.ok,
        status: response.status,
        dados: data
      });
    } catch (error) {
      console.error('[TESTE 2] Erro:', error.message);
      testes.push({
        nome: 'Status Conexão',
        sucesso: false,
        erro: error.message
      });
    }

    // Teste 3: Verificar webhook configurado
    console.log('\n[TESTE 3] Verificando webhook...');
    try {
      const response = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
        headers: { 'apikey': evolutionKey }
      });

      const data = await response.json();
      console.log('[TESTE 3] Status:', response.status);
      console.log('[TESTE 3] Resposta:', JSON.stringify(data, null, 2));

      testes.push({
        nome: 'Webhook Configurado',
        sucesso: response.ok,
        status: response.status,
        dados: data
      });
    } catch (error) {
      console.error('[TESTE 3] Erro:', error.message);
      testes.push({
        nome: 'Webhook Configurado',
        sucesso: false,
        erro: error.message
      });
    }

    console.log('='.repeat(80));

    return Response.json({
      success: true,
      credenciais: {
        url: evolutionUrl,
        instance: instanceName,
        key_configurada: true
      },
      testes,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[TESTE EVOLUTION] ❌ Erro crítico:', error.message);
    console.error('Stack:', error.stack);
    
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});
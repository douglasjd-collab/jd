import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const INSTANCE_NAME = 'PROMOTORAJD';

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({
        erro: 'Variáveis de ambiente não configuradas'
      }, { status: 500 });
    }

    console.log('🔍 Testando diferentes formas de autenticação...');
    console.log('URL:', EVOLUTION_API_URL);
    console.log('INSTANCE:', INSTANCE_NAME);
    console.log('API_KEY:', EVOLUTION_API_KEY.substring(0, 10) + '...');

    const resultados = {};

    // Modo 1: apikey header
    try {
      console.log('\n📝 Testando modo 1: header apikey');
      const r1 = await fetch(`${EVOLUTION_API_URL}/instance/info/${INSTANCE_NAME}`, {
        headers: { 'apikey': EVOLUTION_API_KEY }
      });
      resultados.modo1_apikey = {
        status: r1.status,
        sucesso: r1.ok,
        dados: await r1.json()
      };
    } catch (e) {
      resultados.modo1_apikey = { erro: e.message };
    }

    // Modo 2: Bearer token
    try {
      console.log('📝 Testando modo 2: Bearer token');
      const r2 = await fetch(`${EVOLUTION_API_URL}/instance/info/${INSTANCE_NAME}`, {
        headers: { 'Authorization': `Bearer ${EVOLUTION_API_KEY}` }
      });
      resultados.modo2_bearer = {
        status: r2.status,
        sucesso: r2.ok,
        dados: await r2.json()
      };
    } catch (e) {
      resultados.modo2_bearer = { erro: e.message };
    }

    // Modo 3: X-API-Key header
    try {
      console.log('📝 Testando modo 3: X-API-Key header');
      const r3 = await fetch(`${EVOLUTION_API_URL}/instance/info/${INSTANCE_NAME}`, {
        headers: { 'X-API-Key': EVOLUTION_API_KEY }
      });
      resultados.modo3_x_api_key = {
        status: r3.status,
        sucesso: r3.ok,
        dados: await r3.json()
      };
    } catch (e) {
      resultados.modo3_x_api_key = { erro: e.message };
    }

    // Modo 4: Query parameter
    try {
      console.log('📝 Testando modo 4: Query parameter apikey');
      const r4 = await fetch(`${EVOLUTION_API_URL}/instance/info/${INSTANCE_NAME}?apikey=${EVOLUTION_API_KEY}`);
      resultados.modo4_query_param = {
        status: r4.status,
        sucesso: r4.ok,
        dados: await r4.json()
      };
    } catch (e) {
      resultados.modo4_query_param = { erro: e.message };
    }

    return Response.json({
      teste_completo: true,
      api_url: EVOLUTION_API_URL,
      instance: INSTANCE_NAME,
      resultados: resultados,
      recomendacao: Object.entries(resultados)
        .find(([_, r]) => r.sucesso === true)?.[0] || 'Nenhum modo funcionou'
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ 
      erro: error.message
    }, { status: 500 });
  }
});
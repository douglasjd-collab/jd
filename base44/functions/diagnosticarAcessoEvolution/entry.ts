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

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({ erro: 'Variáveis não configuradas' }, { status: 500 });
    }

    const baseUrl = EVOLUTION_API_URL.endsWith('/') ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL;

    console.log('🔍 Testando acesso à Evolution API...');
    console.log('URL:', baseUrl);
    console.log('Key length:', EVOLUTION_API_KEY.length);

    const testes = [
      {
        nome: 'GET / com header apikey',
        url: baseUrl + '/',
        headers: { 'apikey': EVOLUTION_API_KEY }
      },
      {
        nome: 'GET / com header Authorization Bearer',
        url: baseUrl + '/',
        headers: { 'Authorization': `Bearer ${EVOLUTION_API_KEY}` }
      },
      {
        nome: 'GET / com header X-API-Key',
        url: baseUrl + '/',
        headers: { 'X-API-Key': EVOLUTION_API_KEY }
      },
      {
        nome: 'GET / com query param ?apikey=',
        url: baseUrl + `/?apikey=${EVOLUTION_API_KEY}`,
        headers: {}
      },
      {
        nome: 'GET /status com header apikey',
        url: baseUrl + '/status',
        headers: { 'apikey': EVOLUTION_API_KEY }
      }
    ];

    const resultados = {};
    let sucessoEncontrado = false;

    for (const teste of testes) {
      try {
        console.log(`\n📡 ${teste.nome}`);
        
        const response = await fetch(teste.url, {
          method: 'GET',
          headers: teste.headers
        });

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }

        resultados[teste.nome] = {
          status: response.status,
          ok: response.ok,
          preview: typeof body === 'string' ? body.substring(0, 200) : JSON.stringify(body).substring(0, 200)
        };

        if (response.ok) {
          console.log(`✅ FUNCIONOU!`);
          sucessoEncontrado = true;
        } else {
          console.log(`❌ Status ${response.status}`);
        }

      } catch (e) {
        resultados[teste.nome] = { erro: e.message };
      }
    }

    return Response.json({
      base_url: baseUrl,
      sucesso_encontrado: sucessoEncontrado,
      resultados: resultados,
      dica: sucessoEncontrado ? 'Use o método que retornou 200' : 'Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY - nenhum método funcionou'
    });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});
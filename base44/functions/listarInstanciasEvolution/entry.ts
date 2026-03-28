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

    // Tentar endpoints para listar instâncias
    const endpoints = [
      '/instance/fetchInstances',
      '/instance/list',
      '/instance',
      '/instances',
    ];

    for (const ep of endpoints) {
      const url = baseUrl + ep;
      console.log(`Testando: GET ${ep}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      let body = null;
      try { body = await response.json(); } catch { body = await response.text(); }

      if (response.ok) {
        return Response.json({
          sucesso: true,
          endpoint_funcionou: ep,
          instancias: body
        });
      }
      
      console.log(`❌ ${ep} → ${response.status}`);
    }

    return Response.json({
      sucesso: false,
      mensagem: 'Não conseguiu listar instâncias'
    }, { status: 400 });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});
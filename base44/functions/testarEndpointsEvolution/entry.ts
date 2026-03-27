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
      return Response.json({ erro: 'Variáveis não configuradas' }, { status: 500 });
    }

    const baseUrl = EVOLUTION_API_URL.endsWith('/') ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL;
    const resultados = {};

    // Testar endpoints raiz com apikey
    const endpoints = [
      '/health',
      '/status',
      '/',
      '/webhook',
      `/instance/info/${INSTANCE_NAME}`,
      `/instance/list`,
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`📡 Testando: ${endpoint}`);
        const url = `${baseUrl}${endpoint}`;
        const response = await fetch(url, {
          headers: { 'apikey': EVOLUTION_API_KEY }
        });
        
        let body = null;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }

        resultados[endpoint] = {
          status: response.status,
          sucesso: response.ok,
          corpo: body
        };
      } catch (e) {
        resultados[endpoint] = { erro: e.message };
      }
    }

    return Response.json({
      api_url: EVOLUTION_API_URL,
      instance: INSTANCE_NAME,
      endpoints_testados: resultados
    });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});
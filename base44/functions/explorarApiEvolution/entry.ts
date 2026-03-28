import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const INSTANCE_NAME = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'PROMOTORAJD';

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({ erro: 'Variáveis não configuradas' }, { status: 500 });
    }

    const baseUrl = EVOLUTION_API_URL.endsWith('/') ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL;

    console.log('Instance name da variável:', INSTANCE_NAME);

    // Testar vários endpoints da Evolution API v2.x
    const endpoints = [
      { method: 'GET', path: '/instance/fetchInstances' },
      { method: 'GET', path: `/instance/connectionState/${INSTANCE_NAME}` },
      { method: 'GET', path: `/instance/connectionState/PROMOTORAJD` },
      { method: 'GET', path: `/instance/connectionState/promotorajd` },
      { method: 'GET', path: `/instance/connectionState/Promotorajd` },
      { method: 'GET', path: '/instance/fetchInstances?instanceName=' + INSTANCE_NAME },
    ];

    const resultados = {};

    for (const ep of endpoints) {
      const url = baseUrl + ep.path;
      try {
        const response = await fetch(url, {
          method: ep.method,
          headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' }
        });

        let body = null;
        try { body = await response.json(); } catch { body = await response.text(); }

        resultados[ep.path] = { status: response.status, ok: response.ok, body: body };
        console.log(`${ep.method} ${ep.path} → ${response.status}`);
      } catch (e) {
        resultados[ep.path] = { erro: e.message };
      }
    }

    return Response.json({
      instance_name_configurado: INSTANCE_NAME,
      base_url: baseUrl,
      resultados
    });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
    const instance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';

    console.log(`🔑 API Key (primeiros 10): ${apiKey.substring(0, 10)}...`);
    console.log(`🌐 URL: ${evolutionUrl}`);
    console.log(`📱 Instance: ${instance}`);

    const results = {};

    // Teste 1: header apikey
    const r1 = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
      headers: { 'apikey': apiKey }
    });
    results.apikey_header = { status: r1.status, body: await r1.json().catch(() => ({})) };

    // Teste 2: header Authorization Bearer
    const r2 = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    results.bearer_header = { status: r2.status, body: await r2.json().catch(() => ({})) };

    // Teste 3: sem auth - ver o erro
    const r3 = await fetch(`${evolutionUrl}/instance/fetchInstances`);
    results.no_auth = { status: r3.status, body: await r3.json().catch(() => ({})) };

    // Teste 4: endpoint raiz
    const r4 = await fetch(`${evolutionUrl}/`);
    results.root = { status: r4.status };

    return Response.json({ evolutionUrl, instance, apiKeyLength: apiKey.length, results });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
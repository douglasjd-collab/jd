Deno.serve(async (req) => {
  console.log('🔥 TESTE SIMPLES INICIADO');
  console.log('Evolution URL:', Deno.env.get('EVOLUTION_API_URL') ? '✓' : '✗');
  console.log('Evolution Key:', Deno.env.get('EVOLUTION_API_KEY') ? '✓' : '✗');

  const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
  const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

  if (!evolutionUrl || !evolutionKey) {
    return Response.json({
      status: '❌',
      erro: 'EVOLUTION_API_URL ou EVOLUTION_API_KEY ausentes'
    });
  }

  try {
    console.log('🌐 Testando conexão...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${evolutionUrl}/instance/info/TES`, {
      method: 'GET',
      headers: {
        'apikey': evolutionKey,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return Response.json({
        status: '✅ CONECTADO',
        numero: data.instance?.number,
        conectado: data.instance?.connected
      });
    } else {
      return Response.json({
        status: `❌ HTTP ${response.status}`,
        erro: response.statusText
      });
    }
  } catch (err) {
    return Response.json({
      status: '❌ ERRO',
      erro: err.message
    }, { status: 500 });
  }
});
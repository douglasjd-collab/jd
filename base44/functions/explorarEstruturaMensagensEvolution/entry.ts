import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const evUrl = Deno.env.get('EVOLUTION_API_URL');
    const evKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';

    console.log(`\n🔍 EXPLORADOR DE ESTRUTURA EVOLUTION API`);
    console.log(`URL Base: ${evUrl}`);
    console.log(`Instância: ${instancia}\n`);

    const endpoints = [
      // Tentativas com /get
      { method: 'GET', path: `/messages/get/${instancia}` },
      { method: 'POST', path: `/messages/get/${instancia}`, body: { phone: '558791426333' } },
      
      // Tentativas com /find
      { method: 'GET', path: `/messages/find/${instancia}` },
      { method: 'POST', path: `/messages/find/${instancia}`, body: { phone: '558791426333' } },
      
      // Tentativas sem instância
      { method: 'GET', path: `/messages/558791426333` },
      { method: 'POST', path: `/messages/558791426333` },
      
      // Tentativas com chats
      { method: 'GET', path: `/chats/get/${instancia}` },
      { method: 'POST', path: `/chats/get/${instancia}` },
      { method: 'GET', path: `/chats` },
      
      // Tentativas com conversations
      { method: 'GET', path: `/conversations/${instancia}` },
      { method: 'POST', path: `/conversations/get/${instancia}`, body: { phone: '558791426333' } },
      
      // Tentativas com history
      { method: 'GET', path: `/history/${instancia}` },
      { method: 'POST', path: `/history/${instancia}`, body: { phone: '558791426333' } },
      
      // Diretório raiz
      { method: 'GET', path: `` },
      { method: 'GET', path: `/` },
    ];

    const resultados = [];

    for (const endpoint of endpoints) {
      try {
        const url = `${evUrl}${endpoint.path}`;
        const opts = {
          method: endpoint.method,
          headers: {
            'Authorization': `Bearer ${evKey}`,
            'Content-Type': 'application/json',
          },
        };

        if (endpoint.body) {
          opts.body = JSON.stringify(endpoint.body);
        }

        const resp = await fetch(url, opts);
        const text = await resp.text();
        const status = resp.status;

        // Se não for 404/401, é um endpoint válido
        if (status !== 404 && text.length > 0) {
          console.log(`✅ ${endpoint.method} ${endpoint.path}`);
          console.log(`   Status: ${status}`);
          console.log(`   Response: ${text.slice(0, 300)}`);
          console.log('');

          resultados.push({
            endpoint: endpoint.path,
            method: endpoint.method,
            status,
            responsePreview: text.slice(0, 300),
          });
        }
      } catch (err) {
        // silenciosamente ignorar
      }
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`Endpoints válidos encontrados: ${resultados.length}`);
    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      endpointsValidos: resultados,
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
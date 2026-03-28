Deno.serve(async (req) => {
  const VERIFY_TOKEN = 'QTKxBcm2UVQiHqM9CQW7Bx58gqSVmm74';

  // GET request - validação do webhook pela Meta
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    return new Response('Invalid token', { status: 403 });
  }

  // POST request - mensagens reais
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      
      // Responder imediatamente à Meta
      const response = Response.json({ received: true }, { status: 200 });
      
      // Processar mensagem em background (sem await)
      processarMensagem(body).catch(err => console.error('Erro ao processar:', err));
      
      return response;
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: false }, { status: 405 });
});

async function processarMensagem(body) {
  if (!body.entry || !Array.isArray(body.entry)) return;
  
  const entry = body.entry[0];
  if (!entry.changes || entry.changes.length === 0) return;
  
  const change = entry.changes[0];
  if (!change?.value?.messages) return;
  
  const message = change.value.messages[0];
  console.log('📨 Mensagem recebida:', message);
}
Deno.serve(async (req) => {
  const VERIFY_TOKEN = '07f4bcb2UTGd3gKFFcC9YTDe0iu9zRmmr4';

  // GET - validação do webhook pela Meta
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('🔍 GET recebido:', { mode, token: token?.slice(0,8), challenge: challenge?.slice(0,8) });

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      console.log('✅ Webhook validado!');
      return new Response(challenge);
    }

    console.log('❌ Validação falhou');
    return new Response('Invalid', { status: 403 });
  }

  // POST - mensagens reais
  if (req.method === 'POST') {
    const body = await req.json();
    console.log('📨 POST recebido:', JSON.stringify(body).slice(0, 100));
    return Response.json({ received: true });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
});
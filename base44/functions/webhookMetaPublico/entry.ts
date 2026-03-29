Deno.serve(async (req) => {
  const VERIFY_TOKEN = 'WAZE_CRM_WEBHOOK_2024';

  // Responder a CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

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
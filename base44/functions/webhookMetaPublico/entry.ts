Deno.serve(async (req) => {
  const VERIFY_TOKEN = 'WAZE_CRM_WEBHOOK_2024';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  const url = new URL(req.url);

  // Tentar pegar params de query string (GET da Meta)
  let mode = url.searchParams.get('hub.mode');
  let token = url.searchParams.get('hub.verify_token');
  let challenge = url.searchParams.get('hub.challenge');

  // Se não veio na query, tentar do body (POST)
  if (!mode) {
    try {
      const body = await req.json();
      mode = body['hub.mode'] || body.mode;
      token = body['hub.verify_token'] || body.verify_token;
      challenge = body['hub.challenge'] || body.challenge;

      // Se for POST de mensagem real da Meta
      if (body.object === 'whatsapp_business_account' || body.entry) {
        console.log('📨 Mensagem Meta recebida:', JSON.stringify(body).slice(0, 200));
        return new Response('EVENT_RECEIVED', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    } catch (_) {
      // body vazio ou não-JSON, ignorar
    }
  }

  console.log('🔍 Verificação webhook:', { mode, tokenRecebido: token, tokenEsperado: VERIFY_TOKEN, challenge, match: token === VERIFY_TOKEN });

  // Validação do webhook (GET da Meta)
  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    console.log('✅ Webhook validado! Challenge:', challenge);
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  console.log('❌ Falhou: mode=' + mode + ' match=' + (token === VERIFY_TOKEN));
  return new Response('Forbidden', { status: 403 });
});
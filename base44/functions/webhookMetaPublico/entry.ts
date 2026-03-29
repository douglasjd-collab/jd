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

  // Ler o body completo como texto para diagnóstico
  const rawBody = await req.text();
  console.log('📥 Method:', req.method);
  console.log('📥 URL:', req.url);
  console.log('📥 Body raw:', rawBody.slice(0, 500));

  let mode, token, challenge;

  // 1. Tentar query string da URL
  const url = new URL(req.url);
  mode = url.searchParams.get('hub.mode');
  token = url.searchParams.get('hub.verify_token');
  challenge = url.searchParams.get('hub.challenge');

  console.log('🔎 Query params:', { mode, token, challenge });

  // 2. Se não veio na query, tentar do body JSON
  if (!mode && rawBody) {
    try {
      const body = JSON.parse(rawBody);
      console.log('📦 Body parsed:', JSON.stringify(body).slice(0, 300));

      // Verificação hub
      mode = body['hub.mode'] || body.mode;
      token = body['hub.verify_token'] || body.verify_token || body.token;
      challenge = body['hub.challenge'] || body.challenge;

      // Mensagem real da Meta (POST)
      if (body.object === 'whatsapp_business_account' || body.entry) {
        console.log('📨 Mensagem Meta recebida');
        return new Response('EVENT_RECEIVED', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    } catch (_) {
      // tentar form-urlencoded
      try {
        const params = new URLSearchParams(rawBody);
        mode = params.get('hub.mode');
        token = params.get('hub.verify_token');
        challenge = params.get('hub.challenge');
        console.log('📦 Form params:', { mode, token, challenge });
      } catch (__) {
        // ignorar
      }
    }
  }

  console.log('🔍 Verificação:', { mode, token, tokenEsperado: VERIFY_TOKEN, challenge, match: token === VERIFY_TOKEN });

  // Validação do webhook
  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    console.log('✅ Webhook VALIDADO! Retornando challenge:', challenge);
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  console.log('❌ Validação falhou');
  return new Response('Forbidden', { status: 403 });
});
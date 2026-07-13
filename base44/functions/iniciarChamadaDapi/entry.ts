import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Inicia uma ligação URA ao vivo (Bina Inteligente) via D-API
// POST /api/v1/voice/live/start -> { to } (requer chave de API "de usuário", escopo de conta,
// diferente da chave de sessão do WhatsApp usada nas outras integrações D-API)

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { phone } = payload;

    if (!phone) {
      return Response.json({ error: 'phone é obrigatório' }, { status: 400 });
    }

    const apiKey = Deno.env.get('DAPI_USER_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'DAPI_USER_API_KEY não configurada' }, { status: 400 });
    }

    const phoneNormalizado = String(phone).replace(/\D/g, '');
    if (phoneNormalizado.length < 8) {
      return Response.json({ error: 'Número de telefone inválido' }, { status: 400 });
    }

    const response = await fetch('https://api.d-api.cloud/api/v1/voice/live/start', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: phoneNormalizado }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      return Response.json(
        { error: data.error || `Falha ao iniciar chamada (HTTP ${response.status})` },
        { status: 502 }
      );
    }

    return Response.json({ success: true, callId: data.callId, wsUrl: data.wsUrl, token: data.token, ...data });
  } catch (error) {
    console.error('Erro iniciarChamadaDapi:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
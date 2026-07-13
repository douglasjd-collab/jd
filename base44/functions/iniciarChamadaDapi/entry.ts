import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Inicia uma ligação de voz via WhatsApp (D-API - Ligações por Stream)
// Docs: https://docs.d-api.cloud/whatsapp/ligacoes/stream
// POST /api/v1/calls/stream -> { callId, wsUrl }
// A wsUrl já contém o token de autenticação e deve ser aberta como veio pelo frontend.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { connectionId, phone } = payload;

    if (!connectionId || !phone) {
      return Response.json({ error: 'connectionId e phone são obrigatórios' }, { status: 400 });
    }

    const connection = await base44.asServiceRole.entities.WhatsappConnection.get(connectionId);
    if (!connection || connection.provider_type !== 'dapi') {
      return Response.json({ error: 'Conexão D-API não encontrada' }, { status: 404 });
    }

    // Descriptografar API Key (mesma lógica usada em whatsappService)
    let apiKey = connection.api_key_encrypted || '';
    try {
      const decoded = atob(apiKey);
      if (decoded && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
        apiKey = decoded.trim();
      } else {
        apiKey = apiKey.trim();
      }
    } catch (_) {
      apiKey = apiKey.trim();
    }

    if (!apiKey) {
      return Response.json({ error: 'API Key da conexão D-API não configurada' }, { status: 400 });
    }

    const baseUrl = connection.base_url || 'https://api.d-api.cloud';
    const sessionId = connection.session_id || '';
    const phoneNormalizado = String(phone).replace(/\D/g, '');

    const response = await fetch(`${baseUrl}/api/v1/calls/stream`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, phone: phoneNormalizado }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      return Response.json(
        { error: data.error || `Falha ao iniciar chamada (HTTP ${response.status})` },
        { status: 502 }
      );
    }

    return Response.json({ success: true, callId: data.callId, wsUrl: data.wsUrl });
  } catch (error) {
    console.error('Erro iniciarChamadaDapi:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
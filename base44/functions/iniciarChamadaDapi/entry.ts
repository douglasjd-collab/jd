import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { resolverConexaoDapi } from '../../shared/dapiConexaoShared.ts';

// Inicia uma ligação de voz via D-API — dois modos possíveis:
// - via "whatsapp": Ligações por Stream (chamada de voz dentro do WhatsApp)
//   POST /api/v1/calls/stream -> { callId, wsUrl } — usa a API Key da sessão (conexão D-API)
// - via "operadora": Ligação URA ao vivo (Bina Inteligente) — chamada telefônica comum
//   POST /api/v1/voice/live/start -> { to } — usa a API Key "de usuário" (escopo de conta)

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { phone, connectionId, via } = payload;

    if (!phone) {
      return Response.json({ error: 'phone é obrigatório' }, { status: 400 });
    }

    const phoneNormalizado = String(phone).replace(/\D/g, '');
    if (phoneNormalizado.length < 8) {
      return Response.json({ error: 'Número de telefone inválido' }, { status: 400 });
    }

    if (via === 'whatsapp') {
      if (!connectionId) {
        return Response.json({ error: 'connectionId é obrigatório para ligação via WhatsApp' }, { status: 400 });
      }

      const connection = await base44.asServiceRole.entities.WhatsappConnection.get(connectionId);
      if (!connection || connection.provider_type !== 'dapi') {
        return Response.json({ error: 'Conexão D-API não encontrada' }, { status: 404 });
      }

      const { baseUrl: rawBaseUrl, apiKey, sessionId } = resolverConexaoDapi(connection);
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');
      if (!apiKey || !sessionId) {
        return Response.json({ error: 'Configure a API Key e a sessão da conexão D-API para fazer ligações.' }, { status: 400 });
      }

      const response = await fetch(`${baseUrl}/api/v1/calls/stream`, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, phone: phoneNormalizado }),
        signal: AbortSignal.timeout(25000),
      });

      const raw = await response.json().catch(() => ({}));
      const data = raw.data || raw;
      const motivo = raw.error?.message || raw.error || raw.message || data.error?.message || data.error || data.message;
      const mensagem = typeof motivo === 'string' ? motivo : '';
      if (!response.ok || raw.success === false || data.success === false) {
        return Response.json(
          { error: mensagem || `A D-API não iniciou a ligação (HTTP ${response.status}). Verifique se esta conexão permite chamadas e se há outra ligação em andamento.`, upstream_status: response.status },
          { status: 502 }
        );
      }
      if (typeof data.wsUrl !== 'string' || !/^wss?:\/\//i.test(data.wsUrl)) {
        return Response.json({ error: mensagem || 'A D-API não retornou o canal de áudio para a ligação. Verifique a disponibilidade de chamadas nesta conexão.' }, { status: 502 });
      }
      return Response.json({ success: true, via: 'whatsapp', callId: data.callId, wsUrl: data.wsUrl });

    }

    // via "operadora" (padrão): Ligação URA ao vivo (Bina Inteligente)
    const apiKey = Deno.env.get('DAPI_USER_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'DAPI_USER_API_KEY não configurada' }, { status: 400 });
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

    return Response.json({ success: true, via: 'operadora', callId: data.callId, wsUrl: data.wsUrl, token: data.token, ...data });
  } catch (error) {
    console.error('Erro iniciarChamadaDapi:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
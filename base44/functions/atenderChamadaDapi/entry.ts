import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { resolverConexaoDapi } from '../../shared/dapiConexaoShared.ts';

// Atende ou recusa uma chamada de voz recebida no WhatsApp (D-API).
// - acao 'atender' -> POST /api/v1/calls/accept  (devolve a wsUrl de mídia)
// - acao 'recusar' -> POST /api/v1/calls/reject
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { connectionId, callId, acao } = payload;

    if (!connectionId || !callId) {
      return Response.json({ error: 'connectionId e callId são obrigatórios' }, { status: 400 });
    }

    const connection = await base44.asServiceRole.entities.WhatsappConnection.get(connectionId).catch(() => null);
    if (!connection || connection.provider_type !== 'dapi') {
      return Response.json({ error: 'Conexão D-API não encontrada' }, { status: 404 });
    }

    const { baseUrl, apiKey, sessionId } = resolverConexaoDapi(connection);
    if (!apiKey) {
      return Response.json({ error: 'API Key da conexão D-API não configurada' }, { status: 400 });
    }
    if (!sessionId) {
      return Response.json({ error: 'Session ID da conexão D-API não configurado' }, { status: 400 });
    }

    const recusar = acao === 'recusar';
    const endpoint = recusar ? '/api/v1/calls/reject' : '/api/v1/calls/accept';

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, callId }),
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      return Response.json(
        { error: data.error || `Falha ao ${recusar ? 'recusar' : 'atender'} a chamada (HTTP ${response.status})` },
        { status: 502 }
      );
    }

    if (recusar) return Response.json({ success: true, acao: 'recusar' });

    if (!data.wsUrl) {
      return Response.json({ error: 'A D-API não retornou o canal de áudio da chamada' }, { status: 502 });
    }

    return Response.json({ success: true, acao: 'atender', callId: data.callId || callId, wsUrl: data.wsUrl });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro inesperado' }, { status: 500 });
  }
});
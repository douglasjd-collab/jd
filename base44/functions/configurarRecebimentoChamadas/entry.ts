import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { resolverConexaoDapi } from '../../shared/dapiConexaoShared.ts';

// Liga/desliga o recebimento de chamadas na sessão D-API.
// POST /api/v1/sessions/{sessionId}/receive-calls-settings { receiveCalls: true|false }
// Atenção: a D-API reinicia a conexão para aplicar a mudança (alguns segundos offline).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { connectionId, ativo } = payload;
    if (!connectionId) return Response.json({ error: 'connectionId é obrigatório' }, { status: 400 });

    const connection = await base44.asServiceRole.entities.WhatsappConnection.get(connectionId).catch(() => null);
    if (!connection || connection.provider_type !== 'dapi') {
      return Response.json({ error: 'Conexão D-API não encontrada' }, { status: 404 });
    }

    const { baseUrl, apiKey, sessionId } = resolverConexaoDapi(connection);
    if (!apiKey || !sessionId) {
      return Response.json({ error: 'API Key ou Session ID da conexão não configurados' }, { status: 400 });
    }

    const response = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/receive-calls-settings`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiveCalls: !!ativo }),
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detalhe = data.error || data.message || `HTTP ${response.status}`;
      return Response.json(
        {
          error: String(detalhe).includes('Cloud API')
            ? 'Esta conexão é da API Oficial (Meta) e não aceita chamadas pela D-API.'
            : detalhe,
        },
        { status: 502 }
      );
    }

    // Guarda o estado na conexão para a tela de configurações refletir o que está ativo.
    let configAtual: Record<string, any> = {};
    try {
      configAtual = connection.config_json ? JSON.parse(connection.config_json) : {};
    } catch (_) {
      configAtual = {};
    }
    await base44.asServiceRole.entities.WhatsappConnection.update(connectionId, {
      config_json: JSON.stringify({ ...configAtual, recebimento_chamadas: !!ativo }),
    });

    return Response.json({ success: true, ativo: !!ativo });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro inesperado' }, { status: 500 });
  }
});
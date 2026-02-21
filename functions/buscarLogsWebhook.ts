import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Buscar logs do banco de dados LogRecebimentoWebhook com ordenação mais recente
    const logs = await base44.asServiceRole.entities.LogRecebimentoWebhook.list('-created_date', 200);

    return Response.json({ sucesso: true, logs: logs || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
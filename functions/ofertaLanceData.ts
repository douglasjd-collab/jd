import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { competencia } = body;

    // Buscar todas as vendas via service role (sem filtro de empresa)
    const vendas = await base44.asServiceRole.entities.Venda.list('-created_date', 2000);

    // Buscar ofertas da competência via service role
    let ofertas = [];
    if (competencia) {
      ofertas = await base44.asServiceRole.entities.OfertaLance.filter({ competencia });
    } else {
      ofertas = await base44.asServiceRole.entities.OfertaLance.list('-created_date', 500);
    }

    return Response.json({
      vendas,
      ofertas,
      debug: {
        total_vendas: vendas.length,
        total_ofertas: ofertas.length,
        competencia,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const role = (user.perfil || user.role || "").toLowerCase();
    if (!["super_admin", "master", "admin", "gerente"].includes(role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { historico_id, limit = 20 } = body;

    if (!historico_id) {
      return Response.json({ error: "historico_id é obrigatório" }, { status: 400 });
    }

    // 1. Excluir ImportacaoAssembleia relacionada
    const importacoes = await base44.asServiceRole.entities.ImportacaoAssembleia.filter(
      { historico_id },
      '-created_date',
      limit
    );

    for (const imp of importacoes) {
      await base44.asServiceRole.entities.ImportacaoAssembleia.delete(imp.id);
    }

    if (importacoes.length > 0) {
      return Response.json({ status: 'PROCESSANDO_IMPORTACOES' });
    }

    // 2. Excluir detalhes (lote)
    const detalhes = await base44.asServiceRole.entities.HistoricoLanceDetalhe.filter(
      { historico_id },
      '-created_date',
      limit
    );

    for (const d of detalhes) {
      await base44.asServiceRole.entities.HistoricoLanceDetalhe.delete(d.id);
    }

    if (detalhes.length > 0) {
      return Response.json({ status: 'PROCESSANDO_DETALHES' });
    }

    // 3. Excluir resumos (lote)
    const resumos = await base44.asServiceRole.entities.HistoricoLanceResumo.filter(
      { historico_id },
      '-created_date',
      limit
    );

    for (const r of resumos) {
      await base44.asServiceRole.entities.HistoricoLanceResumo.delete(r.id);
    }

    if (resumos.length > 0) {
      return Response.json({ status: 'PROCESSANDO_RESUMOS' });
    }

    // 4. Excluir histórico principal
    await base44.asServiceRole.entities.HistoricoLanceGrupo.delete(historico_id);

    return Response.json({ status: 'FINALIZADO' });

  } catch (e) {
    console.error("[processarExclusaoHistoricoLance] ERRO:", e);
    return Response.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
});
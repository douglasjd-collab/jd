import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const { log_id } = await req.json();
    if (!log_id) return Response.json({ error: 'log_id obrigatório' }, { status: 400 });

    // Buscar o log
    let log;
    try {
      log = await base44.asServiceRole.entities.ImportacaoPropostasLog.get(log_id);
    } catch {
      return Response.json({ error: 'Log não encontrado' }, { status: 404 });
    }
    if (!log) return Response.json({ error: 'Log não encontrado' }, { status: 404 });

    if (log.status === 'desfeita') {
      return Response.json({ error: 'Esta importação já foi desfeita' }, { status: 400 });
    }

    // Parsear IDs das propostas criadas
    let idsParaExcluir = [];
    try {
      idsParaExcluir = JSON.parse(log.propostas_ids_criadas || '[]');
    } catch {
      return Response.json({ error: 'IDs das propostas inválidos no log' }, { status: 400 });
    }

    if (idsParaExcluir.length === 0) {
      return Response.json({ error: 'Nenhuma proposta registrada para desfazer' }, { status: 400 });
    }

    // Excluir propostas uma a uma
    let excluidas = 0;
    const erros = [];
    for (const id of idsParaExcluir) {
      try {
        await base44.asServiceRole.entities.Proposta.delete(id);
        excluidas++;
      } catch (err) {
        erros.push(`ID ${id}: ${err.message}`);
      }
    }

    // Marcar log como desfeito
    await base44.asServiceRole.entities.ImportacaoPropostasLog.update(log_id, {
      status: 'desfeita',
    });

    console.log(`Importação ${log_id} desfeita: ${excluidas} propostas excluídas`);

    return Response.json({ success: true, excluidas, erros });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
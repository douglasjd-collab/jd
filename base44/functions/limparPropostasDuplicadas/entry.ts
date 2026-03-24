import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    if (user.role !== 'admin' && user.perfil !== 'admin' && user.perfil !== 'super_admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Apenas admins podem executar esta operação' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // por padrão é dry_run (simulação)

    // Buscar todas as propostas de empréstimo
    const propostas = await base44.asServiceRole.entities.Proposta.filter({ produto: 'emprestimo' });

    // Agrupar por contrato + administradora_id (ou administradora_nome)
    const grupos = {};
    for (const p of propostas) {
      const contrato = p.contrato;
      if (!contrato) continue; // sem contrato não dá pra deduplicar

      const banco = p.administradora_id || p.administradora_nome || '';
      const chave = `${contrato}::${banco}`;

      if (!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(p);
    }

    // Identificar duplicatas (grupos com mais de 1)
    const duplicatas = Object.entries(grupos).filter(([, lista]) => lista.length > 1);

    const idsParaExcluir = [];
    const resumo = [];

    for (const [chave, lista] of duplicatas) {
      // Ordenar por created_date ASC — manter o mais antigo
      lista.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const [manter, ...excluir] = lista;

      for (const p of excluir) {
        idsParaExcluir.push(p.id);
      }

      resumo.push({
        chave,
        total: lista.length,
        manter: { id: manter.id, cliente_nome: manter.cliente_nome, created_date: manter.created_date },
        excluindo: excluir.map(p => ({ id: p.id, cliente_nome: p.cliente_nome, created_date: p.created_date })),
      });
    }

    if (!dryRun && idsParaExcluir.length > 0) {
      // Excluir duplicatas em lotes para evitar rate limit
      const LOTE = 5;
      for (let i = 0; i < idsParaExcluir.length; i += LOTE) {
        const lote = idsParaExcluir.slice(i, i + LOTE);
        await Promise.all(lote.map(id => base44.asServiceRole.entities.Proposta.delete(id)));
        if (i + LOTE < idsParaExcluir.length) {
          await new Promise(r => setTimeout(r, 500)); // pausa entre lotes
        }
      }
    }

    return Response.json({
      dry_run: dryRun,
      total_grupos_duplicados: duplicatas.length,
      total_excluidos: idsParaExcluir.length,
      resumo: resumo.slice(0, 50),
      mensagem: dryRun
        ? `Simulação: ${idsParaExcluir.length} duplicata(s) seriam removidas. Para confirmar, chame com dry_run: false.`
        : `${idsParaExcluir.length} duplicata(s) removidas com sucesso.`,
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
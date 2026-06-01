import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { lote_id, tipo } = await req.json();

    if (!lote_id || !tipo) {
      return Response.json({ error: 'lote_id e tipo são obrigatórios' }, { status: 400 });
    }

    if (tipo === 'emp') {
      // 1. Buscar itens do lote (ComissaoEmprestimoPaga)
      const itens = await base44.asServiceRole.entities.ComissaoEmprestimoPaga.filter(
        { lote_pagamento_id: lote_id }, null, 500
      );

      // 2. Reverter status das Propostas vinculadas
      const propostaIds = [...new Set(itens.map(i => i.proposta_id).filter(Boolean))];
      for (const pid of propostaIds) {
        await base44.asServiceRole.entities.Proposta.update(pid, {
          comissao_vendedor_paga: false,
          comissao_vendedor_data_pagamento: null,
          lote_pagamento_id: null,
        });
      }

      // 3. Deletar os itens ComissaoEmprestimoPaga
      for (const item of itens) {
        await base44.asServiceRole.entities.ComissaoEmprestimoPaga.delete(item.id);
      }

      // 4. Deletar o lote
      await base44.asServiceRole.entities.LotePagamentoComissaoEmprestimo.delete(lote_id);

      return Response.json({
        success: true,
        message: `Lote excluído. ${propostaIds.length} proposta(s) revertida(s) para pendente.`,
      });

    } else if (tipo === 'consorcio') {
      // 1. Buscar o lote para pegar os comissoes_ids
      const lotes = await base44.asServiceRole.entities.PagamentoComissaoLote.filter({ id: lote_id });
      const lote = lotes[0];
      if (!lote) {
        return Response.json({ error: 'Lote não encontrado' }, { status: 404 });
      }

      // 2. Reverter ComissaoAPagar para a_pagar
      let comissoesIds = [];
      try {
        comissoesIds = lote.comissoes_ids ? JSON.parse(lote.comissoes_ids) : [];
      } catch { comissoesIds = []; }

      for (const cid of comissoesIds) {
        await base44.asServiceRole.entities.ComissaoAPagar.update(cid, {
          status_pagamento: 'a_pagar',
          data_pagamento: null,
          forma_pagamento: null,
          pagamento_id: null,
          protocolo: null,
        });
      }

      // 3. Buscar e deletar PagamentoComissaoItem do lote
      const itens = await base44.asServiceRole.entities.PagamentoComissaoItem.filter(
        { pagamento_id: lote_id }, null, 500
      );
      for (const item of itens) {
        await base44.asServiceRole.entities.PagamentoComissaoItem.delete(item.id);
      }

      // 4. Deletar o lote
      await base44.asServiceRole.entities.PagamentoComissaoLote.delete(lote_id);

      return Response.json({
        success: true,
        message: `Lote excluído. ${comissoesIds.length} comissão(ões) revertida(s) para a pagar.`,
      });

    } else {
      return Response.json({ error: 'Tipo inválido' }, { status: 400 });
    }

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { vendaId, novoVendedorId } = await req.json();

    // Buscar a venda
    const venda = await base44.asServiceRole.entities.Venda.filter({ id: vendaId });
    if (!venda || venda.length === 0) {
      return Response.json({ error: 'Venda não encontrada' }, { status: 404 });
    }

    const vendaData = venda[0];

    // Se o vendedor é o mesmo, permite
    if (vendaData.vendedor_id === novoVendedorId) {
      return Response.json({ 
        permitir: true, 
        mensagem: 'Mesmo vendedor, nenhuma alteração necessária' 
      });
    }

    // Verificar se existem comissões pagas (quitadas)
    const comissoesPagas = await base44.asServiceRole.entities.ComissaoAPagar.filter({
      venda_id: vendaId,
      status_pagamento: 'quitada'
    });

    if (comissoesPagas && comissoesPagas.length > 0) {
      return Response.json({
        permitir: false,
        mensagem: `Não é possível alterar o vendedor. Existem ${comissoesPagas.length} comissão(ões) quitada(s). Estorne o valor antes de alterar.`,
        comissoesPagas: comissoesPagas.length
      }, { status: 400 });
    }

    // Permitir se todas as comissões estão a pagar
    return Response.json({
      permitir: true,
      mensagem: 'Vendedor pode ser alterado. Todas as comissões estão a pagar.'
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});
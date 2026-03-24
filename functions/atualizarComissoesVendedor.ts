import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data } = payload;

    // Verificar se o vendedor foi alterado
    if (!data || !old_data || data.vendedor_id === old_data.vendedor_id) {
      return Response.json({ success: true, message: 'Vendedor não foi alterado' });
    }

    const vendaId = event.entity_id;
    const novoVendedorId = data.vendedor_id;
    const novoVendedorNome = data.vendedor_nome;

    // Buscar todas as comissões relacionadas a esta venda
    const comissoes = await base44.asServiceRole.entities.ComissaoAPagar.filter({
      venda_id: vendaId
    });

    // Atualizar cada comissão com o novo vendedor
    const updates = [];
    for (const comissao of comissoes) {
      updates.push(
        base44.asServiceRole.entities.ComissaoAPagar.update(comissao.id, {
          vendedor_id: novoVendedorId,
          vendedor_nome: novoVendedorNome
        })
      );
    }

    await Promise.all(updates);

    return Response.json({ 
      success: true, 
      message: `Vendedor atualizado para ${comissoes.length} comissão(ões)`,
      comissoesAtualizadas: comissoes.length
    });
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'gerente', 'master', 'super_admin'].includes(user.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { grupo, cota, dataRecebimento, valorRecebido, percentualComissao } = await req.json();

    // Buscar a venda pelo grupo e cota
    const vendas = await base44.asServiceRole.entities.Venda.filter({
      grupo: grupo.toString(),
      cota: cota.toString()
    });

    if (!vendas || vendas.length === 0) {
      return Response.json({ error: 'Venda não encontrada para este grupo/cota' }, { status: 404 });
    }

    const venda = vendas[0];

    // Criar hash de duplicidade
    const hashDuplicidade = `${venda.id}_${dataRecebimento}_${valorRecebido}`;

    // Calcular valor a pagar
    const valorAPagar = valorRecebido * (percentualComissao / 100);

    // Criar RecebimentoComissao
    const recebimento = await base44.asServiceRole.entities.RecebimentoComissao.create({
      empresa_id: venda.empresa_id,
      venda_id: venda.id,
      cliente_id: venda.cliente_id,
      cliente_nome: venda.cliente_nome,
      vendedor_id: venda.vendedor_id,
      vendedor_nome: venda.vendedor_nome,
      administradora_id: venda.administradora_id,
      administradora_nome: venda.administradora_nome,
      grupo: venda.grupo,
      cota: venda.cota,
      contrato: venda.contrato || '',
      data_recebimento: dataRecebimento,
      valor_recebido: valorRecebido,
      hash_duplicidade: hashDuplicidade,
      percentual_comissao: percentualComissao,
      valor_a_pagar: valorAPagar,
      status_recebimento: 'recebida',
      status_pagamento: 'a_pagar'
    });

    // Criar ComissaoAPagar automaticamente
    const comissao = await base44.asServiceRole.entities.ComissaoAPagar.create({
      empresa_id: venda.empresa_id,
      recebimento_id: recebimento.id,
      venda_id: venda.id,
      cliente_id: venda.cliente_id,
      cliente_nome: venda.cliente_nome,
      vendedor_id: venda.vendedor_id,
      vendedor_nome: venda.vendedor_nome,
      administradora_id: venda.administradora_id,
      administradora_nome: venda.administradora_nome,
      grupo: venda.grupo,
      cota: venda.cota,
      contrato: venda.contrato || '',
      parcela_numero: 1,
      data_recebimento: dataRecebimento,
      valor_recebido: valorRecebido,
      percentual_comissao: percentualComissao,
      valor_a_pagar: valorAPagar,
      status_pagamento: 'a_pagar'
    });

    return Response.json({
      success: true,
      recebimento: recebimento.id,
      comissao: comissao.id,
      venda: venda.id,
      vendedor: venda.vendedor_nome,
      valorAPagar: valorAPagar
    });
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    const {
      venda_id,
      cliente_id,
      vendedor_id,
      administradora_id,
      empresa_id,
      numero_contrato,
      grupo,
      cota,
      cliente_nome,
      administradora_nome,
      vendedor_nome,
      forma_recebimento,
      percentual,
      valor_comissao,
      data_recebimento,
      numero_parcela,
      observacao,
      origem,
    } = payload;

    // Validações
    if (!venda_id || !valor_comissao || !data_recebimento) {
      return Response.json(
        { error: 'Dados obrigatórios faltando' },
        { status: 400 }
      );
    }

    // 1. Criar registro em RecebimentoComissao
    const hashDuplicidade = `${venda_id}_${data_recebimento}_${valor_comissao}`;
    
    const recebimento = await base44.asServiceRole.entities.RecebimentoComissao.create({
      empresa_id,
      venda_id,
      cliente_id,
      cliente_nome,
      vendedor_id,
      vendedor_nome,
      administradora_id,
      administradora_nome,
      grupo,
      cota,
      contrato: numero_contrato,
      data_recebimento,
      valor_recebido: valor_comissao,
      parcela_informada: numero_parcela,
      percentual_comissao: percentual || 100,
      valor_a_pagar: valor_comissao,
      status_recebimento: 'recebida',
      status_pagamento: 'a_pagar',
      hash_duplicidade: hashDuplicidade,
      observacoes: observacao || `Recebimento manual - ${origem}`,
      origem_importacao_id: null,
      linha_importacao: null,
    });

    // 2. Atualizar Venda com comissão_recebida
    const venda = await base44.asServiceRole.entities.Venda.get(venda_id);
    const novaComissaoRecebida = (venda?.comissao_total_recebida || 0) + valor_comissao;

    await base44.asServiceRole.entities.Venda.update(venda_id, {
      comissao_total_recebida: novaComissaoRecebida,
    });

    // 3. Criar registro em ComissaoAPagar (para o fluxo de pagamento)
    await base44.asServiceRole.entities.ComissaoAPagar.create({
      empresa_id,
      recebimento_id: recebimento.id,
      venda_id,
      cliente_id,
      cliente_nome,
      vendedor_id,
      vendedor_nome,
      administradora_id,
      administradora_nome,
      grupo,
      cota,
      contrato: numero_contrato,
      parcela_numero: numero_parcela,
      data_recebimento,
      valor_recebido: valor_comissao,
      percentual_comissao: percentual || 100,
      valor_a_pagar: valor_comissao,
      status_pagamento: 'a_pagar',
    });

    return Response.json({
      success: true,
      recebimento_id: recebimento.id,
      valor_recebido: valor_comissao,
      data_recebimento,
    });
  } catch (error) {
    console.error('Erro em receberComissaoManual:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
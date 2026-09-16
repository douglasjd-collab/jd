import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Determinar origem: automação de entidade ou chamada direta
    let lote_id, tipo, vendedor_id, empresa_id, valor, protocolo, data_quitacao;

    if (body.event && body.data) {
      // Origem: automação de entidade
      const { event, data } = body;
      tipo = event.entity_name === 'LotePagamentoComissaoEmprestimo' ? 'emp' : 'consorcio';
      lote_id = event.entity_id;
      vendedor_id = data.vendedor_id;
      empresa_id = data.empresa_id;
      valor = data.valor_total || data.total_pago || 0;
      protocolo = data.lote_codigo || data.lote_code || '';
      data_quitacao = data.data_quitacao;
    } else {
      // Origem: chamada direta
      lote_id = body.lote_id;
      tipo = body.tipo;
      vendedor_id = body.vendedor_id;
      empresa_id = body.empresa_id;
      valor = body.valor || 0;
      protocolo = body.protocolo || '';
      data_quitacao = body.data_quitacao;
    }

    if (!lote_id || !vendedor_id || !empresa_id) {
      return Response.json({ error: 'Parâmetros obrigatórios: lote_id, vendedor_id, empresa_id' }, { status: 400 });
    }

    // Buscar colaborador vinculado ao vendedor_id
    const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
      { id: vendedor_id, empresa_id, status: 'ativo' },
      null,
      1
    );

    if (!colaboradores || colaboradores.length === 0) {
      return Response.json({ success: false, message: 'Colaborador não encontrado para o vendedor' });
    }

    const colab = colaboradores[0];

    // Só criar receita para parceiros
    if (colab.perfil !== 'parceiro') {
      return Response.json({ success: false, message: 'Vendedor não é parceiro, receita não criada' });
    }

    const filialId = colab.filial_id || null;
    const filialNome = colab.filial_nome || null;

    // Verificar se já existe receita pessoal para este lote (evitar duplicidade)
    const chaveLote = `LOTE_${lote_id}`;
    const existentes = await base44.asServiceRole.entities.MeuFinanceiroReceita.filter(
      { empresa_id, usuario_id: colab.user_id, observacao: chaveLote },
      null,
      1
    );

    if (existentes && existentes.length > 0) {
      return Response.json({ success: false, message: 'Receita já existe para este lote' });
    }

    // Criar a receita automática (pessoal do parceiro)
    const valorReceita = Math.abs(valor || 0);
    const dataRec = data_quitacao || new Date().toISOString().slice(0, 10);

    await base44.asServiceRole.entities.MeuFinanceiroReceita.create({
      empresa_id,
      usuario_id: colab.user_id,
      usuario_nome: colab.nome || 'Parceiro',
      descricao: `Comissão — ${protocolo || `Lote ${lote_id}`}`,
      categoria: 'Comissão',
      valor: valorReceita,
      data: dataRec,
      status: 'recebida',
      data_recebimento: dataRec,
      observacao: chaveLote,
    });

    // ── Criar também receita empresarial (Receita) vinculada à filial do parceiro ──
    // Isso garante que o DRE da Central Financeira atribua a produção do parceiro à sua filial.
    const chaveLoteEmpresa = `LOTE_EMP_${lote_id}`;
    const receitaEmpresaExistente = await base44.asServiceRole.entities.Receita.filter(
      { empresa_id, observacao: chaveLoteEmpresa },
      null,
      1
    );

    if (receitaEmpresaExistente && receitaEmpresaExistente.length > 0) {
      return Response.json({ success: true, message: 'Receita pessoal criada. Receita empresarial já existia.' });
    }

    // Calcular a comissão recebida do banco (valor que a empresa recebeu) para a receita empresarial
    let valorComissaoBanco = 0;
    try {
      if (tipo === 'emp') {
        // Empréstimo: somar valor_comissao_empresa_original das ComissaoEmprestimoPaga do lote
        const itens = await base44.asServiceRole.entities.ComissaoEmprestimoPaga.filter(
          { lote_pagamento_id: lote_id }
        );
        valorComissaoBanco = (itens || []).reduce((s, i) => s + (i.valor_comissao_empresa_original || 0), 0);
      } else if (tipo === 'consorcio') {
        // Consórcio: buscar o lote para obter comissoes_ids, depois somar valor_recebido de cada ComissaoAPagar
        const lotes = await base44.asServiceRole.entities.PagamentoComissaoLote.filter({ id: lote_id });
        if (lotes && lotes.length > 0) {
          let comissaoIds = [];
          try { comissaoIds = JSON.parse(lotes[0].comissoes_ids || '[]'); } catch {}
          if (comissaoIds.length > 0) {
            const comissoes = await base44.asServiceRole.entities.ComissaoAPagar.filter({ id: { $in: comissaoIds } });
            valorComissaoBanco = (comissoes || []).reduce((s, c) => s + (c.valor_recebido || 0), 0);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao calcular comissão do banco:', e);
    }

    // Fallback: se não conseguiu calcular a comissão do banco, usa o valor do lote
    const valorReceitaEmpresa = valorComissaoBanco > 0 ? valorComissaoBanco : valorReceita;

    // Buscar categoria de comissão (mesma lógica do registrarReceitaImportacao)
    let categoriaId = null;
    let categoriaNome = 'Comissão';
    try {
      const cats = await base44.asServiceRole.entities.CategoriaReceita.filter({ empresa_id, nome: { $regex: 'omiss' } });
      if (cats && cats.length > 0) {
        categoriaId = cats[0].id;
        categoriaNome = cats[0].nome;
      }
    } catch {}

    await base44.asServiceRole.entities.Receita.create({
      empresa_id,
      filial_id: filialId,
      filial_nome: filialNome,
      descricao: `Comissão recebida — ${protocolo || `Lote ${lote_id}`} (${colab.nome || 'Parceiro'})`,
      categoria_id: categoriaId,
      categoria_nome: categoriaNome,
      valor: valorReceitaEmpresa,
      data: dataRec,
      data_recebimento: dataRec,
      status: 'recebida',
      origem: `Comissão ${tipo === 'emp' ? 'Empréstimo' : 'Consórcio'} — Parceiro`,
      responsavel_id: vendedor_id,
      responsavel_nome: colab.nome || '',
      observacao: chaveLoteEmpresa,
    });

    return Response.json({ success: true, message: 'Receitas (pessoal + empresarial) criadas automaticamente' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
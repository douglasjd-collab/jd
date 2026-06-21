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

    // Verificar se já existe receita para este lote (evitar duplicidade)
    const chaveLote = `LOTE_${lote_id}`;
    const existentes = await base44.asServiceRole.entities.MeuFinanceiroReceita.filter(
      { empresa_id, usuario_id: colab.user_id, observacao: chaveLote },
      null,
      1
    );

    if (existentes && existentes.length > 0) {
      return Response.json({ success: false, message: 'Receita já existe para este lote' });
    }

    // Criar a receita automática
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

    return Response.json({ success: true, message: 'Receita de comissão criada automaticamente' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
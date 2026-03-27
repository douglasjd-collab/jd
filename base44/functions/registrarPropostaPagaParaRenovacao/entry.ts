import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Funciona tanto chamado via automação (payload de entity) quanto via chamada direta
    const propostaId = payload?.event?.entity_id || payload?.proposta_id;
    const propostaData = payload?.data || null;

    if (!propostaId) {
      return Response.json({ error: 'proposta_id não informado' }, { status: 400 });
    }

    // Buscar proposta atualizada
    let proposta = propostaData;
    if (!proposta || !proposta.status_id) {
      const lista = await base44.asServiceRole.entities.Proposta.filter({ id: propostaId });
      if (!lista || lista.length === 0) {
        return Response.json({ error: 'Proposta não encontrada' }, { status: 404 });
      }
      proposta = lista[0];
    }

    // Só processa empréstimos
    if (proposta.produto !== 'emprestimo') {
      return Response.json({ ok: true, ignorado: true, motivo: 'Não é empréstimo' });
    }

    // Verificar se o status é "finalizado" (pago)
    const statusList = await base44.asServiceRole.entities.StatusProposta.filter(
      { empresa_id: proposta.empresa_id }
    );

    const statusAtual = statusList.find(s => s.id === proposta.status_id);
    const isPago = statusAtual?.funcao_fluxo === 'finalizado' ||
      ['pago', 'paga'].includes((statusAtual?.nome || '').toLowerCase().trim());

    if (!isPago) {
      return Response.json({ ok: true, ignorado: true, motivo: 'Status não é finalizado/pago' });
    }

    // Verificar se já existe registro de renovação para esta proposta
    const existente = await base44.asServiceRole.entities.CampanhaRenovacao.filter({
      proposta_id: propostaId
    });

    if (existente && existente.length > 0) {
      return Response.json({ ok: true, ignorado: true, motivo: 'Renovação já registrada' });
    }

    // Buscar cliente para pegar telefone
    let clienteNome = proposta.cliente_nome || '';
    let clienteTelefone = '';
    let clienteCpf = proposta.cliente_cpf || '';

    if (proposta.cliente_id) {
      const clientes = await base44.asServiceRole.entities.Cliente.filter({ id: proposta.cliente_id });
      if (clientes && clientes.length > 0) {
        const c = clientes[0];
        clienteNome = c.nome_completo || c.pj_razao_social || clienteNome;
        clienteTelefone = c.celular || c.pj_celular || '';
        clienteCpf = c.cpf || c.pj_cnpj || clienteCpf;
      }
    }

    // Calcular data de envio: 1 ano após data_pagamento ou data_venda
    const dataPagamento = proposta.emprestimo_data_liberacao || proposta.data_venda || new Date().toISOString().slice(0, 10);
    const dataAgendada = new Date(dataPagamento);
    dataAgendada.setFullYear(dataAgendada.getFullYear() + 1);
    const dataAgendadaStr = dataAgendada.toISOString().slice(0, 10);

    // Criar registro na fila de renovação
    await base44.asServiceRole.entities.CampanhaRenovacao.create({
      empresa_id: proposta.empresa_id,
      proposta_id: propostaId,
      cliente_id: proposta.cliente_id || '',
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone,
      cliente_cpf: clienteCpf,
      valor_credito: proposta.valor_credito || 0,
      banco_nome: proposta.administradora_nome || '',
      data_pagamento: dataPagamento,
      data_agendada_envio: dataAgendadaStr,
      status: 'aguardando',
    });

    console.log(`✅ Renovação agendada para proposta ${propostaId} em ${dataAgendadaStr}`);

    return Response.json({
      ok: true,
      proposta_id: propostaId,
      cliente_nome: clienteNome,
      data_agendada: dataAgendadaStr,
    });

  } catch (error) {
    console.error('Erro em registrarPropostaPagaParaRenovacao:', error);
    return Response.json({ error: error.message, ok: false }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId) {
      return Response.json({ error: 'empresa_id não informado' }, { status: 400 });
    }

    // Buscar todos os status da empresa
    const statusList = await base44.asServiceRole.entities.StatusProposta.filter(
      { empresa_id: empresaId }
    );

    // IDs de status considerados "pagos/finalizados"
    const statusPagosIds = statusList
      .filter(s =>
        s.funcao_fluxo === 'finalizado' ||
        ['pago', 'paga', 'pago - comissão recebida', 'finalizado', 'quitado'].includes(
          (s.nome || '').toLowerCase().trim()
        )
      )
      .map(s => s.id);

    console.log(`✅ Status pagos encontrados: ${statusPagosIds.length} -> ${statusList.filter(s => statusPagosIds.includes(s.id)).map(s => s.nome).join(', ')}`);

    if (statusPagosIds.length === 0) {
      return Response.json({ ok: false, error: 'Nenhum status pago/finalizado encontrado' });
    }

    // Buscar todas as propostas de empréstimo da empresa
    const propostas = await base44.asServiceRole.entities.Proposta.filter(
      { empresa_id: empresaId, produto: 'emprestimo' },
      '-created_date',
      10000
    );

    // Filtrar apenas as pagas
    const propostasPagas = propostas.filter(p => statusPagosIds.includes(p.status_id));

    console.log(`📋 Total propostas empréstimo: ${propostas.length} | Pagas: ${propostasPagas.length}`);

    // Buscar renovações já existentes para evitar duplicatas
    const renovacoesExistentes = await base44.asServiceRole.entities.CampanhaRenovacao.filter(
      { empresa_id: empresaId },
      '-created_date',
      10000
    );

    const propostasJaRegistradas = new Set(renovacoesExistentes.map(r => r.proposta_id));

    console.log(`🔄 Renovações já existentes: ${propostasJaRegistradas.size}`);

    let criadas = 0;
    let ignoradas = 0;
    const erros = [];

    for (const proposta of propostasPagas) {
      if (propostasJaRegistradas.has(proposta.id)) {
        ignoradas++;
        continue;
      }

      try {
        // Buscar telefone do cliente
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

        // Data de pagamento: usar data_liberacao ou data_venda
        const dataPagamento = proposta.emprestimo_data_liberacao || proposta.data_venda || proposta.created_date?.slice(0, 10) || new Date().toISOString().slice(0, 10);

        // Data agendada: 1 ano após pagamento
        const dataAgendada = new Date(dataPagamento);
        dataAgendada.setFullYear(dataAgendada.getFullYear() + 1);
        const dataAgendadaStr = dataAgendada.toISOString().slice(0, 10);

        await base44.asServiceRole.entities.CampanhaRenovacao.create({
          empresa_id: empresaId,
          proposta_id: proposta.id,
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

        criadas++;
        console.log(`✅ Criada renovação para proposta ${proposta.id} - ${clienteNome} - envio em ${dataAgendadaStr}`);
      } catch (e) {
        erros.push({ proposta_id: proposta.id, erro: e.message });
        console.error(`❌ Erro ao criar renovação para ${proposta.id}:`, e.message);
      }
    }

    return Response.json({
      ok: true,
      total_propostas_pagas: propostasPagas.length,
      criadas,
      ignoradas,
      erros: erros.length,
      detalhes_erros: erros,
    });

  } catch (error) {
    console.error('Erro em sincronizarPropostasPagasParaRenovacao:', error);
    return Response.json({ error: error.message, ok: false }, { status: 500 });
  }
});
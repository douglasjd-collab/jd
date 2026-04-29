import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permitir chamada autenticada (admin) ou via automação (sem usuário)
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user && ['admin', 'master', 'super_admin'].includes(user.perfil || user.role);
    } catch {
      // chamada via automação agendada sem usuário — permitido
      isAdmin = true;
    }

    if (!isAdmin) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Mês de referência = mês atual (ex: "04/2026")
    const agora = new Date();
    // Brasília = UTC-3
    const brAgora = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
    const mes = String(brAgora.getUTCMonth() + 1).padStart(2, '0');
    const ano = brAgora.getUTCFullYear();
    const mesReferencia = `${mes}/${ano}`;

    // Data de pagamento sugerida: dia 05 do mês atual
    const dataPagamento = `${ano}-${mes}-05`;

    // Buscar todas as empresas ativas
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });

    let totalCriadas = 0;
    let totalPuladas = 0;

    for (const empresa of empresas) {
      // Buscar colaboradores ativos da empresa
      const colaboradores = await base44.asServiceRole.entities.FuncionarioColaborador.filter({
        empresa_id: empresa.id,
        status: 'Ativo'
      });

      for (const colab of colaboradores) {
        // Verificar se já existe folha para este colaborador neste mês
        const folhasExistentes = await base44.asServiceRole.entities.FolhaSalarial.filter({
          colaborador_id: colab.id,
          mes_referencia: mesReferencia
        });

        if (folhasExistentes.length > 0) {
          totalPuladas++;
          continue;
        }

        // Buscar adiantamentos pendentes do colaborador
        const adiantamentos = await base44.asServiceRole.entities.AdiantamentoFuncionario.filter({
          colaborador_id: colab.id,
          status: 'Pendente'
        });
        const totalAdiantamentos = adiantamentos.reduce((s, a) => s + (a.valor || 0), 0);

        // Calcular valor líquido
        const salarioBase = colab.salario_base || 0;
        const valorLiquido = salarioBase - totalAdiantamentos;

        // Criar a folha salarial
        const folha = await base44.asServiceRole.entities.FolhaSalarial.create({
          empresa_id: empresa.id,
          colaborador_id: colab.id,
          colaborador_nome: colab.nome,
          mes_referencia: mesReferencia,
          data_pagamento: dataPagamento,
          salario_base: salarioBase,
          dias_trabalhados: 30,
          valor_comissao: 0,
          bonificacoes: 0,
          adiantamentos: totalAdiantamentos,
          descontos: 0,
          valor_liquido: valorLiquido,
          status: 'Rascunho',
          observacoes: totalAdiantamentos > 0
            ? `Adiantamentos descontados automaticamente: R$ ${totalAdiantamentos.toFixed(2).replace('.', ',')}`
            : ''
        });

        // Marcar adiantamentos como descontados
        if (totalAdiantamentos > 0) {
          for (const adi of adiantamentos) {
            await base44.asServiceRole.entities.AdiantamentoFuncionario.update(adi.id, {
              status: 'Descontado',
              folha_id: folha.id
            });
          }
        }

        totalCriadas++;
      }
    }

    return Response.json({
      success: true,
      mes_referencia: mesReferencia,
      folhas_criadas: totalCriadas,
      folhas_puladas: totalPuladas,
      message: `${totalCriadas} folhas criadas para ${mesReferencia}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
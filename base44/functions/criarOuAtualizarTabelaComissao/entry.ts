import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Tenta criar ou atualizar uma tabela de comissão
 * Se faltar campos obrigatórios, cadastra como PENDENTE
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      codigo_tabela,
      nome_tabela,
      convenio_id,
      banco_id,
      tipo_operacao,
      empresa_parceira_id,
      percentual_comissao,
      empresa_id
    } = await req.json();

    // Validar campos obrigatórios
    const camposObrigatorios = {
      nome_tabela,
      convenio_id,
      banco_id,
      tipo_operacao,
      empresa_parceira_id
    };

    const camposFaltando = Object.entries(camposObrigatorios)
      .filter(([_, valor]) => !valor)
      .map(([campo]) => campo);

    const empresaParceiraData = empresa_parceira_id 
      ? await base44.entities.EmpresaParceira.filter({ id: empresa_parceira_id })
      : null;

    const tabelaData = {
      empresa_id: empresa_id || user.empresa_id,
      codigo_tabela: codigo_tabela || null,
      nome_tabela,
      convenio_id,
      banco_id,
      tipo_operacao,
      empresa_parceira_id,
      empresa_parceira_nome: empresaParceiraData?.[0]?.nome || null,
      percentual_comissao: percentual_comissao || 0,
      status: camposFaltando.length > 0 ? 'pendente' : 'ativo'
    };

    // Se faltam campos obrigatórios: cria como PENDENTE
    if (camposFaltando.length > 0) {
      const tabelaCriada = await base44.entities.TabelaComissaoEmprestimo.create({
        ...tabelaData,
        status: 'pendente',
        motivo_pendencia: `Campos faltando: ${camposFaltando.join(', ')}`
      });

      return Response.json({
        success: true,
        tabela_id: tabelaCriada.id,
        status: 'pendente',
        message: `Tabela criada como PENDENTE. Campos faltando: ${camposFaltando.join(', ')}`
      });
    }

    // Todos os campos preenchidos: tenta atualizar ou criar
    const tabelasExistentes = await base44.entities.TabelaComissaoEmprestimo.filter({
      nome_tabela,
      empresa_parceira_id
    });

    let tabelaFinal;
    if (tabelasExistentes.length > 0) {
      // Atualizar existente
      await base44.entities.TabelaComissaoEmprestimo.update(
        tabelasExistentes[0].id,
        tabelaData
      );
      tabelaFinal = { id: tabelasExistentes[0].id, ...tabelaData };
      return Response.json({
        success: true,
        tabela_id: tabelaFinal.id,
        status: 'atualizada',
        message: 'Tabela de comissão atualizada com sucesso'
      });
    } else {
      // Criar nova
      tabelaFinal = await base44.entities.TabelaComissaoEmprestimo.create(tabelaData);
      return Response.json({
        success: true,
        tabela_id: tabelaFinal.id,
        status: 'criada',
        message: 'Tabela de comissão criada com sucesso'
      });
    }
  } catch (error) {
    console.error('Erro ao criar/atualizar tabela:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
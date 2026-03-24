import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vendas, empresa_id, data_desde } = await req.json();

    if (!Array.isArray(vendas) || vendas.length === 0) {
      return Response.json({ 
        error: 'Payload inválido. Envie um array de vendas.' 
      }, { status: 400 });
    }

    // Filtrar por data se informado
    let vendasFiltradas = vendas;
    if (data_desde) {
      const dataFiltro = new Date(data_desde);
      vendasFiltradas = vendas.filter(v => {
        if (!v.updated_at && !v.created_at && !v.data_venda) return true; // Se não tem data, incluir
        const dataVenda = new Date(v.updated_at || v.created_at || v.data_venda);
        return dataVenda >= dataFiltro;
      });
    }

    const empresaIdFinal = empresa_id || user.empresa_id;
    if (!empresaIdFinal) {
      return Response.json({ 
        error: 'empresa_id não encontrado. Informe no payload ou vincule usuário a uma empresa.' 
      }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const errors = [];
    let successCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < vendasFiltradas.length; i++) {
      const venda = vendasFiltradas[i];
      const external_id = venda.id?.toString();

      try {
        // Validações básicas
        if (!external_id) {
          errors.push({
            index: i,
            external_id: null,
            type: 'VENDA',
            field: 'id',
            message: 'Campo obrigatório ausente',
            suggestion: 'Informe o ID da venda no sistema origem',
            raw_data: venda
          });
          continue;
        }

        if (!venda.cliente_id) {
          errors.push({
            index: i,
            external_id,
            type: 'VENDA',
            field: 'cliente_id',
            message: 'cliente_id não informado',
            suggestion: 'Informe o ID do cliente no sistema origem',
            raw_data: venda
          });
          continue;
        }

        // Buscar cliente por external_id
        const clientesEncontrados = await base44.asServiceRole.entities.Cliente.filter({
          empresa_id: empresaIdFinal,
          external_id: venda.cliente_id.toString()
        });

        if (clientesEncontrados.length === 0) {
          errors.push({
            index: i,
            external_id,
            type: 'VENDA',
            field: 'cliente_id',
            message: 'Cliente não encontrado no Base44',
            suggestion: `Sincronize o cliente com external_id=${venda.cliente_id} antes de sincronizar esta venda`,
            raw_data: venda
          });
          continue;
        }

        const cliente = clientesEncontrados[0];

        // Validar campos obrigatórios
        const camposObrigatorios = [
          'administradora_id',
          'tabela_id',
          'grupo',
          'vendedor_id',
          'data_venda',
          'valorCredito',
          'taxaAdministracao'
        ];

        let campoFaltando = null;
        for (const campo of camposObrigatorios) {
          if (!venda[campo]) {
            campoFaltando = campo;
            break;
          }
        }

        if (campoFaltando) {
          errors.push({
            index: i,
            external_id,
            type: 'VENDA',
            field: campoFaltando,
            message: 'Campo obrigatório ausente',
            suggestion: `Informe o campo ${campoFaltando} para criar a venda`,
            raw_data: venda
          });
          continue;
        }

        // Verificar se já existe (por external_id)
        const existente = await base44.asServiceRole.entities.Venda.filter({
          empresa_id: empresaIdFinal,
          external_id: external_id
        });

        const vendaData = {
          empresa_id: empresaIdFinal,
          external_id: external_id,
          cliente_id: cliente.id,
          cliente_nome: cliente.nome,
          cliente_cpf: cliente.cpf,
          administradora_id: venda.administradora_id,
          administradora_nome: venda.administradora_nome || '',
          tabela_id: venda.tabela_id,
          tabela_nome: venda.tabela_nome || '',
          tipoEmpresa: venda.tipoEmpresa || '',
          plano_id: venda.plano_id || '',
          grupo: venda.grupo,
          cota: venda.cota || '',
          contrato: venda.contrato || '',
          valorCredito: parseFloat(venda.valorCredito),
          taxaAdministracao: parseFloat(venda.taxaAdministracao),
          percentualComissao: venda.percentualComissao || 0,
          valorComissao: venda.valorComissao || 0,
          vendedor_id: venda.vendedor_id,
          vendedor_nome: venda.vendedor_nome || '',
          gerente_id: venda.gerente_id || '',
          gerente_nome: venda.gerente_nome || '',
          data_venda: venda.data_venda,
          status: venda.status || 'ativa',
          comissao_total_prevista: venda.comissao_total_prevista || 0,
          comissao_total_recebida: venda.comissao_total_recebida || 0
        };

        if (existente.length > 0) {
          // Atualizar
          await base44.asServiceRole.entities.Venda.update(existente[0].id, vendaData);
          updatedCount++;
        } else {
          // Criar
          await base44.asServiceRole.entities.Venda.create(vendaData);
          successCount++;
        }

      } catch (error) {
        errors.push({
          index: i,
          external_id,
          type: 'VENDA',
          field: 'unknown',
          message: error.message || 'Erro ao processar venda',
          suggestion: 'Verifique os dados e tente novamente',
          raw_data: venda
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const total = vendasFiltradas.length;
    const failed = errors.length;

    // Criar log
    const logData = {
      empresa_id: empresaIdFinal,
      tipo: 'VENDAS',
      origem: 'VendaWeb',
      data_desde: data_desde || null,
      started_at: startedAt,
      finished_at: finishedAt,
      total,
      success: successCount,
      updated: updatedCount,
      failed,
      errors_json: JSON.stringify(errors),
      created_by: user.id,
      created_by_nome: user.full_name,
      status: failed === 0 ? 'sucesso' : (successCount > 0 || updatedCount > 0) ? 'parcial' : 'erro'
    };

    await base44.asServiceRole.entities.SyncLog.create(logData);

    return Response.json({
      success: true,
      summary: {
        total,
        successCount,
        updatedCount,
        errorCount: failed
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    return Response.json({ 
      error: error.message || 'Erro ao sincronizar vendas' 
    }, { status: 500 });
  }
});
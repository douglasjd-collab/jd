import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { comissoes, empresa_id, data_desde } = await req.json();

    if (!Array.isArray(comissoes) || comissoes.length === 0) {
      return Response.json({ 
        error: 'Payload inválido. Envie um array de comissões.' 
      }, { status: 400 });
    }

    const empresaIdFinal = empresa_id || user.empresa_id;
    if (!empresaIdFinal) {
      return Response.json({ 
        error: 'empresa_id não encontrado. Informe no payload ou vincule usuário a uma empresa.' 
      }, { status: 400 });
    }

    // Filtrar por data se informado
    let comissoesFiltradas = comissoes;
    if (data_desde) {
      const dataFiltro = new Date(data_desde);
      comissoesFiltradas = comissoes.filter(c => {
        if (!c.updated_at && !c.created_at && !c.data_pagamento) return true;
        const dataComissao = new Date(c.updated_at || c.created_at || c.data_pagamento);
        return dataComissao >= dataFiltro;
      });
    }

    const startedAt = new Date().toISOString();
    const errors = [];
    let successCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < comissoesFiltradas.length; i++) {
      const comissao = comissoesFiltradas[i];
      const external_id = comissao.id?.toString();

      try {
        // Validações básicas
        if (!external_id) {
          errors.push({
            index: i,
            external_id: null,
            type: 'COMISSAO',
            field: 'id',
            message: 'Campo obrigatório ausente',
            suggestion: 'Informe o ID da comissão no sistema origem',
            raw_data: comissao
          });
          continue;
        }

        if (!comissao.venda_id) {
          errors.push({
            index: i,
            external_id,
            type: 'COMISSAO',
            field: 'venda_id',
            message: 'venda_id não informado',
            suggestion: 'Informe o ID da venda no sistema origem',
            raw_data: comissao
          });
          continue;
        }

        // Buscar venda por external_id
        const vendasEncontradas = await base44.asServiceRole.entities.Venda.filter({
          empresa_id: empresaIdFinal,
          external_id: comissao.venda_id.toString()
        });

        if (vendasEncontradas.length === 0) {
          errors.push({
            index: i,
            external_id,
            type: 'COMISSAO',
            field: 'venda_id',
            message: 'Venda não encontrada no Base44',
            suggestion: `Sincronize a venda com external_id=${comissao.venda_id} antes de sincronizar esta comissão`,
            raw_data: comissao
          });
          continue;
        }

        const venda = vendasEncontradas[0];

         // Validar se usuário é super_admin (não pode receber comissão)
         if (comissao.usuario_perfil === 'super_admin') {
           errors.push({
             index: i,
             external_id,
             type: 'COMISSAO',
             field: 'usuario_perfil',
             message: 'Usuário super_admin não pode receber comissão',
             suggestion: 'Apenas usuários com perfil admin, gerente ou vendedor podem receber comissão',
             raw_data: comissao
           });
           continue;
         }

         // Validar campos obrigatórios
        const camposObrigatorios = ['usuario_id', 'tipo', 'valor', 'tipo_comissao'];
        let campoFaltando = null;
        for (const campo of camposObrigatorios) {
          if (!comissao[campo]) {
            campoFaltando = campo;
            break;
          }
        }

        if (campoFaltando) {
          errors.push({
            index: i,
            external_id,
            type: 'COMISSAO',
            field: campoFaltando,
            message: 'Campo obrigatório ausente',
            suggestion: `Informe o campo ${campoFaltando} para criar a comissão`,
            raw_data: comissao
          });
          continue;
        }

        // Verificar se já existe (por external_id)
        const existente = await base44.asServiceRole.entities.Comissao.filter({
          empresa_id: empresaIdFinal,
          external_id: external_id
        });

        const comissaoData = {
          empresa_id: empresaIdFinal,
          external_id: external_id,
          venda_id: venda.id,
          parcela_id: comissao.parcela_id || null,
          usuario_id: comissao.usuario_id,
          usuario_nome: comissao.usuario_nome || '',
          usuario_perfil: comissao.usuario_perfil || '',
          tipo_comissao: comissao.tipo_comissao,
          tipo: comissao.tipo,
          valor: parseFloat(comissao.valor),
          percentual: parseFloat(comissao.percentual) || 0,
          status: comissao.status || 'prevista',
          data_pagamento: comissao.data_pagamento || null,
          data_recebimento: comissao.data_recebimento || null,
          administradora_id: comissao.administradora_id || venda.administradora_id,
          observacoes: comissao.observacoes || ''
        };

        if (existente.length > 0) {
          // Atualizar
          await base44.asServiceRole.entities.Comissao.update(existente[0].id, comissaoData);
          updatedCount++;
        } else {
          // Criar
          await base44.asServiceRole.entities.Comissao.create(comissaoData);
          successCount++;
        }

      } catch (error) {
        errors.push({
          index: i,
          external_id,
          type: 'COMISSAO',
          field: 'unknown',
          message: error.message || 'Erro ao processar comissão',
          suggestion: 'Verifique os dados e tente novamente',
          raw_data: comissao
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const total = comissoesFiltradas.length;
    const failed = errors.length;

    // Criar log
    const logData = {
      empresa_id: empresaIdFinal,
      tipo: 'COMISSOES',
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
      error: error.message || 'Erro ao sincronizar comissões' 
    }, { status: 500 });
  }
});
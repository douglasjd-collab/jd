import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vendas, empresa_id } = await req.json();

    if (!Array.isArray(vendas) || vendas.length === 0) {
      return Response.json({ 
        error: 'Payload inválido. Envie um array de vendas.' 
      }, { status: 400 });
    }

    const empresaIdFinal = empresa_id || user.empresa_id;
    if (!empresaIdFinal) {
      return Response.json({ 
        error: 'empresa_id não encontrado.' 
      }, { status: 400 });
    }

    const errors = [];
    let validCount = 0;

    for (let i = 0; i < vendas.length; i++) {
      const venda = vendas[i];
      const external_id = venda.id?.toString();
      let hasError = false;

      // Validação: ID
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
        hasError = true;
      }

      // Validação: cliente_id
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
        hasError = true;
      } else {
        // Verificar se cliente existe
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
          hasError = true;
        }
      }

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

      for (const campo of camposObrigatorios) {
        if (!venda[campo]) {
          errors.push({
            index: i,
            external_id,
            type: 'VENDA',
            field: campo,
            message: 'Campo obrigatório ausente',
            suggestion: `Informe o campo ${campo} para criar a venda`,
            raw_data: venda
          });
          hasError = true;
        }
      }

      if (!hasError) {
        validCount++;
      }
    }

    return Response.json({
      success: true,
      validation: {
        total: vendas.length,
        validCount,
        errorCount: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    return Response.json({ 
      error: error.message || 'Erro ao validar vendas' 
    }, { status: 500 });
  }
});
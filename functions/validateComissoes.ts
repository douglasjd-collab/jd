import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { comissoes, empresa_id } = await req.json();

    if (!Array.isArray(comissoes) || comissoes.length === 0) {
      return Response.json({ 
        error: 'Payload inválido. Envie um array de comissões.' 
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

    for (let i = 0; i < comissoes.length; i++) {
      const comissao = comissoes[i];
      const external_id = comissao.id?.toString();
      let hasError = false;

      // Validação: ID
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
        hasError = true;
      }

      // Validação: venda_id
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
        hasError = true;
      } else {
        // Verificar se venda existe
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
          hasError = true;
        }
      }

      // Validar campos obrigatórios
      const camposObrigatorios = ['usuario_id', 'tipo', 'valor', 'tipo_comissao'];

      for (const campo of camposObrigatorios) {
        if (!comissao[campo]) {
          errors.push({
            index: i,
            external_id,
            type: 'COMISSAO',
            field: campo,
            message: 'Campo obrigatório ausente',
            suggestion: `Informe o campo ${campo} para criar a comissão`,
            raw_data: comissao
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
        total: comissoes.length,
        validCount,
        errorCount: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    return Response.json({ 
      error: error.message || 'Erro ao validar comissões' 
    }, { status: 500 });
  }
});
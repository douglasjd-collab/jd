import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientes, empresa_id } = await req.json();

    if (!Array.isArray(clientes) || clientes.length === 0) {
      return Response.json({ 
        error: 'Payload inválido. Envie um array de clientes.' 
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

    for (let i = 0; i < clientes.length; i++) {
      const cliente = clientes[i];
      const external_id = cliente.id?.toString();
      let hasError = false;

      // Validação: ID
      if (!external_id) {
        errors.push({
          index: i,
          external_id: null,
          type: 'CLIENTE',
          field: 'id',
          message: 'Campo obrigatório ausente',
          suggestion: 'Informe o ID do cliente no sistema origem',
          raw_data: cliente
        });
        hasError = true;
      }

      // Validação: nome
      if (!cliente.nome) {
        errors.push({
          index: i,
          external_id,
          type: 'CLIENTE',
          field: 'nome',
          message: 'Campo obrigatório ausente',
          suggestion: 'Informe o nome do cliente',
          raw_data: cliente
        });
        hasError = true;
      }

      // Validação: cpf
      if (!cliente.cpf) {
        errors.push({
          index: i,
          external_id,
          type: 'CLIENTE',
          field: 'cpf',
          message: 'Campo obrigatório ausente',
          suggestion: 'Informe o CPF do cliente',
          raw_data: cliente
        });
        hasError = true;
      }

      if (!hasError) {
        validCount++;
      }
    }

    return Response.json({
      success: true,
      validation: {
        total: clientes.length,
        validCount,
        errorCount: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    return Response.json({ 
      error: error.message || 'Erro ao validar clientes' 
    }, { status: 500 });
  }
});
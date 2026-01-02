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
        error: 'empresa_id não encontrado. Informe no payload ou vincule usuário a uma empresa.' 
      }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const errors = [];
    let successCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < clientes.length; i++) {
      const cliente = clientes[i];
      const external_id = cliente.id?.toString();

      try {
        // Validações
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
          continue;
        }

        if (!cliente.nome || !cliente.cpf) {
          errors.push({
            index: i,
            external_id,
            type: 'CLIENTE',
            field: !cliente.nome ? 'nome' : 'cpf',
            message: 'Campo obrigatório ausente',
            suggestion: 'Informe nome e CPF do cliente',
            raw_data: cliente
          });
          continue;
        }

        // Verificar se já existe (por external_id)
        const existente = await base44.asServiceRole.entities.Cliente.filter({
          empresa_id: empresaIdFinal,
          external_id: external_id
        });

        const clienteData = {
          empresa_id: empresaIdFinal,
          external_id: external_id,
          nome: cliente.nome,
          cpf: cliente.cpf,
          telefone: cliente.telefone || '',
          email: cliente.email || '',
          endereco: cliente.endereco || '',
          numero: cliente.numero || '',
          cidade: cliente.cidade || '',
          cep: cliente.cep || '',
          apelido: cliente.apelido || '',
          ponto_referencia: cliente.ponto_referencia || '',
          data_nascimento: cliente.data_nascimento || null,
          status: cliente.status || 'ativo'
        };

        if (existente.length > 0) {
          // Atualizar
          await base44.asServiceRole.entities.Cliente.update(existente[0].id, clienteData);
          updatedCount++;
        } else {
          // Criar
          await base44.asServiceRole.entities.Cliente.create(clienteData);
          successCount++;
        }

      } catch (error) {
        errors.push({
          index: i,
          external_id,
          type: 'CLIENTE',
          field: 'unknown',
          message: error.message || 'Erro ao processar cliente',
          suggestion: 'Verifique os dados e tente novamente',
          raw_data: cliente
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const total = clientes.length;
    const failed = errors.length;

    // Criar log
    const logData = {
      empresa_id: empresaIdFinal,
      tipo: 'CLIENTES',
      origem: 'VendaWeb',
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
      error: error.message || 'Erro ao sincronizar clientes' 
    }, { status: 500 });
  }
});
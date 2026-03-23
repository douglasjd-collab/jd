import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar se já tem Colaborador
    const colabs = await base44.entities.Colaborador.filter({
      user_id: user.id,
      status: 'ativo'
    });

    if (colabs.length > 0) {
      return Response.json({
        success: false,
        message: 'Colaborador já existe',
        colaborador: colabs[0]
      });
    }

    // Buscar empresa padrão (primeira empresa super_admin)
    const empresas = await base44.asServiceRole.entities.Empresa.filter({
      status: 'ativa'
    });

    if (empresas.length === 0) {
      return Response.json({
        error: 'Nenhuma empresa disponível para vinculação'
      }, { status: 400 });
    }

    const empresa = empresas[0]; // Primeira empresa disponível

    // Criar Colaborador automaticamente
    const novoColaborador = await base44.entities.Colaborador.create({
      user_id: user.id,
      empresa_id: empresa.id,
      empresa_nome: empresa.nome,
      nome: user.full_name,
      email: user.email,
      perfil: 'vendedor',
      status: 'ativo',
      tipo_agente: 'agente_loja',
      saldo_disponivel: 0
    });

    return Response.json({
      success: true,
      message: 'Colaborador criado com sucesso',
      colaborador: novoColaborador,
      empresa: empresa
    });
  } catch (error) {
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});
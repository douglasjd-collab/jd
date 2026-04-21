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

    // Em um SaaS:
    // - super_admin: vinculado a empresa SUPER_ADMIN (a que cria subcontas)
    // - admin/vendedor em subconta: vinculado à sua própria empresa
    
    let empresa;
    
    if (user.perfil === 'super_admin') {
      // Super admin: buscar empresa super_admin (Empresa da super conta)
      const empresasSuper = await base44.asServiceRole.entities.Empresa.filter({
        status: 'ativa'
      }, '-created_date', 1);
      
      if (empresasSuper.length === 0) {
        return Response.json({
          error: 'Nenhuma empresa super_admin disponível'
        }, { status: 400 });
      }
      empresa = empresasSuper[0];
    } else {
      // Admin/vendedor normal: buscar empresa do Colaborador existente OU empresa vinculada ao user
      let empresaId = user.empresa_id;
      
      if (!empresaId) {
        // Se não tiver empresa_id, não pode criar colaborador (deve ser vinculado na subconta)
        return Response.json({
          error: 'Usuário não vinculado a nenhuma subconta. Configure a empresa primeiro.',
          code: 'NO_COMPANY_LINKED'
        }, { status: 400 });
      }
      
      const empresasBusca = await base44.asServiceRole.entities.Empresa.filter({
        id: empresaId
      });
      
      if (empresasBusca.length === 0) {
        return Response.json({
          error: 'Empresa não encontrada'
        }, { status: 400 });
      }
      
      empresa = empresasBusca[0];
    }

    // Determinar perfil: super_admin OU usar perfil do user
    const perfilFinal = user.perfil === 'super_admin' ? 'super_admin' : (user.perfil || 'vendedor');
    
    // Criar Colaborador automaticamente
    const novoColaborador = await base44.entities.Colaborador.create({
      user_id: user.id,
      empresa_id: empresa.id,
      empresa_nome: empresa.nome,
      nome: user.full_name,
      email: user.email,
      perfil: perfilFinal,
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
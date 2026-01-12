import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { email, perfil } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    const targetPerfil = perfil || 'super_admin';

    // Buscar usuário
    const users = await base44.asServiceRole.entities.User.filter({ email });

    if (users.length === 0) {
      return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const targetUser = users[0];

    // Atualizar role no User para admin (necessário para ter permissões)
    await base44.asServiceRole.entities.User.update(targetUser.id, {
      role: 'admin'
    });

    // Buscar ou criar Colaborador
    const colaboradores = await base44.asServiceRole.entities.Colaborador.filter({ 
      user_id: targetUser.id 
    });

    if (colaboradores.length > 0) {
      // Atualizar Colaborador existente
      const updateData = {
        perfil: targetPerfil,
        status: 'ativo'
      };
      
      // Super admin não precisa de empresa_id
      if (targetPerfil === 'super_admin' || targetPerfil === 'master') {
        updateData.empresa_id = '';
      }
      
      await base44.asServiceRole.entities.Colaborador.update(colaboradores[0].id, updateData);
    } else {
      // Criar novo Colaborador
      const createData = {
        user_id: targetUser.id,
        nome: targetUser.full_name,
        email: targetUser.email,
        perfil: targetPerfil,
        status: 'ativo'
      };
      
      // Super admin não precisa de empresa_id
      if (targetPerfil !== 'super_admin' && targetPerfil !== 'master') {
        createData.empresa_id = '';
      }
      
      await base44.asServiceRole.entities.Colaborador.create(createData);
    }

    return Response.json({ 
      success: true, 
      message: `Usuário ${email} atualizado para ${targetPerfil === 'super_admin' ? 'Super Admin' : targetPerfil} com sucesso!`,
      userId: targetUser.id
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
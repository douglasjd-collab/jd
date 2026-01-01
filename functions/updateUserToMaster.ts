import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permitir apenas se já for master ou se for o primeiro usuário
    if (user.perfil !== 'master' && user.email !== 'douglas.jdpromotora@gmail.com') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    // Buscar usuário
    const users = await base44.asServiceRole.entities.User.filter({ email });

    if (users.length === 0) {
      return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const targetUser = users[0];

    // Atualizar para master
    await base44.asServiceRole.entities.User.update(targetUser.id, {
      perfil: 'master'
    });

    return Response.json({ 
      success: true, 
      message: `Usuário ${email} atualizado para Master com sucesso!` 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
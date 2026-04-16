import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['super_admin', 'master', 'admin'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { email, nova_senha } = body;

    if (!email || !nova_senha) {
      return Response.json({ error: 'email e nova_senha são obrigatórios' }, { status: 400 });
    }

    if (nova_senha.length < 6) {
      return Response.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email });

    if (!users || users.length === 0) {
      return Response.json({ error: `Usuário com email ${email} não encontrado.` }, { status: 404 });
    }

    const targetUser = users[0];

    await base44.asServiceRole.auth.setPassword(targetUser.id, nova_senha);

    return Response.json({
      success: true,
      message: `Senha definida com sucesso para ${email}`,
    });

  } catch (error) {
    console.error('Erro ao definir senha:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
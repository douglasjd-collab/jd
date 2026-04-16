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

    const { email, empresa_id, nome } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    // Reenviar convite — isso força o usuário a definir nova senha via email
    await base44.users.inviteUser(email, 'user');

    return Response.json({
      success: true,
      message: `Email de acesso reenviado para ${email}. O usuário poderá definir uma nova senha pelo link recebido.`,
    });

  } catch (error) {
    console.error('Erro ao reenviar acesso:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { email, senha, empresa_id, nome } = body;

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['super_admin', 'master', 'admin'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!email || !empresa_id) {
      return Response.json({ error: 'email e empresa_id são obrigatórios' }, { status: 400 });
    }

    // Verificar se o usuário já existe
    const existingUsers = await base44.asServiceRole.entities.User.filter({ email });

    if (existingUsers && existingUsers.length > 0) {
      // Usuário já existe — só garantir o Colaborador vinculado
      const userRecord = existingUsers[0];
      const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);

      const colaboradorData = {
        user_id: userRecord.id,
        nome: nome || userRecord.full_name || email.split('@')[0],
        email: email,
        perfil: 'admin',
        empresa_id: empresa_id,
        empresa_nome: empresa?.nome || '',
        status: 'ativo',
        };

        const existingColab = await base44.asServiceRole.entities.Colaborador.filter({ user_id: userRecord.id });
        if (existingColab.length > 0) {
        await base44.asServiceRole.entities.Colaborador.update(existingColab[0].id, colaboradorData);
        } else {
        await base44.asServiceRole.entities.Colaborador.create(colaboradorData);
        }

        return Response.json({
        success: true,
        message: `Usuário ${email} já existe no sistema. Acesso à subconta configurado com sucesso.`,
        ja_existia: true,
        });
    }

    // Usuário não existe — convidar via SDK
    await base44.users.inviteUser(email, 'user');

    // Aguardar o usuário aparecer no sistema
    let userRecord = null;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const found = await base44.asServiceRole.entities.User.filter({ email });
      if (found?.length) {
        userRecord = found[0];
        break;
      }
    }

    const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);

    if (userRecord) {
      const colaboradorData = {
        user_id: userRecord.id,
        nome: nome || userRecord.full_name || email,
        email: email,
        perfil: 'admin',
        empresa_id: empresa_id,
        empresa_nome: empresa?.nome || '',
        status: 'ativo',
      };

      const existingColab = await base44.asServiceRole.entities.Colaborador.filter({ user_id: userRecord.id });
      if (existingColab.length > 0) {
        await base44.asServiceRole.entities.Colaborador.update(existingColab[0].id, colaboradorData);
      } else {
        await base44.asServiceRole.entities.Colaborador.create(colaboradorData);
      }
    }

    return Response.json({
      success: true,
      message: `Convite enviado para ${email}. O usuário receberá um email para definir sua senha de acesso.`,
      ja_existia: false,
    });

  } catch (error) {
    console.error('Erro ao definir acesso:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
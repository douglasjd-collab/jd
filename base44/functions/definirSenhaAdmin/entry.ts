import { createClientFromRequest, createClient } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    // Ler o body primeiro, antes de qualquer outra coisa
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

    if (!email || !senha || !empresa_id) {
      return Response.json({ error: 'email, senha e empresa_id são obrigatórios' }, { status: 400 });
    }

    if (senha.length < 6) {
      return Response.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
    }

    // Criar cliente anônimo para usar auth.register()
    const APP_ID = Deno.env.get('BASE44_APP_ID');
    const anonClient = createClient({ appId: APP_ID });

    // Tentar registrar o usuário com senha
    let registroOk = false;
    try {
      await anonClient.auth.register({ email, password: senha });
      registroOk = true;
    } catch (regErr) {
      const msg = regErr.message || '';
      // Se já existe, tudo bem — vamos só vincular
      if (msg.includes('already') || msg.includes('existe') || msg.includes('registered') || msg.includes('409')) {
        registroOk = true;
      } else {
        console.error('Erro no register:', msg);
        return Response.json({ error: 'Erro ao criar usuário: ' + msg }, { status: 400 });
      }
    }

    if (!registroOk) {
      return Response.json({ error: 'Não foi possível criar o usuário' }, { status: 400 });
    }

    // Aguardar o usuário aparecer no sistema
    let userRecord = null;
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 800));
      const found = await base44.asServiceRole.entities.User.filter({ email });
      if (found?.length) {
        userRecord = found[0];
        break;
      }
    }

    if (!userRecord) {
      return Response.json({ success: true, message: 'Usuário registrado. Vincule o admin manualmente se necessário.' });
    }

    // Vincular como admin na subconta
    const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);
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

    return Response.json({ success: true, message: `Acesso definido para ${email}` });

  } catch (error) {
    console.error('Erro ao definir senha:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
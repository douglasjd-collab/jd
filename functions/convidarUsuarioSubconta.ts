import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { email, nome, perfil, empresaId, empresaNome, convidadoPorNome } = body;

    if (!email || !nome || !empresaId) {
      return Response.json({ error: 'Email, nome e empresaId são obrigatórios' }, { status: 400 });
    }

    // Validar email
    if (!email.includes('@')) {
      return Response.json({ error: 'Email inválido' }, { status: 400 });
    }

    // Verificar se colaborador com este email já existe
    const existentes = await base44.asServiceRole.entities.Colaborador.filter({
      email: email
    });

    if (existentes && existentes.length > 0) {
      return Response.json({ error: 'Este email já está cadastrado' }, { status: 409 });
    }

    // Enviar convite para o usuário
    await base44.users.inviteUser(email, 'user');

    // Criar Colaborador com status "pending" até o usuário aceitar o convite
    await base44.asServiceRole.entities.Colaborador.create({
      user_id: null,
      nome: nome,
      email: email,
      perfil: perfil || 'vendedor',
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      status: 'ativo',
    });

    return Response.json({
      success: true,
      message: 'Convite enviado com sucesso por email!',
      email: email,
      empresa: empresaNome,
    });
  } catch (error) {
    console.error('Erro ao convidar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { email, nome, perfil, empresaId, empresaNome } = body;

    if (!email || !nome || !empresaId) {
      return Response.json({ error: 'Email, nome e empresaId são obrigatórios' }, { status: 400 });
    }

    // Convitar o usuário via base44.users.inviteUser
    // Isso vai enviar um email com link de registro
    try {
      await base44.users.inviteUser(email, 'user');
    } catch (e) {
      // Se já existe, continua mesmo assim
      console.log('Usuário já existe ou erro ao convidar:', e.message);
    }

    // Criar um registro de colaborador pendente que será vinculado após cadastro
    // Usar a função de backend para fazer isso via service role
    const colaboradorPendente = await base44.asServiceRole.entities.Colaborador.create({
      email: email,
      nome: nome,
      perfil: perfil || 'vendedor',
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      user_id: null, // Será preenchido após cadastro
      status: 'ativo',
    });

    return Response.json({
      success: true,
      message: 'Convite enviado com sucesso',
      colaboradorId: colaboradorPendente.id,
    });
  } catch (error) {
    console.error('Erro ao convidar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
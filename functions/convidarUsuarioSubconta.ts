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

    // Criar um registro de colaborador pendente que será vinculado após cadastro
    const colaboradorPendente = await base44.asServiceRole.entities.Colaborador.create({
      email: email,
      nome: nome,
      perfil: perfil || 'vendedor',
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      user_id: 'pending',
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
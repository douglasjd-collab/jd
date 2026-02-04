import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar Colaborador do usuário
    const colabs = await base44.entities.Colaborador.filter(
      { user_id: user.id, status: 'ativo' },
      '-created_date'
    );

    const colab = colabs?.[0];
    const perfil = user.role === 'super_admin' ? 'super_admin' : colab?.perfil;

    // Apenas admin, super_admin e master podem listar
    if (!['admin', 'super_admin', 'master'].includes(perfil)) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // Listar todos os usuários usando service role
    const users = await base44.asServiceRole.entities.User.list('-created_date');

    return Response.json({ users });
  } catch (error) {
    console.error('Erro ao listar usuários pendentes:', error);
    return Response.json(
      { error: error.message || 'Erro ao listar usuários' },
      { status: 500 }
    );
  }
});
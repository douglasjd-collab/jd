import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Apenas super_admin pode fazer isso
    if (user.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden: Apenas super_admin pode alterar perfis' }, { status: 403 });
    }

    const { email, novoPerfil } = await req.json();

    if (!email || !novoPerfil) {
      return Response.json({ error: 'Email e novoPerfil são obrigatórios' }, { status: 400 });
    }

    console.log(`🔄 Alterando ${email} para perfil: ${novoPerfil}`);

    // Encontrar o Colaborador pelo email
    const colabs = await base44.asServiceRole.entities.Colaborador.filter({ email });

    if (!colabs || colabs.length === 0) {
      return Response.json({ error: 'Colaborador não encontrado' }, { status: 404 });
    }

    const colab = colabs[0];
    console.log(`✅ Colaborador encontrado: ${colab.id} - Perfil atual: ${colab.perfil}`);

    // Atualizar o perfil
    await base44.asServiceRole.entities.Colaborador.update(colab.id, {
      perfil: novoPerfil
    });

    console.log(`✅ Perfil alterado com sucesso para: ${novoPerfil}`);

    return Response.json({
      success: true,
      message: `Perfil de ${email} alterado para ${novoPerfil}`,
      colaborador_id: colab.id,
      novo_perfil: novoPerfil,
      anterior_perfil: colab.perfil
    });

  } catch (error) {
    console.error('❌ Erro ao alterar perfil:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
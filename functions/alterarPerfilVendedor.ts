import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    if (!currentUser || !['master', 'super_admin', 'admin'].includes(currentUser.perfil)) {
      return Response.json({ error: 'Acesso negado - apenas admin pode fazer isso' }, { status: 403 });
    }

    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    console.log(`🔄 Alterando ${email} para perfil VENDEDOR`);

    // Buscar Colaborador pelo email
    const colabs = await base44.asServiceRole.entities.Colaborador.filter({ email });

    if (!colabs || colabs.length === 0) {
      return Response.json({ error: 'Colaborador não encontrado com este email' }, { status: 404 });
    }

    const colab = colabs[0];
    console.log(`✅ Colaborador encontrado: ${colab.id}`);
    console.log(`   Perfil anterior: ${colab.perfil}`);

    // Atualizar perfil para VENDEDOR
    const updated = await base44.asServiceRole.entities.Colaborador.update(colab.id, {
      perfil: 'vendedor'
    });

    console.log(`✅ Perfil alterado para VENDEDOR`);

    return Response.json({
      success: true,
      message: `Usuário ${email} agora é VENDEDOR`,
      colaborador_id: colab.id,
      perfil_anterior: colab.perfil,
      perfil_novo: 'vendedor'
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
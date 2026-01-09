import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    if (!currentUser || !['master', 'super_admin', 'admin'].includes(currentUser.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { email, empresa_id } = await req.json();

    if (!email || !empresa_id) {
      return Response.json({ error: 'Email e empresa_id são obrigatórios' }, { status: 400 });
    }

    // Buscar empresa
    const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);
    if (!empresa) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Buscar usuário na entidade User (built-in)
    const usuarios = await base44.asServiceRole.entities.User.filter({ email });
    
    if (!usuarios || usuarios.length === 0) {
      return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const usuario = usuarios[0];

    // Atualizar User
    await base44.asServiceRole.entities.User.update(usuario.id, {
      empresa_id: empresa_id,
      empresa_nome: empresa.nome
    });

    // Buscar e atualizar Colaborador se existir
    const colaboradores = await base44.asServiceRole.entities.Colaborador.filter({ 
      user_id: usuario.id 
    });

    if (colaboradores && colaboradores.length > 0) {
      for (const colab of colaboradores) {
        await base44.asServiceRole.entities.Colaborador.update(colab.id, {
          empresa_id: empresa_id,
          empresa_nome: empresa.nome
        });
      }
    }

    // Criar registro de auditoria
    await base44.asServiceRole.entities.LogAuditoria.create({
      usuario_id: currentUser.id,
      usuario_nome: currentUser.nome_perfil || currentUser.full_name,
      acao: `Moveu usuário ${email} para empresa ${empresa.nome}`,
      entidade: 'User',
      entidade_id: usuario.id,
      tipo: 'edicao',
      dados_anteriores: JSON.stringify({
        empresa_id: usuario.empresa_id,
        empresa_nome: usuario.empresa_nome
      }),
      dados_novos: JSON.stringify({
        empresa_id: empresa_id,
        empresa_nome: empresa.nome
      })
    });

    return Response.json({
      success: true,
      message: `Usuário ${email} movido para empresa ${empresa.nome} com sucesso`,
      usuario_atualizado: {
        id: usuario.id,
        email: usuario.email,
        empresa_id: empresa_id,
        empresa_nome: empresa.nome
      }
    });

  } catch (error) {
    console.error('Erro ao mover usuário:', error);
    return Response.json({ 
      error: 'Erro ao mover usuário', 
      details: error.message 
    }, { status: 500 });
  }
});
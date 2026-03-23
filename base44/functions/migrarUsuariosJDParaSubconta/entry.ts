import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    if (!currentUser || !['master', 'super_admin', 'admin'].includes(currentUser.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { empresa_jd_id, subconta_id } = await req.json();

    if (!empresa_jd_id || !subconta_id) {
      return Response.json({ error: 'empresa_jd_id e subconta_id são obrigatórios' }, { status: 400 });
    }

    // Buscar empresa JD
    const empresaJd = await base44.asServiceRole.entities.Empresa.get(empresa_jd_id);
    if (!empresaJd) {
      return Response.json({ error: 'Empresa JD não encontrada' }, { status: 404 });
    }

    // Buscar subconta
    const subconta = await base44.asServiceRole.entities.Empresa.get(subconta_id);
    if (!subconta) {
      return Response.json({ error: 'Subconta não encontrada' }, { status: 404 });
    }

    // Buscar todos os colaboradores da empresa JD (sem filtro de status para incluir todos)
    const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
      { empresa_id: empresa_jd_id },
      '-created_date'
    );

    if (!colaboradores || colaboradores.length === 0) {
      return Response.json({ error: 'Nenhum colaborador encontrado na empresa JD' }, { status: 404 });
    }

    const resultados = [];
    let sucessos = 0;
    let erros = 0;

    // Migrar cada colaborador
    for (const colab of colaboradores) {
      try {
        // Atualizar colaborador para nova empresa
        await base44.asServiceRole.entities.Colaborador.update(colab.id, {
          empresa_id: subconta_id,
          empresa_nome: subconta.nome
        });

        // Atualizar User também
        if (colab.user_id) {
          const usuarios = await base44.asServiceRole.entities.User.filter({ 
            id: colab.user_id 
          });
          
          if (usuarios && usuarios.length > 0) {
            await base44.asServiceRole.entities.User.update(colab.user_id, {
              empresa_id: subconta_id,
              empresa_nome: subconta.nome
            });
          }
        }

        resultados.push({
          colaborador_id: colab.id,
          nome: colab.nome,
          email: colab.email,
          status: 'migrado'
        });
        sucessos++;

        // Log de auditoria
        await base44.asServiceRole.entities.LogAuditoria.create({
          usuario_id: currentUser.id,
          usuario_nome: currentUser.nome_perfil || currentUser.full_name,
          acao: `Migrou colaborador ${colab.nome} de ${empresaJd.nome} para ${subconta.nome}`,
          entidade: 'Colaborador',
          entidade_id: colab.id,
          tipo: 'edicao',
          dados_anteriores: JSON.stringify({ empresa_id: empresa_jd_id }),
          dados_novos: JSON.stringify({ empresa_id: subconta_id })
        });

      } catch (error) {
        resultados.push({
          colaborador_id: colab.id,
          nome: colab.nome,
          email: colab.email,
          status: 'erro',
          erro: error.message
        });
        erros++;
      }
    }

    return Response.json({
      success: true,
      message: `${sucessos} usuários migrados de ${empresaJd.nome} para ${subconta.nome}`,
      resumo: {
        total: colaboradores.length,
        sucessos,
        erros
      },
      resultados
    });

  } catch (error) {
    console.error('Erro ao migrar usuários:', error);
    return Response.json({ 
      error: 'Erro ao migrar usuários', 
      details: error.message 
    }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar se já tem Colaborador
    const colabs = await base44.entities.Colaborador.filter({
      user_id: user.id,
      status: 'ativo'
    });

    if (colabs.length > 0) {
      return Response.json({
        success: false,
        message: 'Colaborador já existe',
        colaborador: colabs[0]
      });
    }

    // Em um SaaS:
    // - super_admin: vinculado a empresa SUPER_ADMIN (a que cria subcontas)
    // - admin/vendedor em subconta: vinculado à sua própria empresa
    
    let empresa;
    
    if (user.perfil === 'super_admin') {
      // Super admin: buscar empresa super_admin (Empresa da super conta)
      const empresasSuper = await base44.asServiceRole.entities.Empresa.filter({
        status: 'ativa'
      }, '-created_date', 1);
      
      if (empresasSuper.length === 0) {
        return Response.json({
          error: 'Nenhuma empresa super_admin disponível'
        }, { status: 400 });
      }
      empresa = empresasSuper[0];
    } else {
      // Admin/vendedor normal: buscar empresa do Colaborador existente OU empresa vinculada ao user
      let empresaId = user.empresa_id;
      
      if (!empresaId) {
        // Se não tiver empresa_id, não pode criar colaborador (deve ser vinculado na subconta)
        return Response.json({
          error: 'Usuário não vinculado a nenhuma subconta. Configure a empresa primeiro.',
          code: 'NO_COMPANY_LINKED'
        }, { status: 400 });
      }
      
      const empresasBusca = await base44.asServiceRole.entities.Empresa.filter({
        id: empresaId
      });
      
      if (empresasBusca.length === 0) {
        return Response.json({
          error: 'Empresa não encontrada'
        }, { status: 400 });
      }
      
      empresa = empresasBusca[0];
    }

    // Determinar perfil: super_admin OU usar perfil do user
    const perfilFinal = user.perfil === 'super_admin' ? 'super_admin' : (user.perfil || 'vendedor');

    // Verificar se existem dados preenchidos pelo admin no momento do convite (ConvitePendente).
    // Se existirem, usá-los para criar o Colaborador completo — evita perda dos dados preenchidos.
    let dadosConvite = null;
    let convitePendenteId = null;
    try {
      const pendentes = await base44.asServiceRole.entities.ConvitePendente.filter({ email: user.email });
      const pendenteAtivo = pendentes?.find(p => p.status === 'pendente') || pendentes?.[0];
      if (pendenteAtivo && pendenteAtivo.dados_json) {
        dadosConvite = JSON.parse(pendenteAtivo.dados_json);
        convitePendenteId = pendenteAtivo.id;
      }
    } catch (e) {
      console.error('Erro ao buscar convite pendente:', e);
    }

    // Se há dados do convite e ele definiu uma empresa, usar essa empresa (sobrescreve a detecção automática)
    let empresaFinal = empresa;
    if (dadosConvite?.empresa_id && user.perfil !== 'super_admin') {
      try {
        const empConvite = await base44.asServiceRole.entities.Empresa.filter({ id: dadosConvite.empresa_id });
        if (empConvite?.length > 0) {
          empresaFinal = empConvite[0];
        }
      } catch (e) {}
    }

    // Perfil do convite tem prioridade sobre o perfil padrão do user
    const perfilDoConvite = dadosConvite?.perfil || perfilFinal;

    // Criar Colaborador com os dados do convite (se existirem) ou dados básicos
    const colaboradorData = {
      user_id: user.id,
      empresa_id: empresaFinal.id,
      empresa_nome: empresaFinal.nome,
      nome: dadosConvite?.nome || user.full_name,
      email: user.email,
      perfil: perfilDoConvite,
      status: dadosConvite?.status || 'ativo',
      tipo_agente: dadosConvite?.tipo_agente || 'agente_loja',
      // Dados pessoais
      cpf_cnpj: dadosConvite?.cpf_cnpj || null,
      telefone: dadosConvite?.telefone || null,
      rg: dadosConvite?.rg || null,
      data_nascimento: dadosConvite?.data_nascimento || null,
      sexo: dadosConvite?.sexo || null,
      estado_civil: dadosConvite?.estado_civil || null,
      nome_mae: dadosConvite?.nome_mae || null,
      // Endereço
      cep: dadosConvite?.cep || null,
      logradouro: dadosConvite?.logradouro || null,
      numero: dadosConvite?.numero || null,
      complemento: dadosConvite?.complemento || null,
      bairro: dadosConvite?.bairro || null,
      cidade: dadosConvite?.cidade || null,
      estado: dadosConvite?.estado || null,
      // Banco
      banco: dadosConvite?.banco || null,
      banco_codigo: dadosConvite?.banco_codigo || null,
      tipo_conta: dadosConvite?.tipo_conta || null,
      agencia: dadosConvite?.agencia || null,
      digito_agencia: dadosConvite?.digito_agencia || null,
      conta: dadosConvite?.conta || null,
      digito_conta: dadosConvite?.digito_conta || null,
      operacao: dadosConvite?.operacao || null,
      favorecido_nome: dadosConvite?.favorecido_nome || null,
      favorecido_cpf: dadosConvite?.favorecido_cpf || null,
      // PIX
      pix_tipo: dadosConvite?.pix_tipo || null,
      pix_chave: dadosConvite?.pix_chave || null,
      chave_pix: dadosConvite?.pix_chave || null,
      tipo_chave_pix: dadosConvite?.pix_tipo || null,
      // Outros
      codigo_vendedor: dadosConvite?.codigo_vendedor || null,
      usuario_canopus: dadosConvite?.usuario_canopus || null,
      percentual_comissao_agente: dadosConvite?.percentual_comissao_agente || null,
      evolution_instance_name: dadosConvite?.evolution_instance_name || null,
    };

    // Gerente vinculado (se vendedor)
    if (perfilDoConvite === 'vendedor' && dadosConvite?.gerente_id) {
      colaboradorData.gerente_id = dadosConvite.gerente_id;
      try {
        const gerente = await base44.asServiceRole.entities.Colaborador.get(dadosConvite.gerente_id);
        if (gerente) colaboradorData.gerente_nome = gerente.nome;
      } catch (e) {}
    }

    const novoColaborador = await base44.entities.Colaborador.create(colaboradorData);

    // Marcar convite pendente como consumido
    if (convitePendenteId) {
      try {
        await base44.asServiceRole.entities.ConvitePendente.update(convitePendenteId, { status: 'consumido' });
      } catch (e) {
        console.error('Erro ao marcar convite pendente como consumido:', e);
      }
    }

    return Response.json({
      success: true,
      message: 'Colaborador criado com sucesso',
      colaborador: novoColaborador,
      empresa: empresaFinal
    });
  } catch (error) {
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});
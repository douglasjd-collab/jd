import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Cria uma nova SUBCONTA no SaaS
 * - Cria Empresa isolada
 * - Convida administrador da subconta com email/senha próprio
 * - Garante isolamento de dados
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Apenas super_admin pode criar subcontas
    if (user?.perfil !== 'super_admin') {
      return Response.json(
        { error: 'Apenas super_admin pode criar subcontas' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      nome_empresa,
      email_admin,
      nome_admin,
      cpf_cnpj,
      telefone,
      endereco_rua,
      endereco_numero,
      endereco_cep,
      endereco_cidade,
      endereco_estado
    } = body;

    // Validar campos obrigatórios
    if (!nome_empresa || !email_admin || !nome_admin) {
      return Response.json(
        { error: 'Campos obrigatórios: nome_empresa, email_admin, nome_admin' },
        { status: 400 }
      );
    }

    // Verificar se empresa já existe
    const empresasExistentes = await base44.asServiceRole.entities.Empresa.filter({
      nome: nome_empresa
    });
    if (empresasExistentes.length > 0) {
      return Response.json(
        { error: 'Empresa com este nome já existe' },
        { status: 400 }
      );
    }

    // Gerar código único da empresa (EMPSUB001, EMPSUB002...)
    const todasEmpresas = await base44.asServiceRole.entities.Empresa.filter(
      {},
      '-created_date',
      1000
    );
    const numEmpresas = todasEmpresas.length + 1;
    const codigoEmpresa = `EMPSUB${String(numEmpresas).padStart(3, '0')}`;

    // 1. Criar empresa isolada para a subconta
    const novaEmpresa = await base44.asServiceRole.entities.Empresa.create({
      codigo: codigoEmpresa,
      nome: nome_empresa,
      cpf_cnpj: cpf_cnpj || '',
      telefone: telefone || '',
      email: email_admin,
      endereco_rua: endereco_rua || '',
      endereco_numero: endereco_numero || '',
      endereco_cep: endereco_cep || '',
      endereco_cidade: endereco_cidade || '',
      endereco_estado: endereco_estado || '',
      status: 'ativa',
      status_licenca: 'ativa',
      tipo_licenca: 'basica',
      limite_usuarios: 10,
      whatsapp_conectado: false,
      email_admin: email_admin,
      nome_admin: nome_admin,
      observacoes: `Subconta criada pelo super_admin ${user.full_name} em ${new Date().toLocaleDateString('pt-BR')}`
    });

    console.log(`✅ Empresa criada: ${novaEmpresa.id}`);

    // 2. Convidar administrador da subconta (com email próprio)
    // IMPORTANTE: user.empresa_id deve ser passado para vincular o novo usuário à subconta
    const conviteRes = await base44.functions.invoke('inviteUser', {
      email: email_admin,
      role: 'admin',
      empresa_id: novaEmpresa.id
    });

    if (!conviteRes.data?.success) {
      console.error('Erro ao convidar admin da subconta:', conviteRes.data?.error);
      // Não falhar - o convite pode ser enviado depois
    }

    console.log(`📧 Convite enviado para: ${email_admin}`);

    // 3. Registrar na auditoria
    await base44.asServiceRole.entities.LogAuditoria.create({
      usuario_id: user.id,
      usuario_nome: user.full_name,
      acao: `Subconta criada: ${nome_empresa}`,
      entidade: 'Empresa',
      entidade_id: novaEmpresa.id,
      tipo: 'criacao'
    }).catch(() => {});

    return Response.json({
      ok: true,
      mensagem: `Subconta "${nome_empresa}" criada com sucesso!`,
      subconta: {
        id: novaEmpresa.id,
        codigo: codigoEmpresa,
        nome: nome_empresa,
        email_admin: email_admin,
        status: 'ativa'
      },
      proximo_passo: `Convite enviado para ${email_admin}. O admin da subconta poderá acessar com credenciais próprias.`
    });
  } catch (error) {
    console.error('Erro ao criar subconta:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
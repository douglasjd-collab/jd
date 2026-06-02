import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { email, perfil, nome, cpf_cnpj, telefone, codigo_vendedor, gerente_id, empresa_id, status } = payload;

        if (!email || !perfil || !nome) {
            return Response.json({ error: 'email, perfil e nome são obrigatórios' }, { status: 400 });
        }

        // Determinar role para convite
        const requestedRole = ['admin', 'super_admin', 'master'].includes(perfil) ? 'admin' : 'user';
        const userPerfil = user.perfil || user.role;
        const userCanInviteAdmin = ['admin', 'super_admin', 'master'].includes(userPerfil);

        if (requestedRole === 'admin' && !userCanInviteAdmin) {
            return Response.json({ error: 'Forbidden: Only admin users can invite other admins.' }, { status: 403 });
        }

        // Verificar se usuário já existe
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
        let invitedUser = existingUsers?.[0] || null;

        // Convidar usuário se não existir
        if (!invitedUser) {
            await base44.users.inviteUser(email, requestedRole);

            // Aguardar e buscar usuário criado com retry
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const createdUsers = await base44.asServiceRole.entities.User.filter({ email });
                if (createdUsers?.length) {
                    invitedUser = createdUsers[0];
                    break;
                }
            }

            if (!invitedUser) {
                return Response.json({
                    success: true,
                    invited: true,
                    userLinked: false,
                    message: 'Convite enviado! O usuário aparecerá no sistema após aceitar o convite.'
                });
            }
        }

        // Criar dados do Colaborador — incluir TODOS os campos preenchidos no formulário
        let colaboradorData = {
            user_id: invitedUser.id,
            nome: nome || invitedUser.full_name,
            email: invitedUser.email,
            perfil,
            cpf_cnpj: cpf_cnpj || null,
            telefone: telefone || null,
            codigo_vendedor: codigo_vendedor || null,
            status: status || 'ativo',
            // Dados pessoais
            rg: payload.rg || null,
            data_nascimento: payload.data_nascimento || null,
            sexo: payload.sexo || null,
            estado_civil: payload.estado_civil || null,
            nome_mae: payload.nome_mae || null,
            // Endereço
            cep: payload.cep || null,
            logradouro: payload.logradouro || null,
            numero: payload.numero || null,
            complemento: payload.complemento || null,
            bairro: payload.bairro || null,
            cidade: payload.cidade || null,
            estado: payload.estado || null,
            // Banco
            banco: payload.banco || null,
            banco_codigo: payload.banco_codigo || null,
            tipo_conta: payload.tipo_conta || null,
            agencia: payload.agencia || null,
            digito_agencia: payload.digito_agencia || null,
            conta: payload.conta || null,
            digito_conta: payload.digito_conta || null,
            operacao: payload.operacao || null,
            favorecido_nome: payload.favorecido_nome || null,
            favorecido_cpf: payload.favorecido_cpf || null,
            // PIX
            pix_tipo: payload.pix_tipo || null,
            pix_chave: payload.pix_chave || null,
            chave_pix: payload.pix_chave || null,
            tipo_chave_pix: payload.pix_tipo || null,
            // Outros
            usuario_canopus: payload.usuario_canopus || null,
            tipo_agente: payload.tipo_agente || 'agente_loja',
            percentual_comissao_agente: payload.percentual_comissao_agente || null,
            evolution_instance_name: payload.evolution_instance_name || null,
        };

        // Adicionar gerente se for vendedor
        if (perfil === 'vendedor' && gerente_id) {
            colaboradorData.gerente_id = gerente_id;
            try {
                const gerente = await base44.asServiceRole.entities.Colaborador.get(gerente_id);
                if (gerente) colaboradorData.gerente_nome = gerente.nome;
            } catch (e) {}
        }

        // Adicionar empresa 
        // IMPORTANTE: admin de subconta (admin role) DEVE estar vinculado à sua empresa isolada
        if (empresa_id) {
            colaboradorData.empresa_id = empresa_id;
            try {
                const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);
                if (empresa) colaboradorData.empresa_nome = empresa.nome;
            } catch (e) {}
        }

        // Verificar se já existe Colaborador para este user_id
        const existingColab = await base44.asServiceRole.entities.Colaborador.filter({ user_id: invitedUser.id });
        let colaborador;

        if (existingColab.length > 0) {
            colaborador = await base44.asServiceRole.entities.Colaborador.update(existingColab[0].id, colaboradorData);
        } else {
            colaborador = await base44.asServiceRole.entities.Colaborador.create(colaboradorData);
        }

        return Response.json({ success: true, user: invitedUser, colaborador });

    } catch (error) {
        console.error('Erro na função inviteUser:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
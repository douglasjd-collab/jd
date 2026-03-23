import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { email, perfil, nome, cpf_cnpj, telefone, codigo_vendedor, gerente_id, empresa_id, status } = await req.json();

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

        // Criar dados do Colaborador
        let colaboradorData = {
            user_id: invitedUser.id,
            nome: nome || invitedUser.full_name,
            email: invitedUser.email,
            perfil,
            cpf_cnpj: cpf_cnpj || null,
            telefone: telefone || null,
            codigo_vendedor: codigo_vendedor || null,
            status: status || 'ativo',
        };

        // Adicionar gerente se for vendedor
        if (perfil === 'vendedor' && gerente_id) {
            colaboradorData.gerente_id = gerente_id;
            try {
                const gerente = await base44.asServiceRole.entities.Colaborador.get(gerente_id);
                if (gerente) colaboradorData.gerente_nome = gerente.nome;
            } catch (e) {}
        }

        // Adicionar empresa (exceto para super_admin e master)
        if (!['super_admin', 'master'].includes(perfil) && empresa_id) {
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
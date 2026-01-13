import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { email, perfil, nome, cpf_cnpj, telefone, codigo_vendedor, gerente_id, empresa_id, status } = await req.json();

        // Determinar role para convite
        const requestedRole = ['admin', 'super_admin', 'master'].includes(perfil) ? 'admin' : 'user';
        const userCanInviteAdmin = ['admin', 'super_admin', 'master'].includes(user.role);

        if (requestedRole === 'admin' && !userCanInviteAdmin) {
            return Response.json({ error: 'Forbidden: Only admin users can invite other admins.' }, { status: 403 });
        }

        // Convidar usuário
        const invitedUser = await base44.asServiceRole.users.inviteUser(email, requestedRole);
        
        // Criar dados do Colaborador
        let colaboradorData = {
            user_id: invitedUser.id,
            nome: nome || invitedUser.full_name,
            email: invitedUser.email,
            perfil: perfil,
            cpf_cnpj: cpf_cnpj || '',
            telefone: telefone || '',
            codigo_vendedor: codigo_vendedor || '',
            status: status || 'ativo',
        };

        // Adicionar gerente se for vendedor
        if (perfil === 'vendedor' && gerente_id) {
            colaboradorData.gerente_id = gerente_id;
            try {
                const gerente = await base44.asServiceRole.entities.Colaborador.get(gerente_id);
                if (gerente) {
                    colaboradorData.gerente_nome = gerente.nome;
                }
            } catch (e) {
                console.log('Gerente não encontrado:', e);
            }
        }

        // Adicionar empresa (exceto para super_admin e master)
        if (!['super_admin', 'master'].includes(perfil) && empresa_id) {
            colaboradorData.empresa_id = empresa_id;
            try {
                const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);
                if (empresa) {
                    colaboradorData.empresa_nome = empresa.nome;
                }
            } catch (e) {
                console.log('Empresa não encontrada:', e);
            }
        }
        
        // Verificar se já existe Colaborador para este user_id
        const existingColab = await base44.asServiceRole.entities.Colaborador.filter({ user_id: invitedUser.id });
        let colaborador;

        if (existingColab.length > 0) {
            colaborador = await base44.asServiceRole.entities.Colaborador.update(existingColab[0].id, colaboradorData);
        } else {
            colaborador = await base44.asServiceRole.entities.Colaborador.create(colaboradorData);
        }

        // Log de auditoria
        await base44.asServiceRole.entities.LogAuditoria.create({
            usuario_id: user.id,
            usuario_nome: user.full_name,
            acao: `Convidou usuário ${invitedUser.email} com perfil ${perfil}`,
            entidade: 'Colaborador',
            entidade_id: colaborador.id,
            tipo: 'criacao'
        });

        return Response.json({ 
            success: true, 
            user: invitedUser, 
            colaborador 
        });

    } catch (error) {
        console.error('Erro na função inviteUser:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
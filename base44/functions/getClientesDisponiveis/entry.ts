import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { search = '', empresaId = null } = await req.json().catch(() => ({}));

        let clientes = [];

        // Master/Super Admin: vê todos os clientes
        if (user.perfil === 'master' || user.perfil === 'super_admin') {
            if (empresaId) {
                // Se especificou empresa, filtrar por ela
                clientes = await base44.asServiceRole.entities.Cliente.filter({ 
                    empresa_id: empresaId,
                    status: 'ativo' 
                });
            } else {
                // Ver todos
                clientes = await base44.asServiceRole.entities.Cliente.filter({ status: 'ativo' });
            }
        } else {
            // Admin/Gerente/Vendedor: só da sua empresa
            if (!user.empresa_id) {
                return Response.json({ error: 'Usuário sem empresa vinculada' }, { status: 400 });
            }
            
            clientes = await base44.asServiceRole.entities.Cliente.filter({ 
                empresa_id: user.empresa_id,
                status: 'ativo' 
            });
        }

        // Filtrar por busca (nome, CPF, telefone)
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim();
            const searchNormalized = search.replace(/\D/g, '');
            
            clientes = clientes.filter(c => {
                const nome = (c.nome || '').toLowerCase();
                const cpf = (c.cpf || '').replace(/\D/g, '');
                const telefone = (c.telefone || '').replace(/\D/g, '');
                
                return nome.includes(searchLower) || 
                       cpf.includes(searchNormalized) || 
                       telefone.includes(searchNormalized);
            });
        }

        // Ordenar por nome
        clientes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        return Response.json({ success: true, clientes });
    } catch (error) {
        console.error('Erro ao buscar clientes:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
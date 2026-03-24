import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // Apenas super_admin ou master podem alterar status de empresa
        const perfil = user.perfil || user.role;
        if (perfil !== 'super_admin' && perfil !== 'master') {
            return Response.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { empresaId, novoStatus } = await req.json();

        if (!empresaId || !novoStatus) {
            return Response.json({ error: 'empresaId e novoStatus são obrigatórios' }, { status: 400 });
        }

        await base44.asServiceRole.entities.Empresa.update(empresaId, { status: novoStatus });

        return Response.json({ success: true });
    } catch (error) {
        console.error('Erro ao atualizar status da empresa:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
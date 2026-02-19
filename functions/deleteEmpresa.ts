import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        if (user.perfil !== 'super_admin' && user.role !== 'super_admin') {
            return Response.json({ error: 'Apenas super_admin pode deletar subcontas' }, { status: 403 });
        }

        const { empresaId } = await req.json();

        if (!empresaId) {
            return Response.json({ error: 'empresaId é obrigatório' }, { status: 400 });
        }

        await base44.asServiceRole.entities.Empresa.delete(empresaId);

        return Response.json({ success: true });
    } catch (error) {
        console.error('Erro ao deletar empresa:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
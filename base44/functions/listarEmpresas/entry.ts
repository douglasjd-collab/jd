import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const empresas = await base44.asServiceRole.entities.Empresa.list('-created_date', 200);

        return Response.json({ empresas: empresas || [] });
    } catch (error) {
        console.error('Erro ao listar empresas:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
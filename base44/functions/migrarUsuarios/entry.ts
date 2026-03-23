import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { colaboradorIds, subcontaDestinoId } = await req.json();

        if (!colaboradorIds || colaboradorIds.length === 0) {
            return Response.json({ error: 'Nenhum colaborador selecionado' }, { status: 400 });
        }
        if (!subcontaDestinoId) {
            return Response.json({ error: 'Empresa de destino não informada' }, { status: 400 });
        }

        const subconta = await base44.asServiceRole.entities.Empresa.get(subcontaDestinoId);
        if (!subconta) {
            return Response.json({ error: 'Empresa de destino não encontrada' }, { status: 404 });
        }

        let sucessos = 0;
        let erros = 0;
        const empresasOrigem = new Set();

        for (const colaboradorId of colaboradorIds) {
            try {
                const colab = await base44.asServiceRole.entities.Colaborador.get(colaboradorId);
                if (!colab) { erros++; continue; }

                // Guardar empresa de origem para recalcular depois
                if (colab.empresa_id) {
                    empresasOrigem.add(colab.empresa_id);
                }

                // Atualizar colaborador
                await base44.asServiceRole.entities.Colaborador.update(colaboradorId, {
                    empresa_id: subcontaDestinoId,
                    empresa_nome: subconta.nome,
                });

                sucessos++;
            } catch (e) {
                console.error('Erro ao migrar colaborador', colaboradorId, e.message);
                erros++;
            }
        }

        // Recalcular usuarios_ativos da empresa DESTINO
        try {
            const colabsDestino = await base44.asServiceRole.entities.Colaborador.filter({ empresa_id: subcontaDestinoId, status: 'ativo' });
            await base44.asServiceRole.entities.Empresa.update(subcontaDestinoId, {
                usuarios_ativos: colabsDestino.length,
            });
            console.log(`Destino ${subconta.nome}: ${colabsDestino.length} colaboradores ativos`);
        } catch (e) {
            console.log('Erro ao atualizar usuarios_ativos destino:', e.message);
        }

        // Recalcular usuarios_ativos das empresas ORIGEM
        for (const empresaOrigemId of empresasOrigem) {
            try {
                const colabsOrigem = await base44.asServiceRole.entities.Colaborador.filter({ empresa_id: empresaOrigemId, status: 'ativo' });
                await base44.asServiceRole.entities.Empresa.update(empresaOrigemId, {
                    usuarios_ativos: colabsOrigem.length,
                });
                console.log(`Origem ${empresaOrigemId}: ${colabsOrigem.length} colaboradores ativos`);
            } catch (e) {
                console.log('Erro ao atualizar usuarios_ativos origem:', e.message);
            }
        }

        return Response.json({ success: true, sucessos, erros, subconta_nome: subconta.nome });
    } catch (error) {
        console.error('Erro geral:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
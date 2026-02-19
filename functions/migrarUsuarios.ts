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

        for (const colaboradorId of colaboradorIds) {
            try {
                const colab = await base44.asServiceRole.entities.Colaborador.get(colaboradorId);
                if (!colab) { erros++; continue; }

                await base44.asServiceRole.entities.Colaborador.update(colaboradorId, {
                    empresa_id: subcontaDestinoId,
                    empresa_nome: subconta.nome,
                });

                // Atualizar User se tiver user_id
                if (colab.user_id) {
                    try {
                        await base44.asServiceRole.entities.User.update(colab.user_id, {
                            empresa_id: subcontaDestinoId,
                            empresa_nome: subconta.nome,
                        });
                    } catch (e) {
                        console.log('Não foi possível atualizar User:', e.message);
                    }
                }

                sucessos++;
            } catch (e) {
                console.error('Erro ao migrar colaborador', colaboradorId, e.message);
                erros++;
            }
        }

        // Recalcular usuarios_ativos reais para todas as empresas envolvidas
        const empresasParaAtualizar = new Set([subcontaDestinoId, ...colaboradorIds.map(() => null)]);
        
        // Recalcular destino
        try {
            const colabsDestino = await base44.asServiceRole.entities.Colaborador.filter({ empresa_id: subcontaDestinoId, status: 'ativo' });
            await base44.asServiceRole.entities.Empresa.update(subcontaDestinoId, {
                usuarios_ativos: colabsDestino.length,
            });
        } catch (e) {
            console.log('Erro ao atualizar usuarios_ativos destino:', e.message);
        }

        // Recalcular origem (buscar empresa_id original dos colaboradores migrados)
        if (colaboradorOrigem) {
            try {
                const colabsOrigem = await base44.asServiceRole.entities.Colaborador.filter({ empresa_id: colaboradorOrigem, status: 'ativo' });
                await base44.asServiceRole.entities.Empresa.update(colaboradorOrigem, {
                    usuarios_ativos: colabsOrigem.length,
                });
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
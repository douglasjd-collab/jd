import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { registros } = await req.json();
    // registros: [{ grupo, cota, valor, parcela }]

    if (!registros || !Array.isArray(registros)) {
      return Response.json({ error: 'Parâmetro "registros" obrigatório (array)' }, { status: 400 });
    }

    const log = [];
    let totalRecebimentos = 0;
    let totalComissoes = 0;
    let totalItens = 0;

    // Busca todos de uma vez para não fazer mil requests
    const todosRecebimentos = await base44.asServiceRole.entities.RecebimentoComissao.list();
    const todasComissoes = await base44.asServiceRole.entities.ComissaoAPagar.list();
    const todosItens = await base44.asServiceRole.entities.ImportacaoItem.list();

    const normGrupoCota = (v) => String(v ?? '').trim().replace(/\D/g, '').replace(/^0+/, '') || String(v ?? '').trim();

    for (const reg of registros) {
      const grupoNorm = normGrupoCota(reg.grupo);
      const cotaNorm = normGrupoCota(reg.cota);

      // Filtra recebimentos que batem com grupo/cota
      const recsFiltrados = todosRecebimentos.filter(r => {
        return normGrupoCota(r.grupo) === grupoNorm && normGrupoCota(r.cota) === cotaNorm;
      });

      for (const rec of recsFiltrados) {
        // Remove comissões vinculadas
        const comissoesDesse = todasComissoes.filter(c => c.recebimento_id === rec.id);
        for (const com of comissoesDesse) {
          await base44.asServiceRole.entities.ComissaoAPagar.delete(com.id);
          totalComissoes++;
        }
        // Remove recebimento
        await base44.asServiceRole.entities.RecebimentoComissao.delete(rec.id);
        totalRecebimentos++;
        log.push(`Removido recebimento grupo=${rec.grupo} cota=${rec.cota} valor=${rec.valor_recebido} data=${rec.data_recebimento}`);
      }

      // Remove itens de importação com grupo/cota correspondentes
      const itensFiltrados = todosItens.filter(i => {
        return normGrupoCota(i.grupo) === grupoNorm && normGrupoCota(i.cota) === cotaNorm;
      });
      for (const item of itensFiltrados) {
        await base44.asServiceRole.entities.ImportacaoItem.delete(item.id);
        totalItens++;
      }

      log.push(`Grupo ${reg.grupo} Cota ${reg.cota}: ${recsFiltrados.length} recebimentos, ${itensFiltrados.length} itens removidos`);
    }

    return Response.json({
      success: true,
      totalRecebimentos,
      totalComissoes,
      totalItens,
      log
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
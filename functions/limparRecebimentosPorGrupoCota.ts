import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json();
    // Suporte a: { registros: [{grupo, cota}] } OU { importacao_id: "..." }
    const { registros, importacao_id } = body;

    const log = [];
    let totalRecebimentos = 0;
    let totalComissoes = 0;
    let totalItens = 0;

    const normGrupoCota = (v) => {
      const s = String(v ?? '').trim();
      const d = s.replace(/\D/g, '').replace(/^0+/, '');
      return d || s;
    };

    // ---- Modo 1: por importacao_id ----
    if (importacao_id) {
      const recebimentos = await base44.asServiceRole.entities.RecebimentoComissao.filter({ origem_importacao_id: importacao_id });
      for (const rec of recebimentos) {
        const comissoes = await base44.asServiceRole.entities.ComissaoAPagar.filter({ recebimento_id: rec.id });
        for (const com of comissoes) {
          await base44.asServiceRole.entities.ComissaoAPagar.delete(com.id);
          totalComissoes++;
        }
        await base44.asServiceRole.entities.RecebimentoComissao.delete(rec.id);
        totalRecebimentos++;
        log.push(`Removido recebimento id=${rec.id} grupo=${rec.grupo} cota=${rec.cota}`);
      }
      const itens = await base44.asServiceRole.entities.ImportacaoItem.filter({ importacao_id });
      for (const item of itens) {
        await base44.asServiceRole.entities.ImportacaoItem.delete(item.id);
        totalItens++;
      }
      // Remove a importação também
      await base44.asServiceRole.entities.Importacao.delete(importacao_id);
      log.push(`Importação ${importacao_id}: ${totalRecebimentos} recebimentos, ${totalItens} itens removidos`);

      return Response.json({ success: true, totalRecebimentos, totalComissoes, totalItens, log });
    }

    // ---- Modo 2: por lista de grupo/cota ----
    if (!registros || !Array.isArray(registros)) {
      return Response.json({ error: 'Parâmetro "registros" ou "importacao_id" obrigatório' }, { status: 400 });
    }

    for (const reg of registros) {
      const grupoNorm = normGrupoCota(reg.grupo);
      const cotaNorm = normGrupoCota(reg.cota);

      // Busca filtrada por grupo e cota (evita listar tudo)
      const recsFiltrados = await base44.asServiceRole.entities.RecebimentoComissao.filter({ grupo: reg.grupo, cota: reg.cota });

      // Também tenta variações de formato
      const recsGrupoNorm = await base44.asServiceRole.entities.RecebimentoComissao.filter({ grupo: grupoNorm, cota: cotaNorm });
      
      // Mescla e deduplica por id
      const todosRecs = [...recsFiltrados, ...recsGrupoNorm].filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);

      for (const rec of todosRecs) {
        const comissoes = await base44.asServiceRole.entities.ComissaoAPagar.filter({ recebimento_id: rec.id });
        for (const com of comissoes) {
          await base44.asServiceRole.entities.ComissaoAPagar.delete(com.id);
          totalComissoes++;
        }
        await base44.asServiceRole.entities.RecebimentoComissao.delete(rec.id);
        totalRecebimentos++;
        log.push(`Removido recebimento grupo=${rec.grupo} cota=${rec.cota} valor=${rec.valor_recebido} data=${rec.data_recebimento}`);
      }

      // Remove itens de importação com grupo/cota correspondentes
      const itensFiltrados = await base44.asServiceRole.entities.ImportacaoItem.filter({ grupo: reg.grupo, cota: reg.cota });
      const itensNorm = await base44.asServiceRole.entities.ImportacaoItem.filter({ grupo: grupoNorm, cota: cotaNorm });
      const todosItens = [...itensFiltrados, ...itensNorm].filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);

      for (const item of todosItens) {
        await base44.asServiceRole.entities.ImportacaoItem.delete(item.id);
        totalItens++;
      }

      log.push(`Grupo ${reg.grupo} Cota ${reg.cota}: ${todosRecs.length} recebimentos, ${todosItens.length} itens removidos`);
    }

    return Response.json({ success: true, totalRecebimentos, totalComissoes, totalItens, log });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
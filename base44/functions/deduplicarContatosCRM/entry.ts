import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresa_id = body.empresa_id || user.empresa_id;

    if (!empresa_id) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar todos os contatos com paginação
    const todos = [];
    const PAGE = 1000;
    let skip = 0;
    while (true) {
      const lote = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
        { empresa_id }, 'nome', PAGE, skip
      ).catch(() => []);
      todos.push(...lote);
      if (lote.length < PAGE) break;
      skip += PAGE;
    }

    console.log(`📋 Total contatos encontrados: ${todos.length}`);

    // Agrupar por telefone — manter o mais antigo (created_date menor), deletar os demais
    const porTelefone = {};
    for (const c of todos) {
      const tel = c.telefone;
      if (!tel) continue;
      if (!porTelefone[tel]) {
        porTelefone[tel] = [];
      }
      porTelefone[tel].push(c);
    }

    // Coletar IDs a deletar (manter 1, deletar o resto)
    const aDeletar = [];
    for (const [tel, contatos] of Object.entries(porTelefone)) {
      if (contatos.length <= 1) continue;
      // Ordenar por created_date crescente — manter o mais antigo
      contatos.sort((a, b) => {
        const da = a.created_date || '';
        const db = b.created_date || '';
        return da.localeCompare(db);
      });
      // Manter o primeiro, deletar os demais
      const [manter, ...duplicatas] = contatos;
      // Mesclar tags dos duplicados no original
      const todasTags = new Set(manter.tags_ids || []);
      for (const d of duplicatas) {
        for (const tid of (d.tags_ids || [])) todasTags.add(tid);
        aDeletar.push(d.id);
      }
      // Atualizar tags no original se houver novas
      const tagsArray = [...todasTags];
      if (tagsArray.length !== (manter.tags_ids || []).length) {
        await base44.asServiceRole.entities.ContatoWhatsapp.update(manter.id, { tags_ids: tagsArray })
          .catch(() => null);
      }
      console.log(`🔁 ${tel}: mantendo ${manter.id}, deletando ${duplicatas.length} duplicata(s)`);
    }

    console.log(`🗑️ Total a deletar: ${aDeletar.length}`);

    // Deletar em lotes de 10
    let deletados = 0;
    const BATCH = 10;
    for (let i = 0; i < aDeletar.length; i += BATCH) {
      const lote = aDeletar.slice(i, i + BATCH);
      await Promise.all(lote.map(id =>
        base44.asServiceRole.entities.ContatoWhatsapp.delete(id).catch(() => null)
      ));
      deletados += lote.length;
      if (i + BATCH < aDeletar.length) await sleep(200);
    }

    console.log(`✅ Deduplucação concluída: ${deletados} duplicatas removidas`);

    return Response.json({
      ok: true,
      total_antes: todos.length,
      total_unicos: Object.keys(porTelefone).length,
      deletados,
      mensagem: `✅ ${deletados} duplicatas removidas. Total único: ${Object.keys(porTelefone).length} contatos.`,
    });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
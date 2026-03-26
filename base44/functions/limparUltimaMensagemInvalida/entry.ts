import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Limpa conversas onde ultima_mensagem está com texto inválido ("Carregando histórico...")
 * e tenta corrigir com a última mensagem real do banco.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id } = await req.json();
    if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });

    // Buscar todas as conversas da empresa
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id },
      '-created_date',
      10000
    );

    const invalidas = conversas.filter(c =>
      c.ultima_mensagem === 'Carregando histórico...' ||
      c.ultima_mensagem === 'Carregando histórico' ||
      (c.ultima_mensagem || '').startsWith('Carregando')
    );

    console.log(`🔍 ${invalidas.length} conversas com ultima_mensagem inválida`);

    let zeradas = 0;

    // Zerar em lotes com pausa para respeitar rate limit
    const BATCH = 10;
    for (let i = 0; i < invalidas.length; i += BATCH) {
      const lote = invalidas.slice(i, i + BATCH);
      await Promise.all(lote.map(c =>
        base44.asServiceRole.entities.ConversaWhatsapp.update(c.id, { ultima_mensagem: '' }).catch(() => {})
      ));
      zeradas += lote.length;
      if (i + BATCH < invalidas.length) await new Promise(r => setTimeout(r, 500));
    }

    console.log(`✅ Zeradas: ${zeradas}`);

    return Response.json({
      ok: true,
      total_invalidas: invalidas.length,
      zeradas
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
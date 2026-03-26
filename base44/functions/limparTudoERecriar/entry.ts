import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Apaga TODAS as ConversaWhatsapp e MensagemWhatsapp da empresa
 * e depois dispara a reimportação completa via sincronizarTodosChatsCompleto.
 * ATENÇÃO: operação irreversível!
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id, confirmar } = await req.json();
    if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    if (confirmar !== true) return Response.json({ error: 'Envie confirmar: true para executar' }, { status: 400 });

    console.log(`🗑️ Iniciando limpeza total para empresa ${empresa_id}`);

    // 1. Apagar todas as mensagens em lotes
    let totalMensagens = 0;
    let paginaMensagens = true;
    while (paginaMensagens) {
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { empresa_id },
        '-created_date',
        500
      );
      if (!msgs || msgs.length === 0) { paginaMensagens = false; break; }
      await Promise.all(msgs.map(m => base44.asServiceRole.entities.MensagemWhatsapp.delete(m.id).catch(() => {})));
      totalMensagens += msgs.length;
      console.log(`🗑️ Mensagens deletadas até agora: ${totalMensagens}`);
      await new Promise(r => setTimeout(r, 300));
    }

    // 2. Apagar todas as conversas em lotes
    let totalConversas = 0;
    let paginaConversas = true;
    while (paginaConversas) {
      const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id },
        '-created_date',
        500
      );
      if (!convs || convs.length === 0) { paginaConversas = false; break; }
      await Promise.all(convs.map(c => base44.asServiceRole.entities.ConversaWhatsapp.delete(c.id).catch(() => {})));
      totalConversas += convs.length;
      console.log(`🗑️ Conversas deletadas até agora: ${totalConversas}`);
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`✅ Limpeza concluída: ${totalMensagens} mensagens | ${totalConversas} conversas`);

    return Response.json({
      ok: true,
      mensagens_deletadas: totalMensagens,
      conversas_deletadas: totalConversas,
      mensagem: `Limpeza concluída. ${totalConversas} conversas e ${totalMensagens} mensagens removidas.`
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
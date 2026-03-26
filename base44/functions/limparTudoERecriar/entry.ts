import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Apaga TODAS as MensagemWhatsapp e ConversaWhatsapp da empresa.
 * Usa deleteMany({ empresa_id }) — 2 chamadas rápidas.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id, confirmar } = await req.json();
    if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    if (confirmar !== true) return Response.json({ error: 'Envie confirmar: true para executar' }, { status: 400 });

    console.log(`🗑️ Deletando tudo da empresa ${empresa_id}...`);

    // 1. Deletar todas as mensagens da empresa de uma vez
    const resultMsgs = await base44.asServiceRole.entities.MensagemWhatsapp.deleteMany(
      { empresa_id }
    );
    const totalMensagens = resultMsgs?.deleted || 0;
    console.log(`✅ ${totalMensagens} mensagens deletadas`);

    await new Promise(r => setTimeout(r, 500));

    // 2. Deletar todas as conversas da empresa de uma vez
    const resultConvs = await base44.asServiceRole.entities.ConversaWhatsapp.deleteMany(
      { empresa_id }
    );
    const totalConversas = resultConvs?.deleted || 0;
    console.log(`✅ ${totalConversas} conversas deletadas`);

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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'super_admin' && user?.perfil !== 'super_admin' && user?.perfil !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Buscar todas as conversas com telefone falso (lid_ prefix)
    const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.list('-created_date', 500);
    const conversasFalsas = todasConversas.filter(c =>
      c.cliente_telefone && c.cliente_telefone.startsWith('lid_')
    );

    console.log(`🔍 Encontradas ${conversasFalsas.length} conversas falsas`);

    let mensagensExcluidas = 0;
    let conversasExcluidas = 0;

    for (const conversa of conversasFalsas) {
      // Excluir mensagens da conversa
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ conversa_id: conversa.id });
      for (const msg of mensagens) {
        await base44.asServiceRole.entities.MensagemWhatsapp.delete(msg.id);
        mensagensExcluidas++;
      }
      // Excluir a conversa
      await base44.asServiceRole.entities.ConversaWhatsapp.delete(conversa.id);
      conversasExcluidas++;
      console.log(`🗑️ Conversa excluída: ${conversa.id} | tel: ${conversa.cliente_telefone}`);
    }

    // Limpar também contatos falsos
    const todosContatos = await base44.asServiceRole.entities.ContatoWhatsapp.list('-created_date', 500);
    const contatosFalsos = todosContatos.filter(c => c.telefone && c.telefone.startsWith('lid_'));
    for (const contato of contatosFalsos) {
      await base44.asServiceRole.entities.ContatoWhatsapp.delete(contato.id);
    }

    return Response.json({
      success: true,
      conversasExcluidas,
      mensagensExcluidas,
      contatosFalsosExcluidos: contatosFalsos.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
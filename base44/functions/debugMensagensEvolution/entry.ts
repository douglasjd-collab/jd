import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Buscar 1 mensagem real de um cliente e ver o pushName no payload
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Pegar uma conversa com mensagens
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId }, '-data_ultima_mensagem', 1
    ).catch(() => []);
    const conversa = conversas[0];

    if (!conversa) return Response.json({ erro: 'Nenhuma conversa encontrada' });

    // Pegar mensagens dela do banco
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { conversa_id: conversa.id, remetente: 'cliente' },
      '-data_envio',
      1
    ).catch(() => []);

    const msg = mensagens[0];
    if (!msg) return Response.json({ erro: 'Nenhuma mensagem de cliente encontrada' });

    // Buscar a mesma mensagem na Evolution
    const jid = `${conversa.cliente_telefone}@s.whatsapp.net`;
    const evolutionRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteJid: jid, limit: 50 })
    });
    const evolutionData = await evolutionRes.json();
    const msgs = evolutionData?.messages?.records || [];

    // Procurar a mensagem pelo whatsapp_message_id
    const msgEvolution = msgs.find(m => m.id === msg.whatsapp_message_id);

    return Response.json({
      ok: true,
      conversa: {
        id: conversa.id,
        telefone: conversa.cliente_telefone,
        nomeLocal: conversa.cliente_nome
      },
      mensagemBanco: {
        id: msg.id,
        whatsappMessageId: msg.whatsapp_message_id,
        usuarioNome: msg.usuario_nome,
        texto: msg.texto
      },
      mensagemEvolution: msgEvolution ? {
        id: msgEvolution.id,
        pushName: msgEvolution.pushName,
        messageType: msgEvolution.messageType,
        fromMe: msgEvolution.key?.fromMe,
        remoteJid: msgEvolution.key?.remoteJid,
        remoteJidAlt: msgEvolution.key?.remoteJidAlt
      } : null,
      primeirasMsgEvolution: msgs.slice(0, 3).map(m => ({
        id: m.id,
        pushName: m.pushName,
        fromMe: m.key?.fromMe
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
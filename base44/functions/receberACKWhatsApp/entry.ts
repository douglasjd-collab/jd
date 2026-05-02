import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    console.log(`\n📥 ACK WEBHOOK RECEBIDO | ${new Date().toISOString()}`);
    console.log('📊 Body:', JSON.stringify(body, null, 2));

    // Evolution envia ACK assim
    if (body.event === 'messages.update') {
      const data = body.data;
      const messageId = data.key?.id;
      const statusRaw = data.status;

      console.log(`🔍 messageId: ${messageId} | statusRaw: ${statusRaw}`);

      if (!messageId) {
        console.log('⚠️ Sem messageId, ignorando');
        return Response.json({ ok: true });
      }

      let novoStatus = null;

      if (statusRaw === 'delivery_ack' || statusRaw === 2) {
        novoStatus = 'entregue';
      } else if (statusRaw === 'read' || statusRaw === 3 || statusRaw === 4) {
        novoStatus = 'lida';
      } else if (statusRaw === 1 || statusRaw === 'sent') {
        novoStatus = 'enviada';
      }

      if (!novoStatus) {
        console.log(`⚠️ Status não reconhecido: ${statusRaw}`);
        return Response.json({ ok: true });
      }

      console.log(`🔄 Atualizando: ${messageId} → ${novoStatus}`);

      // Buscar mensagem
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { whatsapp_message_id: messageId },
        '-created_date',
        1
      );

      if (msgs && msgs.length > 0) {
        const msg = msgs[0];
        
        // Nunca fazer downgrade de status
        const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };
        const novaProioridade = statusPriority[novoStatus] || 0;
        const atualPrioridade = statusPriority[msg.status] || 0;

        if (novaProioridade >= atualPrioridade) {
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
            status: novoStatus
          });
          console.log(`✅ ACK aplicado: ${msg.status} → ${novoStatus}`);
        } else {
          console.log(`⏭️ ACK ignorado (downgrade): ${msg.status} → ${novoStatus}`);
        }
      } else {
        console.warn(`⚠️ Mensagem ${messageId} não encontrada no banco`);
      }
    } else {
      console.log(`⏭️ Event não é messages.update: ${body.event}`);
    }

    return Response.json({ ok: true });

  } catch (error) {
    console.error(`❌ Erro webhook ACK:`, error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
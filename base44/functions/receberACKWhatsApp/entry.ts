import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    console.log(`\n📥 ACK WEBHOOK RECEBIDO | ${new Date().toISOString()}`);
    console.log('📊 Body:', JSON.stringify(body, null, 2));

    // Evolution envia ACK com event messages.update — data pode ser objeto OU array
    if (body.event === 'messages.update') {
      const updates = Array.isArray(body.data) ? body.data : [body.data];
      const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };

      for (const data of updates) {
        if (!data) continue;
        const messageId = data.key?.id;
        const statusRaw = data.update?.status ?? data.status;

        console.log(`🔍 messageId: ${messageId} | statusRaw: ${statusRaw}`);

        if (!messageId) continue;

        let novoStatus = null;
        const statusStr = String(statusRaw).toUpperCase();

        if (['READ', 'PLAYED', '3', '4'].includes(statusStr)) {
          novoStatus = 'lida';
        } else if (['DELIVERY_ACK', 'DELIVERED', '2'].includes(statusStr)) {
          novoStatus = 'entregue';
        } else if (['SENT', 'SERVER_ACK', '1'].includes(statusStr)) {
          novoStatus = 'enviada';
        }

        if (!novoStatus) {
          console.log(`⚠️ Status não reconhecido: ${statusRaw}`);
          continue;
        }

        console.log(`🔄 Atualizando: ${messageId} → ${novoStatus}`);

        const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { whatsapp_message_id: messageId },
          '-created_date',
          1
        );

        if (msgs && msgs.length > 0) {
          const msg = msgs[0];
          const novaProioridade = statusPriority[novoStatus] || 0;
          const atualPrioridade = statusPriority[msg.status] || 0;

          if (novaProioridade > atualPrioridade) {
            await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, { status: novoStatus });
            console.log(`✅ ACK aplicado: ${msg.status} → ${novoStatus}`);
          } else {
            console.log(`⏭️ ACK ignorado (não upgrade): ${msg.status} → ${novoStatus}`);
          }
        } else {
          console.warn(`⚠️ Mensagem ${messageId} não encontrada no banco`);
        }
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
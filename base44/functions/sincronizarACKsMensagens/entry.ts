import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Automação agendada: sincroniza status de mensagens recentes consultando Evolution API
// Roda a cada 5 min como fallback para os casos em que o webhook não entrega ACKs
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const statusPriorityEv = {
      'READ': 4, 'PLAYED': 4, 'VIEWED': 4,
      'DELIVERY_ACK': 2, 'DELIVERED': 2, 'DEVICE_READ': 2,
      'SERVER_ACK': 1, 'SENT': 1, 'PENDING': 0
    };
    const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };

    // Buscar todas as empresas com Evolution configurada
    const empresas = await base44.asServiceRole.entities.Empresa.filter({}, null, 50);

    let totalAtualizadas = 0;

    for (const empresa of empresas) {
      const evolutionUrl = (empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
      const evolutionKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
      const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

      if (!evolutionUrl || !evolutionKey || !instanceName) continue;

      // Buscar mensagens de vendedor com status não-final das últimas 24h
      const ontemISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { empresa_id: empresa.id, remetente: 'vendedor' }, '-data_envio', 100
      );

      const pendentes = mensagens.filter(m =>
        ['pendente', 'enviada', 'entregue'].includes(m.status) &&
        m.whatsapp_message_id &&
        !m.whatsapp_message_id.startsWith('temp_') &&
        m.data_envio > ontemISO
      );

      if (pendentes.length === 0) continue;
      console.log(`🔍 ${empresa.nome}: ${pendentes.length} msgs para checar`);

      for (const msg of pendentes) {
        try {
          const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ where: { key: { id: msg.whatsapp_message_id } }, limit: 1 })
          });

          if (!res.ok) continue;
          const data = await res.json();
          const msgs = Array.isArray(data) ? data : (data?.messages?.records || data?.messages || []);
          if (msgs.length === 0) continue;

          const msgEv = msgs[0];

          // Pegar melhor status de MessageUpdate[]
          let bestStatus = String(msgEv?.status ?? '').toUpperCase();
          if (Array.isArray(msgEv?.MessageUpdate)) {
            for (const mu of msgEv.MessageUpdate) {
              const s = String(mu?.status || '').toUpperCase();
              if ((statusPriorityEv[s] ?? -1) > (statusPriorityEv[bestStatus] ?? -1)) {
                bestStatus = s;
              }
            }
          }

          if (!bestStatus) continue;

          let novoStatus = null;
          if (['READ', 'PLAYED', 'VIEWED'].includes(bestStatus) || (statusPriorityEv[bestStatus] ?? 0) >= 4) novoStatus = 'lida';
          else if (['DELIVERY_ACK', 'DELIVERED', 'DEVICE_READ'].includes(bestStatus)) novoStatus = 'entregue';
          else if (['SENT', 'SERVER_ACK'].includes(bestStatus)) novoStatus = 'enviada';

          if (novoStatus && (statusPriority[novoStatus] || 0) > (statusPriority[msg.status] || 0)) {
            const updateData = { status: novoStatus };
            if (novoStatus === 'entregue') updateData.entregue_em = new Date().toISOString();
            if (novoStatus === 'lida') updateData.lida_em = new Date().toISOString();
            await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, updateData);
            console.log(`✅ ${msg.id}: ${msg.status} → ${novoStatus}`);
            totalAtualizadas++;
          }
        } catch (e) {
          console.warn(`⚠️ Erro msg ${msg.id}:`, e.message);
        }
      }
    }

    return Response.json({ success: true, totalAtualizadas });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
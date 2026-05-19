import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Consulta a Evolution API pelo status real das mensagens enviadas
// e atualiza o banco se estiver desatualizado
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.text();
    const { conversa_id, empresa_id, debug } = JSON.parse(body || '{}');

    const empresaId = empresa_id || user.empresa_id;
    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const empresa = await base44.asServiceRole.entities.Empresa.get(empresaId);
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const evolutionUrl = (empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ error: 'Credenciais Evolution não configuradas' }, { status: 400 });
    }

    const filtro = conversa_id
      ? { conversa_id, remetente: 'vendedor' }
      : { empresa_id: empresaId, remetente: 'vendedor' };

    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(filtro, '-data_envio', 50);
    const pendentes = mensagens.filter(m =>
      ['pendente', 'enviada', 'entregue'].includes(m.status) &&
      m.whatsapp_message_id &&
      !m.whatsapp_message_id.startsWith('temp_')
    );

    console.log(`🔍 ${pendentes.length} mensagens pendentes/enviadas/entregues para checar`);

    const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };
    let atualizadas = 0;
    const debugInfo = [];

    for (const msg of pendentes) {
      try {
        const conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(msg.conversa_id);
        if (!conversa?.cliente_telefone) continue;

        const telefone = conversa.cliente_telefone.replace(/\D/g, '');
        const remoteJid = `${telefone}@s.whatsapp.net`;

        // Consultar Evolution via findMessages com ID exato
        const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            where: { key: { id: msg.whatsapp_message_id } },
            limit: 5
          })
        });

        const resText = await res.text();
        let data = null;
        try { data = JSON.parse(resText); } catch (_) { data = resText; }

        const msgs = Array.isArray(data) ? data : (data?.messages?.records || data?.messages || []);

        if (msgs.length === 0) {
          console.log(`⚠️ Msg não encontrada na Evolution: ${msg.whatsapp_message_id} | status HTTP: ${res.status}`);
          if (debug) debugInfo.push({ id: msg.id, wid: msg.whatsapp_message_id, encontrada: false, raw: resText.substring(0, 200) });
          continue;
        }

        const msgEv = msgs[0];

        // Evolution armazena histórico em MessageUpdate[{status}] — pegar o mais recente (maior prioridade)
        const statusPriorityEv = { 'READ': 4, 'PLAYED': 4, 'VIEWED': 4, 'DELIVERY_ACK': 2, 'DELIVERED': 2, 'DEVICE_READ': 2, 'SERVER_ACK': 1, 'SENT': 1, 'PENDING': 0 };
        let bestStatus = msgEv?.status ?? msgEv?.ack ?? msgEv?.messageStatus ?? '';
        if (Array.isArray(msgEv?.MessageUpdate)) {
          for (const upd of msgEv.MessageUpdate) {
            const s = String(upd?.status || '').toUpperCase();
            if ((statusPriorityEv[s] ?? -1) > (statusPriorityEv[String(bestStatus).toUpperCase()] ?? -1)) {
              bestStatus = s;
            }
          }
        }
        const ackRaw = bestStatus;
        const ackStr = String(ackRaw).toUpperCase().trim();
        const ackNum = parseInt(ackStr, 10);

        console.log(`📊 Msg ${msg.whatsapp_message_id} | Evolution status: "${ackStr}" (num: ${ackNum}) | banco: ${msg.status}`);

        if (debug) debugInfo.push({ id: msg.id, wid: msg.whatsapp_message_id, ackRaw, ackStr, statusBanco: msg.status, msgEv });

        let novoStatus = null;
        if (['READ', 'PLAYED', 'VIEWED', '3', '4'].includes(ackStr) || ackNum >= 3) novoStatus = 'lida';
        else if (['DELIVERY_ACK', 'DELIVERED', 'DEVICE_READ', '2'].includes(ackStr) || ackNum === 2) novoStatus = 'entregue';
        else if (['SENT', 'SERVER_ACK', '1'].includes(ackStr) || ackNum === 1) novoStatus = 'enviada';

        if (novoStatus && (statusPriority[novoStatus] || 0) > (statusPriority[msg.status] || 0)) {
          const updateData = { status: novoStatus };
          if (novoStatus === 'entregue') updateData.entregue_em = new Date().toISOString();
          if (novoStatus === 'lida') updateData.lida_em = new Date().toISOString();
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, updateData);
          console.log(`✅ Atualizado: ${msg.status} → ${novoStatus} | ${msg.id}`);
          atualizadas++;
        }
      } catch (e) {
        console.warn(`⚠️ Erro msg ${msg.id}:`, e.message);
      }
    }

    return Response.json({ success: true, verificadas: pendentes.length, atualizadas, ...(debug ? { debugInfo } : {}) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const empresaId = user.empresa_id;
    if (!empresaId) {
      return Response.json({ error: 'No company found' }, { status: 400 });
    }

    // Buscar mensagens enviadas nos últimos 5 minutos que ainda não foram marcadas como entregues/lidas
    const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const mensagensRecentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      empresa_id: empresaId,
      remetente: 'vendedor',
      // data_envio: { $gte: cincoMinutosAtras }  — usar filter simples por agora
    }, '-data_envio', 100);

    const filtradas = mensagensRecentes.filter(m => 
      new Date(m.data_envio || m.created_date) >= new Date(cincoMinutosAtras) &&
      m.status !== 'lida'  // Apenas as que ainda não foram lidas
    );

    console.log(`\n🔄 Sincronizando ${filtradas.length} mensagens recentes...`);

    // Para cada mensagem, tentar buscar status da Evolution API
    const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      console.warn('⚠️ Evolution credentials not configured');
      return Response.json({ 
        success: true, 
        syncedCount: 0, 
        reason: 'Evolution credentials missing' 
      });
    }

    let sincronizadas = 0;
    for (const msg of filtradas) {
      try {
        // Evolution: buscar status da mensagem por ID
        const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 
            'apikey': evolutionKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            where: { key: { id: msg.whatsapp_message_id } },
            limit: 1
          })
        });

        if (!res.ok) continue;

        const data = await res.json();
        const msgData = Array.isArray(data) ? data[0] : (data.messages?.records?.[0] || null);
        
        if (!msgData) continue;

        const rawStatus = msgData.status || msgData.ack;
        let novoStatus = null;

        if (rawStatus === 1 || rawStatus === 'SENT' || rawStatus === 'sent') {
          novoStatus = 'enviada';
        } else if (rawStatus === 2 || rawStatus === 'DELIVERED' || rawStatus === 'delivered') {
          novoStatus = 'entregue';
        } else if (rawStatus === 3 || rawStatus === 4 || rawStatus === 'READ' || rawStatus === 'read') {
          novoStatus = 'lida';
        }

        if (novoStatus && novoStatus !== msg.status) {
          // Nunca fazer downgrade
          const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };
          const novaPrio = statusPriority[novoStatus] || 0;
          const atualPrio = statusPriority[msg.status] || 0;

          if (novaPrio >= atualPrio) {
            await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, { 
              status: novoStatus 
            });
            sincronizadas++;
            console.log(`✅ ${msg.id} | ${msg.status} → ${novoStatus}`);
          }
        }
      } catch (e) {
        console.warn(`⚠️ Erro ao sincronizar ${msg.id}:`, e.message);
      }
    }

    console.log(`\n✅ Sincronizadas ${sincronizadas} mensagens\n`);
    return Response.json({ 
      success: true, 
      totalChecked: filtradas.length,
      syncedCount: sincronizadas
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
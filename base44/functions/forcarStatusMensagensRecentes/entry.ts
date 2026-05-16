import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.text();
    const { conversa_id, empresa_id } = JSON.parse(body || '{}');

    const empresaId = empresa_id || user.empresa_id;
    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar empresa para obter credenciais Evolution
    const empresa = await base44.asServiceRole.entities.Empresa.get(empresaId);
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const evolutionUrl = (empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ error: 'Credenciais Evolution não configuradas' }, { status: 400 });
    }

    // Buscar mensagens enviadas (vendedor) com status não-final
    const filtro = conversa_id 
      ? { conversa_id, remetente: 'vendedor' }
      : { empresa_id: empresaId, remetente: 'vendedor' };
    
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      filtro, '-data_envio', 50
    );

    // Filtrar mensagens com status não-final (pendente, enviada ou entregue) e com whatsapp_message_id
    const pendentes = mensagens.filter(m => 
      ['pendente', 'enviada', 'entregue'].includes(m.status) && 
      m.whatsapp_message_id && 
      !m.whatsapp_message_id.startsWith('temp_')
    );

    console.log(`🔍 Mensagens pendentes/enviadas com ID: ${pendentes.length}`);

    let atualizadas = 0;
    const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };

    for (const msg of pendentes) {
      try {
        // Buscar conversa para obter o telefone do cliente
        const conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(msg.conversa_id);
        if (!conversa?.cliente_telefone) continue;

        const telefone = conversa.cliente_telefone.replace(/\D/g, '');
        const remoteJid = `${telefone}@s.whatsapp.net`;

        // Consultar Evolution API pelo status da mensagem específica
        const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            where: { key: { id: msg.whatsapp_message_id, remoteJid } },
            limit: 1
          })
        });

        if (!res.ok) continue;

        const data = await res.json();
        const msgs = Array.isArray(data) ? data : (data.messages?.records || data.messages || []);
        
        if (msgs.length === 0) continue;

        const msgEvolution = msgs[0];
        const statusEvolution = msgEvolution?.status?.toString().toUpperCase() || '';
        
        let novoStatus = null;
        if (['READ', 'PLAYED', '3', '4'].includes(statusEvolution)) novoStatus = 'lida';
        else if (['DELIVERY_ACK', 'DELIVERED', '2'].includes(statusEvolution)) novoStatus = 'entregue';
        else if (['SENT', 'SERVER_ACK', '1'].includes(statusEvolution)) novoStatus = 'enviada';

        if (novoStatus && (statusPriority[novoStatus] || 0) > (statusPriority[msg.status] || 0)) {
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, { status: novoStatus });
          console.log(`✅ ${msg.id}: ${msg.status} → ${novoStatus}`);
          atualizadas++;
        }
      } catch (e) {
        console.warn(`⚠️ Erro ao atualizar msg ${msg.id}:`, e.message);
      }
    }

    return Response.json({ 
      success: true, 
      verificadas: pendentes.length, 
      atualizadas,
      mensagem: `${atualizadas} mensagens tiveram status atualizado`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
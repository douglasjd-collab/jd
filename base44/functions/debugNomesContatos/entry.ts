import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId && user.perfil === 'super_admin') {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar configuração da empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: `Evolution não configurada para empresa ${empresaId}` }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Buscar algumas conversas com nomes
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId, cliente_nome: { $exists: true, $ne: '' } },
      '-updated_date',
      10
    ).catch(() => []);

    console.log(`📊 ${conversas.length} conversas com nome encontradas`);

    // Coletar nomes únicos
    const nomeUnicos = [...new Set(conversas.map(c => c.cliente_nome))];

    // Para uma conversa com "Douglas", puxar as mensagens dela para ver os pushName reais
    const comDouglas = conversas.find(c => c.cliente_nome === 'Douglas');
    
    let mensagensDebug = [];
    if (comDouglas) {
      try {
        const jid = `${comDouglas.cliente_telefone}@s.whatsapp.net`;
        const msgRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ remoteJid: jid, limit: 20 })
        });

        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const msgs = msgData?.messages?.records || [];
          
          mensagensDebug = msgs.slice(0, 5).map(m => ({
            fromMe: m.key?.fromMe,
            pushName: m.pushName,
            sender: m.key?.participant?.split('@')?.[0],
            timestamp: m.messageTimestamp
          }));
        }
      } catch (e) {
        console.error('Erro ao buscar mensagens:', e.message);
      }
    }

    return Response.json({
      ok: true,
      totalConversas: conversas.length,
      nomesUnicos: nomeUnicos,
      nomesDouglas: conversas.filter(c => c.cliente_nome === 'Douglas').length,
      exemploConDouglas: comDouglas ? {
        telefone: comDouglas.cliente_telefone,
        nome: comDouglas.cliente_nome,
        updated_date: comDouglas.updated_date
      } : null,
      mensagensExemplo: mensagensDebug
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
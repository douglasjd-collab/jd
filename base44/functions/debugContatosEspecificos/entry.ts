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

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: 'Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Números específicos para debugar
    const numerosTeste = ['5587999266340', '5581997530267'];
    
    const resultados = [];

    for (const numero of numerosTeste) {
      const jid = `${numero}@s.whatsapp.net`;
      
      try {
        const msgRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ remoteJid: jid, limit: 50 })
        });

        if (!msgRes.ok) {
          resultados.push({
            numero,
            erro: `HTTP ${msgRes.status}`
          });
          continue;
        }

        const msgData = await msgRes.json();
        const msgs = msgData?.messages?.records || [];

        // Pegar todos os pushNames das mensagens recebidas
        const msgsRecebidas = msgs.filter(m => !m.key?.fromMe);
        const pushNames = msgsRecebidas
          .filter(m => m.pushName && m.pushName.trim())
          .map(m => m.pushName.trim());

        resultados.push({
          numero,
          totalMsgs: msgs.length,
          msgsRecebidas: msgsRecebidas.length,
          pushNamesEncontrados: [...new Set(pushNames)],
          pushNameMaisFrequente: pushNames.length > 0 ? pushNames[0] : 'nenhum',
          ultimasMensagens: msgsRecebidas.slice(0, 3).map(m => ({
            pushName: m.pushName,
            timestamp: m.messageTimestamp
          }))
        });
      } catch (e) {
        resultados.push({
          numero,
          erro: e.message
        });
      }
    }

    // Também checar o que está salvo no banco
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId, cliente_telefone: { $in: numerosTeste } }
    ).catch(() => []);

    return Response.json({
      ok: true,
      salvoNoBanco: conversas.map(c => ({
        telefone: c.cliente_telefone,
        nomeAtual: c.cliente_nome,
        updated_date: c.updated_date
      })),
      debugEvolution: resultados
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
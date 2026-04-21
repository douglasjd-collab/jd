import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Verificar whatsapp_id das conversas vs chats da Evolution
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

    // Buscar TODOS os chats para criar mapa de JID → pushName
    const chatsRes = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1000 })
    });
    const chatsData = await chatsRes.json();
    const chats = Array.isArray(chatsData) ? chatsData : [];

    // Mapa por JID completo (com @) → pushName
    const chatJidMap = {};
    for (const chat of chats) {
      if (chat.pushName && chat.remoteJid) {
        chatJidMap[chat.remoteJid] = chat.pushName;
      }
    }

    // Buscar conversas do banco
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId }, '-created_date', 10000
    ).catch(() => []);

    const semNome = conversas.filter(c => {
      const nomeAtual = (c.cliente_nome || '').trim();
      const tel = (c.cliente_telefone || '').replace(/\D/g, '');
      return !nomeAtual || nomeAtual === tel || nomeAtual.startsWith('Cliente ');
    });

    // Tentar match pelo whatsapp_id
    let matchPorWid = 0;
    const exemplos = [];
    for (const c of semNome.slice(0, 20)) {
      const wid = c.whatsapp_id || '';
      const nome = chatJidMap[wid];
      if (nome) {
        matchPorWid++;
        exemplos.push({ tel: c.cliente_telefone, wid, nome });
      }
    }

    // Ver os whatsapp_id das conversas sem nome
    const exemplosWid = semNome.slice(0, 5).map(c => ({
      tel: c.cliente_telefone,
      wid: c.whatsapp_id,
      widNoMapa: !!chatJidMap[c.whatsapp_id || '']
    }));

    // Ver chats com pushName não nulo
    const chatsComNome = chats.filter(c => c.pushName);
    const chatsComNomeAmostra = chatsComNome.slice(0, 5).map(c => ({
      jid: c.remoteJid,
      nome: c.pushName
    }));

    return Response.json({
      ok: true,
      totalChats: chats.length,
      chatsComNome: chatsComNome.length,
      totalSemNome: semNome.length,
      matchPorWidAmostra: matchPorWid,
      exemplosWid,
      exemplosMatch: exemplos,
      chatsComNomeAmostra
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
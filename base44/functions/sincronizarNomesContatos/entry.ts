import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Sincroniza os nomes (pushName) dos contatos da Evolution API.
 * Fonte: /chat/findChats — que traz remoteJid (número real) + pushName.
 * Match EXATO de telefone — sem normalização que causa colisão de nomes.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;

    if (!empresaId) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key) {
      return Response.json({ erro: 'Evolution não configurada para esta empresa' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🔄 Buscando chats da Evolution (${instanceName})...`);

    // Buscar TODOS os chats — que têm remoteJid (número real) + pushName
    let paginaAtual = 0;
    const LIMITE = 500;
    const nomeMapExato = {}; // telefone exato (dígitos) → nome

    while (true) {
      const res = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: LIMITE, offset: paginaAtual * LIMITE })
      });

      if (!res.ok) break;
      const data = await res.json();
      const chats = Array.isArray(data) ? data : (data.chats?.records || data.chats || []);
      if (chats.length === 0) break;

      for (const chat of chats) {
        const jid = chat.remoteJid || '';
        const pushName = (chat.pushName || '').trim();

        // Ignorar grupos, broadcasts e sem nome
        if (!jid || jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@lid')) continue;
        if (!pushName || /^\d+$/.test(pushName)) continue; // ignorar nomes que são só números

        const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
        if (!tel || tel.length < 8) continue;

        // Primeiro nome vence — não sobrescrever
        if (!nomeMapExato[tel]) {
          nomeMapExato[tel] = pushName;
        }
      }

      console.log(`📄 Página ${paginaAtual + 1}: ${chats.length} chats processados | total nomes: ${Object.keys(nomeMapExato).length}`);

      if (chats.length < LIMITE) break; // última página
      paginaAtual++;
      if (paginaAtual > 10) break; // segurança
    }

    console.log(`👥 ${Object.keys(nomeMapExato).length} números com nome mapeados`);

    // Lookup com match exato + variação com/sem 9 como fallback
    // A variação só é usada quando NÃO há conflito (o número exato não existe no mapa)
    const buscarNome = (telInput) => {
      const t = (telInput || '').replace(/\D/g, '');
      if (!t) return null;

      if (nomeMapExato[t]) return nomeMapExato[t];

      // Fallback sem 9: 5587981234567 → 558781234567
      if (t.length === 13 && t.startsWith('55')) {
        const sem9 = t.slice(0, 4) + t.slice(5);
        // Só usa se o número com 9 NÃO existe no mapa (evita colisão)
        if (nomeMapExato[sem9] && !nomeMapExato[t]) return nomeMapExato[sem9];
      }

      // Fallback com 9: 558781234567 → 5587981234567
      if (t.length === 12 && t.startsWith('55')) {
        const com9 = t.slice(0, 4) + '9' + t.slice(4);
        if (nomeMapExato[com9] && !nomeMapExato[t]) return nomeMapExato[com9];
      }

      return null;
    };

    // Buscar conversas e contatos CRM do banco
    const [conversas, contatosCRM] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000).catch(() => []),
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000).catch(() => [])
    ]);

    console.log(`📊 ${conversas.length} conversas | ${contatosCRM.length} contatos CRM`);

    let conversasAtualizadas = 0;
    let contatosAtualizados = 0;
    let semMatch = 0;

    // Atualizar conversas com nome genérico/vazio
    for (const conversa of conversas) {
      const nomeAtual = (conversa.cliente_nome || '').trim();
      const tel = (conversa.cliente_telefone || '').replace(/\D/g, '');
      const ehGenerico = !nomeAtual || nomeAtual === tel || nomeAtual.startsWith('Cliente ');

      if (!ehGenerico) continue; // preservar nomes editados manualmente

      const nome = buscarNome(conversa.cliente_telefone);
      if (!nome) { semMatch++; continue; }

      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        cliente_nome: nome
      }).catch(() => {});

      console.log(`✏️ Conversa ${tel} → "${nome}"`);
      conversasAtualizadas++;
    }

    // Atualizar contatos CRM com nome genérico/vazio
    for (const contato of contatosCRM) {
      const nomeAtual = (contato.nome || '').trim();
      const tel = (contato.telefone || '').replace(/\D/g, '');
      const ehGenerico = !nomeAtual || nomeAtual === tel || nomeAtual.startsWith('Cliente ');

      if (!ehGenerico) continue;

      const nome = buscarNome(contato.telefone);
      if (!nome) continue;

      await base44.asServiceRole.entities.ContatoWhatsapp.update(contato.id, {
        nome,
        ultima_atualizacao: new Date().toISOString()
      }).catch(() => {});

      contatosAtualizados++;
    }

    console.log(`✅ Conversas: ${conversasAtualizadas} | Contatos CRM: ${contatosAtualizados} | Sem match: ${semMatch}`);

    return Response.json({
      ok: true,
      nomesMapeados: Object.keys(nomeMapExato).length,
      conversasAtualizadas,
      contatosAtualizados,
      semMatch,
      mensagem: `${conversasAtualizadas} conversas e ${contatosAtualizados} contatos atualizados`
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Sincroniza os nomes (pushName) dos contatos da Evolution API.
 * 
 * Usa /chat/findContacts que retorna todos contatos com nome salvo.
 * Match por sufixo dos últimos 8 dígitos para cobrir variações com/sem 9.
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

    console.log(`🔄 Buscando contatos da Evolution (${instanceName})...`);

    // Buscar TODOS os contatos de uma vez via /chat/findContacts
    const res = await fetch(`${evolutionUrl}/chat/findContacts/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      return Response.json({ erro: `Evolution retornou ${res.status}` }, { status: 500 });
    }

    const listaContatos = await res.json();
    console.log(`📋 ${listaContatos.length} contatos retornados`);

    // Mapa exato: telefone (dígitos) → nome
    const nomeMapExato = {};
    // Mapa por sufixo dos últimos 8 dígitos → nome (para cobrir variações com/sem 9)
    // Só aplica se não houver colisão (múltiplos números com mesmo sufixo)
    const nomeMapSufixo = {}; // sufixo8 → nome
    const sufixoColisao = new Set(); // sufixos que aparecem mais de uma vez

    for (const contato of listaContatos) {
      const pushName = (contato.pushName || '').trim();
      if (!pushName || /^\d+$/.test(pushName)) continue;

      const jid = contato.remoteJid || '';
      // Ignorar grupos, broadcasts e @lid (IDs internos, não números de telefone)
      if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@lid')) continue;

      const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
      if (!tel || tel.length < 8) continue;

      // Match exato
      if (!nomeMapExato[tel]) {
        nomeMapExato[tel] = pushName;
      }

      // Match por sufixo (últimos 8 dígitos)
      const sufixo8 = tel.slice(-8);
      if (nomeMapSufixo[sufixo8] && nomeMapSufixo[sufixo8] !== pushName) {
        sufixoColisao.add(sufixo8); // marca colisão — não usar esse sufixo
      } else if (!nomeMapSufixo[sufixo8]) {
        nomeMapSufixo[sufixo8] = pushName;
      }
    }

    // Remover sufixos com colisão (ambíguos)
    for (const s of sufixoColisao) {
      delete nomeMapSufixo[s];
    }

    console.log(`👥 ${Object.keys(nomeMapExato).length} exatos | ${Object.keys(nomeMapSufixo).length} sufixos únicos | ${sufixoColisao.size} colisões removidas`);

    // Buscar conversas e contatos CRM do banco
    const [conversas, contatosCRM] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000).catch(() => []),
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000).catch(() => [])
    ]);

    console.log(`📊 ${conversas.length} conversas | ${contatosCRM.length} contatos CRM`);

    // Busca: exato → variação 9 → sufixo 8 dígitos
    const buscarNome = (telInput) => {
      const t = (telInput || '').replace(/\D/g, '');
      if (!t) return null;

      // 1. Match exato
      if (nomeMapExato[t]) return nomeMapExato[t];

      // 2. Variação +9 / -9 (apenas para números BR)
      if (t.length === 13 && t.startsWith('55')) {
        const sem9 = t.slice(0, 4) + t.slice(5);
        if (nomeMapExato[sem9]) return nomeMapExato[sem9];
      }
      if (t.length === 12 && t.startsWith('55')) {
        const com9 = t.slice(0, 4) + '9' + t.slice(4);
        if (nomeMapExato[com9]) return nomeMapExato[com9];
      }

      // 3. Match por sufixo (8 últimos dígitos — sem colisão)
      const sufixo8 = t.slice(-8);
      if (sufixo8.length === 8 && nomeMapSufixo[sufixo8]) return nomeMapSufixo[sufixo8];

      return null;
    };

    let conversasAtualizadas = 0;
    let contatosAtualizados = 0;
    let semMatch = 0;

    // Atualizar conversas com nome genérico/vazio
    for (const conversa of conversas) {
      const nomeAtual = (conversa.cliente_nome || '').trim();
      const tel = (conversa.cliente_telefone || '').replace(/\D/g, '');
      const ehGenerico = !nomeAtual || nomeAtual === tel || nomeAtual.startsWith('Cliente ');

      if (!ehGenerico) continue;

      const nome = buscarNome(conversa.cliente_telefone);
      if (!nome) { semMatch++; continue; }

      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        cliente_nome: nome
      }).catch(() => {});

      console.log(`✅ Conversa ${tel} → "${nome}"`);
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
        nome
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
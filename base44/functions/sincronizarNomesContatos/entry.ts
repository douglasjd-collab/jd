import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Sincroniza os nomes (pushName) dos contatos da Evolution API
 * para as conversas e contatos CRM já existentes no banco.
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

    // Buscar todos os contatos da Evolution
    let todosContatos = [];
    const resContatos = await fetch(`${evolutionUrl}/contact/findContacts/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10000, where: {} })
    });

    if (resContatos.ok) {
      const dataContatos = await resContatos.json();
      const rawContatos = Array.isArray(dataContatos)
        ? dataContatos
        : (dataContatos.contacts?.records || dataContatos.contacts || []);

      for (const c of rawContatos) {
        const jid = c.jid || c.id || '';
        if (!jid || jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@lid')) continue;

        const pushName = c.pushName || c.name || c.senderName || '';
        if (!pushName) continue; // só atualizar se tiver nome

        const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
        if (!tel.startsWith('55') || (tel.length !== 12 && tel.length !== 13)) continue;

        // Normalizar: remover o 9 extra para padronizar em 12 dígitos
        const telNorm = tel.length === 13 ? tel.slice(0, 4) + tel.slice(5) : tel;
        const telCom9 = tel.length === 12 ? tel.slice(0, 4) + '9' + tel.slice(4) : tel;

        todosContatos.push({ tel: telNorm, telCom9, pushName });
      }
    } else {
      console.warn(`⚠️ Erro ao buscar contatos: ${resContatos.status}`);
      return Response.json({ erro: `Erro Evolution: ${resContatos.status}` }, { status: 400 });
    }

    console.log(`👥 ${todosContatos.length} contatos com nome encontrados`);

    // Buscar todas as conversas e contatos CRM do banco
    const [conversas, contatosCRM] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000).catch(() => []),
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000).catch(() => [])
    ]);

    console.log(`📊 ${conversas.length} conversas | ${contatosCRM.length} contatos CRM no banco`);

    // Criar mapa de telefone → nome (por todas as variações)
    const nomeMap = {};
    for (const c of todosContatos) {
      if (!nomeMap[c.tel]) nomeMap[c.tel] = c.pushName;
      if (!nomeMap[c.telCom9]) nomeMap[c.telCom9] = c.pushName;
    }

    let conversasAtualizadas = 0;
    let contatosAtualizados = 0;

    // Atualizar conversas que não têm nome ou têm nome genérico
    for (const conversa of conversas) {
      const tel = (conversa.cliente_telefone || '').replace(/\D/g, '');
      const nomeWpp = nomeMap[tel];
      if (!nomeWpp) continue;

      const nomeAtual = conversa.cliente_nome || '';
      const ehGenerico = !nomeAtual || nomeAtual === tel || nomeAtual.startsWith('Cliente ');
      const diferente = nomeAtual !== nomeWpp;

      if (ehGenerico || diferente) {
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
          cliente_nome: nomeWpp
        }).catch(e => console.warn(`Erro ao atualizar conversa ${conversa.id}: ${e.message}`));
        conversasAtualizadas++;
      }
    }

    // Atualizar contatos CRM que não têm nome ou têm nome genérico
    for (const contato of contatosCRM) {
      const tel = (contato.telefone || '').replace(/\D/g, '');
      const nomeWpp = nomeMap[tel];
      if (!nomeWpp) continue;

      const nomeAtual = contato.nome || '';
      const ehGenerico = !nomeAtual || nomeAtual === tel || nomeAtual.startsWith('Cliente ');
      const diferente = nomeAtual !== nomeWpp;

      if (ehGenerico || diferente) {
        await base44.asServiceRole.entities.ContatoWhatsapp.update(contato.id, {
          nome: nomeWpp,
          ultima_atualizacao: new Date().toISOString()
        }).catch(e => console.warn(`Erro ao atualizar contato ${contato.id}: ${e.message}`));
        contatosAtualizados++;
      }
    }

    console.log(`✅ Nomes sincronizados: ${conversasAtualizadas} conversas | ${contatosAtualizados} contatos CRM`);

    return Response.json({
      ok: true,
      contatosComNome: todosContatos.length,
      conversasAtualizadas,
      contatosAtualizados,
      mensagem: `${conversasAtualizadas} conversas e ${contatosAtualizados} contatos atualizados com nome do WhatsApp`
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
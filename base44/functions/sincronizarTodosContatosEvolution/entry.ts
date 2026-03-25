import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Sincroniza TODOS os contatos da Evolution com histórico
 * Cria conversas para contatos que não têm no banco
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    // Buscar config da Evolution
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas?.[0]?.evolution_url || !empresas?.[0]?.evolution_api_key) {
      return Response.json({ erro: 'Evolution não configurada' }, { status: 400 });
    }

    const emp = empresas[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🔄 Iniciando sincronização de contatos da Evolution...`);

    // 1. Buscar TODOS os chats da Evolution
    let todosChats = [];
    try {
      const resChats = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: {} })
      });
      if (resChats.ok) {
        const data = await resChats.json();
        todosChats = Array.isArray(data) ? data : (data.chats?.records || data.chats || []);
        console.log(`📨 ${todosChats.length} chats encontrados na Evolution`);
      }
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar chats: ${e.message}`);
    }

    // 2. Buscar TODOS os contatos da Evolution
    let todosContatos = [];
    try {
      const resContatos = await fetch(`${evolutionUrl}/contact/findContacts/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: {} })
      });
      if (resContatos.ok) {
        const data = await resContatos.json();
        todosContatos = Array.isArray(data) ? data : (data.contacts?.records || data.contacts || []);
        console.log(`👥 ${todosContatos.length} contatos encontrados na Evolution`);
      }
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar contatos: ${e.message}`);
    }

    // Combinar chats + contatos
    const fontesEvolution = [...todosChats, ...todosContatos];
    console.log(`🔗 Total de fontes (chats + contatos): ${fontesEvolution.length}`);

    // Filtrar: apenas números BR válidos (sem @lid, sem @g.us, sem broadcast)
    const contatosValidos = fontesEvolution
      .map(item => {
        const jid = item.jid || item.id || item.remoteJid || '';
        return {
          jid,
          pushName: item.pushName || item.name || item.senderName || '',
          lastMessage: item.lastMessage || item.lastMessageText || '',
          timestamp: item.timestamp || item.lastSeen || new Date().toISOString()
        };
      })
      .filter(item => {
        // Rejeitar grupos, broadcasts, @lid
        if (item.jid.includes('@g.us') || item.jid.includes('@broadcast') || item.jid.includes('@lid')) {
          return false;
        }
        // Aceitar @s.whatsapp.net e @c.us
        if (!item.jid.includes('@s.whatsapp.net') && !item.jid.includes('@c.us')) {
          return false;
        }
        return true;
      })
      .map(item => {
        // Extrair número
        const tel = item.jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
        // Normalizar BR (se 13 dígitos com 9 extra, remover 9)
        let telNormalizado = tel;
        if (tel.startsWith('55') && tel.length === 13) {
          telNormalizado = tel.slice(0, 4) + tel.slice(5);
        }
        return {
          jid: item.jid,
          tel: telNormalizado,
          pushName: item.pushName,
          lastMessage: item.lastMessage,
          timestamp: item.timestamp
        };
      })
      .filter(item => {
        // Validação final: 55 + 2 dígitos (DDD) + 8-9 dígitos (número)
        if (!item.tel.startsWith('55')) return false;
        if (item.tel.length !== 12 && item.tel.length !== 13) return false;
        return true;
      });

    console.log(`✅ ${contatosValidos.length} contatos válidos filtrados`);

    // 3. Buscar conversas existentes no banco
    const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      2000
    );

    const telefonesExistentes = new Set(
      conversasExistentes
        .map(c => (c.cliente_telefone || '').replace(/\D/g, ''))
        .filter(t => t && t.startsWith('55') && (t.length === 12 || t.length === 13))
    );

    console.log(`📊 ${telefonesExistentes.size} conversas existentes no banco`);

    // 4. Criar conversas para contatos que não existem
    let criadasNovas = 0;
    let jaExistem = 0;

    for (const contato of contatosValidos) {
      const telNorm = contato.tel;
      
      if (telefonesExistentes.has(telNorm)) {
        jaExistem++;
        continue;
      }

      try {
        await base44.asServiceRole.entities.ConversaWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: '',
          cliente_nome: contato.pushName || `Cliente ${telNorm}`,
          cliente_telefone: telNorm,
          whatsapp_id: `${telNorm}@s.whatsapp.net`,
          status: 'ativa',
          ultima_mensagem: contato.lastMessage || 'Conversa sincronizada',
          data_ultima_mensagem: contato.timestamp,
          tipo_conexao: 'empresa',
          instancia: instanceName
        });
        criadasNovas++;
        console.log(`✅ Conversa criada: ${telNorm} (${contato.pushName})`);
      } catch (e) {
        console.error(`❌ Erro ao criar conversa ${telNorm}: ${e.message}`);
      }
    }

    return Response.json({
      ok: true,
      totalContatosEvolution: fontesEvolution.length,
      contatosValidos: contatosValidos.length,
      criadasNovas,
      jaExistem,
      totalApos: telefonesExistentes.size + criadasNovas
    });
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
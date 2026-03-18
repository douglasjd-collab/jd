import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Tenta resolver um @lid para telefone real via múltiplas estratégias na Evolution API
async function resolverLidReal(lidNumerico, evolutionUrl, evolutionKey, instanceName) {
  const lidJid = `${lidNumerico}@lid`;
  const headers = { 'apikey': evolutionKey, 'Content-Type': 'application/json' };

  // Estratégia 1: buscar nos chats/conversas recentes
  try {
    const res = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ where: {} })
    });
    if (res.ok) {
      const data = await res.json();
      const chats = Array.isArray(data) ? data : (data.chats || data.records || []);
      for (const chat of chats) {
        const jid = chat.id || chat.remoteJid || '';
        if (jid.includes(lidNumerico.substring(0, 8))) {
          const tel = (chat.phoneNumber || chat.number || '').replace(/\D/g, '');
          if (tel && tel.length >= 10) {
            console.log(`✅ Estratégia 1 (findChats): ${lidJid} → ${tel}`);
            return tel;
          }
        }
      }
    }
  } catch (e) { console.warn('Estratégia 1 falhou:', e.message); }

  // Estratégia 2: buscar mensagens que vieram desse lid
  try {
    const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ where: { key: { remoteJid: lidJid } }, limit: 20 })
    });
    if (res.ok) {
      const data = await res.json();
      const msgs = Array.isArray(data) ? data : (data.messages?.records || data.messages || []);
      for (const m of msgs) {
        // remoteJidAlt pode conter o número real
        const alt = m.key?.remoteJidAlt || '';
        if (alt.includes('@s.whatsapp.net') || alt.includes('@c.us')) {
          const tel = alt.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
          if (tel && tel.length >= 10) {
            console.log(`✅ Estratégia 2 (findMessages remoteJidAlt): ${lidJid} → ${tel}`);
            return tel;
          }
        }
        // participant pode ter o número real
        const part = m.key?.participant || '';
        if (part.includes('@s.whatsapp.net')) {
          const tel = part.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
          if (tel && tel.length >= 10) {
            console.log(`✅ Estratégia 2 (participant): ${lidJid} → ${tel}`);
            return tel;
          }
        }
      }
    }
  } catch (e) { console.warn('Estratégia 2 falhou:', e.message); }

  // Estratégia 3: buscar contatos e tentar match por ID lid
  try {
    const res = await fetch(`${evolutionUrl}/chat/findContacts/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ where: {} })
    });
    if (res.ok) {
      const data = await res.json();
      const contatos = Array.isArray(data) ? data : (data.contacts || data.records || []);
      for (const c of contatos) {
        const cId = (c.id || c.remoteJid || '').toLowerCase();
        if (cId.includes(lidNumerico.substring(0, 10))) {
          const telDireto = (c.number || c.phone || c.phoneNumber || '').replace(/\D/g, '');
          if (telDireto && telDireto.length >= 10) {
            console.log(`✅ Estratégia 3 (findContacts match): ${lidJid} → ${telDireto}`);
            return telDireto;
          }
          const jidReal = c.remoteJid || c.jid || '';
          if (jidReal.includes('@s.whatsapp.net')) {
            const tel = jidReal.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
            if (tel && tel.length >= 10) {
              console.log(`✅ Estratégia 3 (findContacts jid): ${lidJid} → ${tel}`);
              return tel;
            }
          }
        }
      }
    }
  } catch (e) { console.warn('Estratégia 3 falhou:', e.message); }

  // Estratégia 4: buscar nos logs de mensagens recebidas (webhook) pelo nome do contato
  return null;
}

async function normalizarTelefone(tel) {
  const t = tel.replace(/\D/g, '');
  // Adicionar 9 se BR sem 9º dígito
  if (t.startsWith('55') && t.length === 12) {
    return t.slice(0, 4) + '9' + t.slice(4);
  }
  return t;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const JD_ID = '699696c2c9f5bffc2e67402b';

    // Buscar configurações Evolution
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    if (!empresa?.evolution_url || !empresa?.evolution_api_key) {
      return Response.json({ error: 'Configuração Evolution não encontrada' }, { status: 400 });
    }
    const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    // Body pode ter overrides manuais: { overrides: { "lid_xxx": "telefone_real" } }
    let overrides = {};
    try {
      const body = await req.json();
      overrides = body?.overrides || {};
    } catch (_) {}

    // Buscar todas as conversas com telefone lid_
    const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: JD_ID }, '-created_date', 500
    );
    const conversasLid = todasConversas.filter(c => c.cliente_telefone?.startsWith('lid_'));

    console.log(`🔍 Encontradas ${conversasLid.length} conversas com lid_`);

    const resultados = [];

    for (const conversa of conversasLid) {
      const lidNumerico = conversa.cliente_telefone.replace('lid_', '').replace(/\D/g, '');
      const lidKey = conversa.cliente_telefone; // ex: lid_15578500694049

      console.log(`\n📋 Processando: ${lidKey} | nome: ${conversa.cliente_nome}`);

      let telefoneReal = null;

      // Verificar override manual primeiro
      if (overrides[lidKey]) {
        telefoneReal = overrides[lidKey].replace(/\D/g, '');
        console.log(`📌 Override manual: ${lidKey} → ${telefoneReal}`);
      } else {
        // Tentar resolver via Evolution API
        telefoneReal = await resolverLidReal(lidNumerico, evolutionUrl, evolutionKey, instanceName);
      }

      if (!telefoneReal || telefoneReal.length < 10) {
        // Não conseguiu resolver — excluir a conversa falsa
        const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ conversa_id: conversa.id });
        for (const msg of mensagens) {
          await base44.asServiceRole.entities.MensagemWhatsapp.delete(msg.id);
        }
        try { await base44.asServiceRole.entities.ConversaWhatsapp.delete(conversa.id); } catch (_) {}
        console.log(`🗑️ Excluída conversa não resolvível: ${lidKey} (${mensagens.length} mensagens)`);
        resultados.push({ lid: lidKey, acao: 'excluida', motivo: 'nao_resolvivel' });
        continue;
      }

      const telefoneNormalizado = await normalizarTelefone(telefoneReal);

      // Variações do telefone (com/sem 9º dígito)
      const variacoes = [telefoneNormalizado];
      if (telefoneNormalizado.startsWith('55') && telefoneNormalizado.length === 13) {
        variacoes.push(telefoneNormalizado.slice(0, 4) + telefoneNormalizado.slice(5));
      } else if (telefoneNormalizado.startsWith('55') && telefoneNormalizado.length === 12) {
        variacoes.push(telefoneNormalizado.slice(0, 4) + '9' + telefoneNormalizado.slice(4));
      }

      // Buscar conversa real existente com esse telefone
      let conversaReal = null;
      for (const tel of variacoes) {
        const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
          { empresa_id: JD_ID, cliente_telefone: tel }
        );
        // Filtrar apenas conversas com telefone real (não lid_)
        const convReal = convs.find(c => !c.cliente_telefone?.startsWith('lid_') && c.id !== conversa.id);
        if (convReal) { conversaReal = convReal; break; }
      }

      // Buscar mensagens da conversa lid
      const mensagensLid = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { conversa_id: conversa.id }
      );

      if (conversaReal) {
        // Mover mensagens para a conversa real (sem duplicar por whatsapp_message_id)
        let migradas = 0;
        for (const msg of mensagensLid) {
          // Verificar se já existe mensagem com mesmo whatsapp_message_id na conversa real
          if (msg.whatsapp_message_id) {
            const dup = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
              { conversa_id: conversaReal.id, whatsapp_message_id: msg.whatsapp_message_id }
            );
            if (dup.length > 0) {
              await base44.asServiceRole.entities.MensagemWhatsapp.delete(msg.id);
              continue;
            }
          }
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
            conversa_id: conversaReal.id,
            empresa_id: JD_ID
          });
          migradas++;
        }
        // Excluir a conversa lid (mensagens já migradas)
        await base44.asServiceRole.entities.ConversaWhatsapp.delete(conversa.id);
        // Atualizar última mensagem na conversa real
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaReal.id, {
          ultima_mensagem: conversaReal.ultima_mensagem,
          data_ultima_mensagem: new Date().toISOString()
        });
        console.log(`✅ Migrado: ${lidKey} → conversa ${conversaReal.id} (${migradas} msgs migradas)`);
        resultados.push({ lid: lidKey, acao: 'migrado', telefone_real: telefoneNormalizado, conversa_destino: conversaReal.id, msgs_migradas: migradas });
      } else {
        // Não tem conversa real: atualizar a conversa lid com o telefone correto
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
          cliente_telefone: telefoneNormalizado,
          cliente_nome: conversa.cliente_nome || 'Cliente WhatsApp'
        });
        // Atualizar contato WhatsApp se existir com lid
        const contatosLid = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
          { empresa_id: JD_ID, telefone: conversa.cliente_telefone }
        );
        for (const c of contatosLid) {
          await base44.asServiceRole.entities.ContatoWhatsapp.update(c.id, { telefone: telefoneNormalizado });
        }
        console.log(`✅ Corrigido: ${lidKey} → ${telefoneNormalizado} (conversa mantida com telefone correto)`);
        resultados.push({ lid: lidKey, acao: 'corrigido', telefone_real: telefoneNormalizado });
      }
    }

    return Response.json({
      success: true,
      total_lid: conversasLid.length,
      resultados
    });

  } catch (e) {
    console.error('Erro:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
// Sincroniza TODOS os chats da Evolution para o CRM
// Cria as conversas que existem na Evolution mas não estão no banco
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function validarTelefone(num) {
  if (!num) return false;
  const n = num.replace(/\D/g, '');
  if (!n.startsWith('55')) return false;
  if (n.length !== 12 && n.length !== 13) return false;
  if (/^(\d)\1{9,}$/.test(n)) return false;
  return true;
}

function normalizarTelefone(num) {
  const n = num.replace(/\D/g, '');
  // Sempre preferir com 9º dígito para celular BR
  if (n.startsWith('55') && n.length === 12) {
    return n.slice(0, 4) + '9' + n.slice(4);
  }
  return n;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];

    if (!empresa?.evolution_url || !empresa?.evolution_api_key || !empresa?.evolution_instance_name) {
      return Response.json({ erro: 'Configuração Evolution incompleta' }, { status: 400 });
    }

    const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    // 1. Buscar todos os chats da Evolution
    console.log('📋 Buscando todos os chats da Evolution...');
    const resChats = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {} })
    });

    if (!resChats.ok) {
      return Response.json({ erro: `Evolution retornou ${resChats.status}: ${await resChats.text()}` }, { status: 500 });
    }

    const dataChats = await resChats.json();
    const chats = Array.isArray(dataChats) ? dataChats : (dataChats.chats || dataChats.records || []);
    console.log(`📦 ${chats.length} chats encontrados na Evolution`);

    // 2. Buscar conversas já existentes no banco
    const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: JD_ID }, '-data_ultima_mensagem', 1000
    );
    const telefonesExistentes = new Set(conversasExistentes.map(c => c.cliente_telefone).filter(Boolean));
    console.log(`🗃️ ${telefonesExistentes.size} conversas já no banco`);

    let criadas = 0;
    let ignoradas = 0;
    let invalidas = 0;

    for (const chat of chats) {
      const jid = chat.id || chat.remoteJid || '';

      // Ignorar grupos e broadcasts
      if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@lid')) {
        ignoradas++;
        continue;
      }

      // Extrair telefone do JID
      const telBruto = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');

      if (!validarTelefone(telBruto)) {
        invalidas++;
        continue;
      }

      const telefone = normalizarTelefone(telBruto);
      // Variações para checar duplicata
      const variacoes = [telefone];
      if (telefone.startsWith('55') && telefone.length === 13) {
        variacoes.push(telefone.slice(0, 4) + telefone.slice(5));
      }

      // Verificar se já existe no banco (qualquer variação)
      const jaExiste = variacoes.some(v => telefonesExistentes.has(v));
      if (jaExiste) {
        ignoradas++;
        continue;
      }

      // Buscar última mensagem do chat
      let ultimaMensagem = chat.lastMessage?.conversation || chat.lastMessage?.extendedTextMessage?.text || '';
      if (!ultimaMensagem && chat.lastMessage?.imageMessage) ultimaMensagem = 'Imagem';
      if (!ultimaMensagem && (chat.lastMessage?.audioMessage || chat.lastMessage?.pttMessage)) ultimaMensagem = 'Áudio';
      if (!ultimaMensagem && chat.lastMessage?.documentMessage) ultimaMensagem = 'Documento';

      const dataUltima = chat.lastMessageTimestamp
        ? new Date(chat.lastMessageTimestamp * 1000).toISOString()
        : (chat.updatedAt || new Date().toISOString());

      const nome = chat.name || chat.pushName || telefone;

      // Criar conversa no banco
      const novaConversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: JD_ID,
        cliente_nome: nome,
        cliente_telefone: telefone,
        whatsapp_id: jid,
        status: 'ativa',
        ultima_mensagem: ultimaMensagem.substring(0, 200),
        data_ultima_mensagem: dataUltima,
        tipo_conexao: 'empresa',
        instancia: instanceName
      });

      telefonesExistentes.add(telefone);
      criadas++;
      console.log(`✅ Conversa criada: ${telefone} (${nome}) → ${novaConversa.id}`);
    }

    console.log(`📊 Resultado: ${criadas} criadas, ${ignoradas} já existiam, ${invalidas} inválidas`);

    // 3. Agora sincronizar mensagens recentes para as conversas criadas (últimas 24h)
    if (criadas > 0) {
      const agoSeconds = Math.floor((Date.now() - (24 * 60 * 60 * 1000)) / 1000);

      const resMsgs = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          where: { messageTimestamp: { $gte: agoSeconds } },
          limit: 500
        })
      });

      if (resMsgs.ok) {
        const dataMsgs = await resMsgs.json();
        const mensagens = Array.isArray(dataMsgs) ? dataMsgs : (dataMsgs.messages?.records || dataMsgs.messages || []);
        console.log(`📦 ${mensagens.length} mensagens recentes para sincronizar`);

        // Buscar conversas atualizadas
        const conversasAtualizadas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
          { empresa_id: JD_ID }, '-data_ultima_mensagem', 1000
        );
        const conversasPorTelefone = {};
        conversasAtualizadas.forEach(c => {
          if (c.cliente_telefone) conversasPorTelefone[c.cliente_telefone] = c;
        });

        let msgProcessadas = 0;
        for (const msg of mensagens) {
          const key = msg.key || {};
          const jid = key.remoteJid || '';
          if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@lid')) continue;
          const telBruto = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
          if (!validarTelefone(telBruto)) continue;
          const tel = normalizarTelefone(telBruto);
          const telSem9 = tel.startsWith('55') && tel.length === 13 ? tel.slice(0, 4) + tel.slice(5) : null;
          const conversa = conversasPorTelefone[tel] || (telSem9 ? conversasPorTelefone[telSem9] : null);
          if (!conversa) continue;

          const messageId = key.id;
          if (!messageId) continue;

          // Checar duplicata
          const exists = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ whatsapp_message_id: messageId });
          if (exists.length > 0) continue;

          const message = msg.message || {};
          let tipo = 'texto', conteudo = '';
          if (message.conversation) conteudo = message.conversation;
          else if (message.extendedTextMessage?.text) conteudo = message.extendedTextMessage.text;
          else if (message.imageMessage) { tipo = 'imagem'; conteudo = message.imageMessage.caption || 'Imagem'; }
          else if (message.audioMessage || message.pttMessage) { tipo = 'audio'; conteudo = 'Áudio'; }
          else if (message.videoMessage) { tipo = 'video'; conteudo = message.videoMessage.caption || 'Vídeo'; }
          else if (message.documentMessage) { tipo = 'pdf'; conteudo = message.documentMessage.title || 'Documento'; }
          else conteudo = JSON.stringify(message).substring(0, 100);

          const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString();

          await base44.asServiceRole.entities.MensagemWhatsapp.create({
            conversa_id: conversa.id,
            empresa_id: JD_ID,
            remetente: key.fromMe ? 'vendedor' : 'cliente',
            tipo_conteudo: tipo,
            texto: conteudo,
            whatsapp_message_id: messageId,
            data_envio: timestamp,
            status: key.fromMe ? 'enviada' : 'entregue'
          });
          msgProcessadas++;
        }
        console.log(`✅ ${msgProcessadas} mensagens recentes sincronizadas`);
      }
    }

    return Response.json({
      ok: true,
      total_chats_evolution: chats.length,
      conversas_criadas: criadas,
      ja_existiam: ignoradas,
      invalidas,
      mensagem: `${criadas} novas conversas criadas no CRM`
    });

  } catch (e) {
    console.error('❌ Erro:', e.message, e.stack);
    return Response.json({ erro: e.message }, { status: 500 });
  }
});
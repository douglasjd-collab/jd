import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EVOLUTION_URL = 'https://supabase-jdpromotora.0ntuaf.easypanel.host';
const EVOLUTION_KEY = '0D3F46E780A5-4909-B599-CA658DE252EB';
const INSTANCE = 'JDPROMOTORA';
const EMPRESA_ID = '699696c2c9f5bffc2e67402b';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    
    // Modo: buscar JID específico por nome do chat
    const nomeBusca = body.nome || '';
    const jidEspecifico = body.jid || '';

    // Buscar chats para encontrar o JID do Marquinho
    const chatsRes = await fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE}`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 2000 })
    });

    let chats = [];
    if (chatsRes.ok) {
      const d = await chatsRes.json();
      chats = Array.isArray(d) ? d : (d.chats || d.data || []);
    }

    // Filtrar por nome se fornecido
    let chatsAlvo = chats;
    if (nomeBusca) {
      const termo = nomeBusca.toLowerCase();
      chatsAlvo = chats.filter(c => {
        const nome = (c.pushName || c.name || '').toLowerCase();
        return nome.includes(termo);
      });
      console.log(`🔍 Chats com "${nomeBusca}": ${chatsAlvo.length}`);
      console.log(`🔍 Detalhes: ${JSON.stringify(chatsAlvo).substring(0, 1000)}`);
    } else if (jidEspecifico) {
      chatsAlvo = chats.filter(c => c.remoteJid === jidEspecifico || c.id === jidEspecifico);
      console.log(`🔍 Chat JID "${jidEspecifico}": ${chatsAlvo.length}`);
    }

    // Se não especificou filtro, processar últimas 8 horas
    let jidsParaProcessar = [];
    
    if (chatsAlvo.length > 0 && (nomeBusca || jidEspecifico)) {
      jidsParaProcessar = chatsAlvo.map(c => c.remoteJid || c.id).filter(Boolean);
    }

    let importadas = 0;
    let conversasCriadas = 0;
    const resultados = [];

    // Buscar mensagens para cada JID alvo OU geral
    for (const jidAlvo of (jidsParaProcessar.length > 0 ? jidsParaProcessar : ['__geral__'])) {
      let where = {};
      if (jidAlvo !== '__geral__') {
        where = { key: { remoteJid: jidAlvo } };
      } else {
        const agora = Math.floor(Date.now() / 1000);
        where = { messageTimestamp: { $gte: agora - (8 * 60 * 60) } };
      }

      const msgsRes = await fetch(`${EVOLUTION_URL}/chat/findMessages/${INSTANCE}`, {
        method: 'POST',
        headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ where, limit: 500 })
      });

      if (!msgsRes.ok) continue;
      const msgsData = await msgsRes.json();
      const msgs = Array.isArray(msgsData) ? msgsData : (msgsData.messages?.records || msgsData.messages || msgsData.data || []);

      console.log(`📨 JID ${jidAlvo}: ${msgs.length} mensagens`);

      // Agrupar por remoteJid
      const porJid = {};
      for (const m of msgs) {
        const jid = m.key?.remoteJid || '';
        if (!jid || jid.includes('@broadcast')) continue;
        if (!porJid[jid]) porJid[jid] = [];
        porJid[jid].push(m);
      }

      for (const [jid, mensagens] of Object.entries(porJid)) {
        let telefone = null;
        let nomeContato = 'Cliente';

        if (jid.includes('@lid')) {
          const lidNum = jid.replace(/@lid/g, '').replace(/\D/g, '');
          const cached = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
            { empresa_id: EMPRESA_ID, lid_jid: lidNum }, null, 1
          );
          if (cached.length > 0 && cached[0].telefone && !cached[0].telefone.startsWith('lid_')) {
            telefone = cached[0].telefone;
            nomeContato = cached[0].nome || nomeContato;
          } else {
            telefone = `lid_${lidNum}`;
            const comNomeRecebida = mensagens.find(m => !m.key?.fromMe && m.pushName);
            const comNomeQualquer = mensagens.find(m => m.pushName);
            // Também verificar nos chats pelo JID
            const chatInfo = chats.find(c => c.remoteJid === jid || c.id === jid);
            nomeContato = comNomeRecebida?.pushName || chatInfo?.pushName || chatInfo?.name || comNomeQualquer?.pushName || `Contato ${lidNum.substring(0, 8)}`;
          }
        } else if (jid.includes('@g.us')) {
          telefone = jid;
          const chatInfo = chats.find(c => c.remoteJid === jid || c.id === jid);
          const comNome = mensagens.find(m => m.pushName);
          nomeContato = chatInfo?.pushName || chatInfo?.name || comNome?.pushName || 'Grupo';
        } else {
          const num = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
          if (num.length >= 10) {
            let t = num;
            if (!t.startsWith('55') && (t.length === 10 || t.length === 11)) t = '55' + t;
            if (t.startsWith('55') && t.length === 13) t = t.slice(0, 4) + t.slice(5);
            telefone = t;
            const chatInfo = chats.find(c => c.remoteJid === jid || c.id === jid);
            const comNome = mensagens.find(m => m.pushName);
            nomeContato = chatInfo?.pushName || chatInfo?.name || comNome?.pushName || telefone;
          }
        }

        if (!telefone) continue;

        // Buscar ou criar conversa
        let conversa = null;
        const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
          { empresa_id: EMPRESA_ID, cliente_telefone: telefone }, '-data_ultima_mensagem', 1
        );

        if (convs.length > 0) {
          conversa = convs[0];
          // Atualizar nome se estava como "Douglas"
          if (conversa.cliente_nome === 'Douglas' && nomeContato !== 'Douglas') {
            await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
              cliente_nome: nomeContato
            });
          }
        } else {
          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: EMPRESA_ID,
            cliente_nome: nomeContato,
            cliente_telefone: telefone,
            whatsapp_id: jid,
            status: 'ativa',
            instancia: INSTANCE,
            tipo_conexao: 'empresa',
            colaborador_id: '',
            data_ultima_mensagem: new Date().toISOString(),
            ultima_mensagem: '(mensagem importada)',
            ultimo_remetente: 'cliente'
          });
          conversasCriadas++;
          console.log(`✅ Conversa criada: ${nomeContato} (${telefone})`);
        }

        // Importar mensagens com delay para evitar rate limit
        let msgCount = 0;
        for (const m of mensagens) {
          const msgId = m.key?.id;
          if (!msgId) continue;

          const existente = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
            { whatsapp_message_id: msgId }, null, 1
          );
          if (existente.length > 0) continue;

          const message = m.message || {};
          const fromMe = m.key?.fromMe === true;

          let tipo = 'texto', conteudo = '', arquivoUrl = '';
          if (message.conversation) conteudo = message.conversation;
          else if (message.extendedTextMessage?.text) conteudo = message.extendedTextMessage.text;
          else if (message.audioMessage || message.pttMessage) { tipo = 'audio'; conteudo = 'Áudio'; arquivoUrl = message.audioMessage?.url || message.pttMessage?.url || ''; }
          else if (message.imageMessage) { tipo = 'imagem'; conteudo = message.imageMessage.caption || 'Imagem'; arquivoUrl = message.imageMessage.url || ''; }
          else if (message.videoMessage) { tipo = 'video'; conteudo = message.videoMessage.caption || 'Vídeo'; arquivoUrl = message.videoMessage.url || ''; }
          else if (message.documentMessage) { tipo = 'pdf'; conteudo = message.documentMessage.fileName || 'Documento'; arquivoUrl = message.documentMessage.url || ''; }
          else if (message.reactionMessage || message.senderKeyDistributionMessage || message.protocolMessage) continue;
          else { conteudo = '(mensagem)'; }

          const ts = m.messageTimestamp || Math.floor(Date.now() / 1000);
          await base44.asServiceRole.entities.MensagemWhatsapp.create({
            conversa_id: conversa.id,
            empresa_id: EMPRESA_ID,
            remetente: fromMe ? 'vendedor' : 'cliente',
            tipo_conteudo: tipo,
            texto: conteudo,
            arquivo_url: arquivoUrl || null,
            whatsapp_message_id: msgId,
            data_envio: new Date(ts * 1000).toISOString(),
            status: fromMe ? 'enviada' : 'pendente'
          });
          importadas++;
          msgCount++;
          // Pequeno delay a cada 5 mensagens para evitar rate limit
          if (msgCount % 5 === 0) await new Promise(r => setTimeout(r, 200));
        }

        // Atualizar última mensagem
        const msgs_sorted = [...mensagens].sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0));
        const ultima = msgs_sorted[0];
        if (ultima) {
          const ultiMsg = ultima.message || {};
          let ultimoConteudo = '(mensagem)';
          if (ultiMsg.conversation) ultimoConteudo = ultiMsg.conversation;
          else if (ultiMsg.extendedTextMessage?.text) ultimoConteudo = ultiMsg.extendedTextMessage.text;
          else if (ultiMsg.audioMessage || ultiMsg.pttMessage) ultimoConteudo = 'Áudio';
          else if (ultiMsg.imageMessage) ultimoConteudo = 'Imagem';

          const ts = ultima.messageTimestamp || Math.floor(Date.now() / 1000);
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
            ultima_mensagem: ultimoConteudo.substring(0, 200),
            data_ultima_mensagem: new Date(ts * 1000).toISOString(),
            ultimo_remetente: ultima.key?.fromMe ? 'vendedor' : 'cliente'
          });
        }

        resultados.push({ jid, nome: nomeContato, telefone, msgs: mensagens.length, importadas: msgCount });
      }
    }

    return Response.json({
      success: true,
      conversas_criadas: conversasCriadas,
      mensagens_importadas: importadas,
      detalhes: resultados
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.substring(0, 500) }, { status: 500 });
  }
});
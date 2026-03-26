import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Importa o histórico de mensagens da Evolution para uma conversa específica.
 * Chamado automaticamente ao abrir uma conversa sem mensagens no banco.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversa_id, empresa_id } = await req.json();
    if (!conversa_id || !empresa_id) {
      return Response.json({ error: 'conversa_id e empresa_id obrigatórios' }, { status: 400 });
    }

    // Buscar dados da conversa
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({ id: conversa_id });
    const conversa = conversas?.[0];
    if (!conversa) return Response.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const telefone = (conversa.cliente_telefone || '').replace(/\D/g, '');
    if (!telefone) return Response.json({ error: 'Conversa sem telefone' }, { status: 400 });

    // Buscar config da empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key) {
      return Response.json({ error: 'Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Montar variações do número (com e sem 9º dígito)
    const variacoes = [telefone];
    if (telefone.startsWith('55') && telefone.length === 12) {
      variacoes.push(telefone.slice(0, 4) + '9' + telefone.slice(4));
    } else if (telefone.startsWith('55') && telefone.length === 13) {
      variacoes.push(telefone.slice(0, 4) + telefone.slice(5));
    }

    console.log(`📞 Importando mensagens para conversa ${conversa_id} | telefone: ${telefone} | variações: ${variacoes.join(', ')}`);

    // Buscar mensagens da Evolution para todas as variações do número
    let todasMensagens = [];
    for (const tel of variacoes) {
      const remoteJid = `${tel}@s.whatsapp.net`;
      try {
        const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ where: { key: { remoteJid } }, limit: 2000 })
        });

        if (!res.ok) {
          console.warn(`⚠️ Evolution retornou ${res.status} para ${remoteJid}`);
          continue;
        }

        const data = await res.json();
        const msgs = Array.isArray(data) ? data : (data.messages?.records || data.messages || []);
        console.log(`📦 ${msgs.length} mensagens para ${remoteJid}`);
        todasMensagens = [...todasMensagens, ...msgs];
      } catch (e) {
        console.warn(`⚠️ Erro Evolution para ${remoteJid}: ${e.message}`);
      }
    }

    if (todasMensagens.length === 0) {
      console.log(`ℹ️ Nenhuma mensagem na Evolution para este número`);
      return Response.json({ ok: true, processadas: 0, mensagem: 'Nenhuma mensagem encontrada na Evolution' });
    }

    // Deduplicar pelo messageId
    const vistos = new Set();
    todasMensagens = todasMensagens.filter(m => {
      const id = m.key?.id;
      if (!id || vistos.has(id)) return false;
      vistos.add(id);
      return true;
    });

    // Buscar mensagens já existentes no banco (para não duplicar)
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { conversa_id },
      'data_envio',
      5000
    );
    const idsExistentes = new Set(existentes.map(m => m.whatsapp_message_id).filter(Boolean));
    console.log(`🗃️ ${idsExistentes.size} mensagens já existem no banco para esta conversa`);

    // Verificar também por conversa alternativa (caso mensagens estejam em conversa duplicada)
    // Buscar TODAS as conversas do mesmo telefone para consolidar
    let mensagensDeOutrasConversas = [];
    for (const tel of variacoes) {
      const outrasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id, cliente_telefone: tel }
      );
      for (const outra of outrasConversas) {
        if (outra.id === conversa_id) continue;
        console.log(`🔀 Encontrou conversa alternativa ${outra.id} para ${tel} — migrando mensagens`);
        const msgsOutra = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: outra.id },
          'data_envio',
          5000
        );
        for (const msg of msgsOutra) {
          // Migrar para a conversa correta se ainda não existe
          if (!idsExistentes.has(msg.whatsapp_message_id || '')) {
            // Acumular IDs para migrar em lote depois
            idsExistentes.add(msg.whatsapp_message_id || msg.id);
            mensagensDeOutrasConversas.push(msg.id);
          }
        }
      }
    }

    // Migrar mensagens de duplicatas em lote
    const MIGRATE_BATCH = 50;
    if (mensagensDeOutrasConversas.length > 0) {
      for (let i = 0; i < mensagensDeOutrasConversas.length; i += MIGRATE_BATCH) {
        const lote = mensagensDeOutrasConversas.slice(i, i + MIGRATE_BATCH);
        await Promise.all(lote.map(id => base44.asServiceRole.entities.MensagemWhatsapp.update(id, { conversa_id })));
      }
      console.log(`🔀 Migradas ${mensagensDeOutrasConversas.length} mensagens de conversas duplicadas`);
    }

    // Ordenar cronologicamente
    todasMensagens.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    let ignoradas = 0;
    const novasMensagens = [];

    for (const msg of todasMensagens) {
      const key = msg.key || {};
      const message = msg.message || {};
      const messageId = key.id;
      const fromMe = key.fromMe === true;

      if (!messageId) { ignoradas++; continue; }
      if (idsExistentes.has(messageId)) { ignoradas++; continue; }

      // Extrair tipo e conteúdo
      let tipo = 'texto';
      let conteudo = '';
      let arquivoNome = null;

      if (message.conversation) {
        conteudo = message.conversation;
      } else if (message.extendedTextMessage?.text) {
        conteudo = message.extendedTextMessage.text;
      } else if (message.imageMessage) {
        tipo = 'imagem';
        conteudo = message.imageMessage.caption || 'Imagem';
      } else if (message.audioMessage || message.pttMessage) {
        tipo = 'audio';
        conteudo = 'Áudio';
      } else if (message.videoMessage) {
        tipo = 'video';
        conteudo = message.videoMessage.caption || 'Vídeo';
      } else if (message.documentMessage) {
        tipo = 'pdf';
        conteudo = message.documentMessage.title || 'Documento';
        arquivoNome = message.documentMessage.fileName || null;
      } else if (message.stickerMessage) {
        tipo = 'imagem';
        conteudo = '🎭 Sticker';
      } else if (message.reactionMessage) {
        ignoradas++;
        continue; // Ignorar reações
      } else {
        conteudo = '[Mensagem não suportada]';
      }

      const timestamp = msg.messageTimestamp
        ? new Date(msg.messageTimestamp * 1000).toISOString()
        : new Date().toISOString();

      novasMensagens.push({
        conversa_id,
        empresa_id,
        remetente: fromMe ? 'vendedor' : 'cliente',
        tipo_conteudo: tipo,
        texto: conteudo,
        arquivo_nome: arquivoNome,
        whatsapp_message_id: messageId,
        data_envio: timestamp,
        status: fromMe ? 'enviada' : 'entregue'
      });

      idsExistentes.add(messageId);
    }

    // Inserir em lote (bulkCreate) — máx 100 por vez, sem delay
    const BATCH_SIZE = 100;
    let processadas = 0;
    for (let i = 0; i < novasMensagens.length; i += BATCH_SIZE) {
      const lote = novasMensagens.slice(i, i + BATCH_SIZE);
      await base44.asServiceRole.entities.MensagemWhatsapp.bulkCreate(lote);
      processadas += lote.length;
    }

    // Atualizar última mensagem da conversa se processamos algo
    if (processadas > 0 || mensagensDeOutrasConversas.length > 0) {
      const ultima = todasMensagens[todasMensagens.length - 1];
      if (ultima) {
        const m = ultima.message || {};
        let textoUltima = m.conversation || m.extendedTextMessage?.text || '';
        if (!textoUltima) {
          if (m.imageMessage) textoUltima = 'Imagem';
          else if (m.audioMessage || m.pttMessage) textoUltima = 'Áudio';
          else if (m.videoMessage) textoUltima = 'Vídeo';
          else if (m.documentMessage) textoUltima = 'Documento';
        }
        const ts = ultima.messageTimestamp
          ? new Date(ultima.messageTimestamp * 1000).toISOString()
          : new Date().toISOString();

        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa_id, {
          ultima_mensagem: textoUltima.substring(0, 200),
          data_ultima_mensagem: ts
        });
      }
    }

    console.log(`✅ Resultado: ${processadas} novas | ${ignoradas} já existiam | ${mensagensDeOutrasConversas.length} migradas de duplicatas`);

    return Response.json({
      ok: true,
      processadas,
      ignoradas,
      migradas: mensagensDeOutrasConversas.length,
      mensagem: `${processadas} mensagens importadas, ${mensagensDeOutrasConversas.length} migradas de duplicatas`
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
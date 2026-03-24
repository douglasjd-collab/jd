import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const conversa_id = body.conversa_id;
    const empresa_id = body.empresa_id || '699696c2c9f5bffc2e67402b';

    if (!conversa_id) {
      return Response.json({ error: 'conversa_id obrigatório' }, { status: 400 });
    }

    // 1. Buscar conversa
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      id: conversa_id,
      empresa_id: empresa_id
    });

    if (!conversas || conversas.length === 0) {
      return Response.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    const conversa = conversas[0];
    const telefoneCliente = conversa.cliente_telefone.replace(/\D/g, '');
    console.log(`🔄 Sincronizando mensagens de: ${telefoneCliente}`);

    // 2. Buscar empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({
      id: empresa_id
    });

    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    // 3. Buscar mensagens do chat da Evolution API
    const chatResp = await fetch(
      `${evolutionUrl}/chat/findChats/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          where: {
            remoteJid: `${telefoneCliente}@s.whatsapp.net`
          }
        })
      }
    );

    if (!chatResp.ok) {
      console.error(`❌ Erro ao buscar chat: ${chatResp.status}`);
      return Response.json({ error: `Evolution API error: ${chatResp.status}` }, { status: 400 });
    }

    const chats = await chatResp.json();
    console.log(`💬 Chats encontrados: ${chats.length}`);

    if (!Array.isArray(chats) || chats.length === 0) {
      console.log(`⚠️ Nenhum chat encontrado para ${telefoneCliente}`);
      return Response.json({
        sucesso: false,
        erro: 'Nenhum chat encontrado neste número',
        telefone: telefoneCliente
      });
    }

    const chat = chats[0];
    const mensagensEvolution = chat.messages || [];
    console.log(`📨 Total de mensagens no chat: ${mensagensEvolution.length}`);

    // 4. Sincronizar mensagens RECEBIDAS (não fromMe)
    let novasMensagens = 0;
    const mensagensProcessadas = [];

    for (const msg of mensagensEvolution) {
      const key = msg.key || {};
      const fromMe = key.fromMe === true;
      
      // Pular mensagens enviadas por mim
      if (fromMe) continue;

      const messageId = key.id;
      const message = msg.message || {};
      let conteudo = '';

      if (message.conversation) {
        conteudo = message.conversation;
      } else if (message.extendedTextMessage?.text) {
        conteudo = message.extendedTextMessage.text;
      } else if (message.imageMessage) {
        conteudo = message.imageMessage.caption || 'Imagem';
      } else if (message.audioMessage || message.pttMessage) {
        conteudo = 'Áudio';
      } else if (message.videoMessage) {
        conteudo = message.videoMessage.caption || 'Vídeo';
      } else if (message.documentMessage) {
        conteudo = message.documentMessage.title || 'Documento';
      } else {
        continue; // Skip unknown types
      }

      // Verificar se mensagem já existe
      const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        whatsapp_message_id: messageId
      });

      if (existentes.length === 0) {
        // Criar mensagem
        const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: conversa_id,
          empresa_id: empresa_id,
          remetente: 'cliente',
          tipo_conteudo: 'texto',
          texto: conteudo,
          whatsapp_message_id: messageId,
          data_envio: new Date(msg.messageTimestamp * 1000).toISOString(),
          status: 'entregue'
        });

        novasMensagens++;
        mensagensProcessadas.push({
          id: novaMensagem.id,
          texto: conteudo.substring(0, 50)
        });

        console.log(`✅ Mensagem sincronizada: ${novaMensagem.id}`);
      }
    }

    // 5. Atualizar conversa
    if (novasMensagens > 0) {
      const ultimaMensagem = mensagensEvolution
        .filter(m => !m.key?.fromMe)
        .slice(-1)[0];
      
      if (ultimaMensagem) {
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa_id, {
          ultima_mensagem: (ultimaMensagem.message?.conversation || 'Mensagem recebida').substring(0, 200),
          data_ultima_mensagem: new Date(ultimaMensagem.messageTimestamp * 1000).toISOString()
        });
      }
    }

    return Response.json({
      sucesso: true,
      telefone: telefoneCliente,
      total_mensagens_evolution: mensagensEvolution.length,
      novas_mensagens_sincronizadas: novasMensagens,
      mensagens: mensagensProcessadas
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
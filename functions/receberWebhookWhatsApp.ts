import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.error('[WEBHOOK] 📨 Requisição:', req.method);
  
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge');
    if (challenge) return new Response(challenge);
    return new Response('OK');
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    console.error('[WEBHOOK] 📥 Parseando body...');
    const body = await req.json();
    console.error('[WEBHOOK] ✅ Body OK');
    const url = new URL(req.url);
    const instance = url.searchParams.get('instance');

    console.error('[WEBHOOK] 🔔 Event:', body.event, 'Instance:', instance);

    // Ignorar eventos de atualização de status (não são mensagens novas)
    if (body.event === 'messages.update') {
      console.log('⏭️ Ignorado: Evento messages.update (apenas atualização de status)');
      return Response.json({ success: true, skipped: 'status_update' });
    }

    // Ignorar mensagens enviadas pelo bot (fromMe: true) - apenas para messages.upsert
    if (body.event === 'messages.upsert' && body.data?.key?.fromMe === true) {
      console.log('⏭️ Ignorado: Mensagem enviada pelo bot, não pelo cliente');
      return Response.json({ success: true, skipped: 'from_bot' });
    }

    // Validar chave (você pode adicionar validação extra)
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

    // Processar diferentes formatos de webhook
    let message = null;
    let telefone = null;
    let tipo = null;
    let conteudo = null;

    // Formato 1: body.data.message (novo formato Evolution messages.upsert)
    if (body.event === 'messages.upsert' && body.data?.message) {
      message = body.data.message;
      // Para messages.upsert, o telefone está em body.data.key.remoteJid
      telefone = body.data.key?.remoteJid || message.from;
      
      // Detectar tipo pela presença de propriedades específicas
      if (message.conversation) {
        tipo = 'text';
        conteudo = message.conversation;
      } else if (message.imageMessage) {
        tipo = 'image';
        conteudo = message.imageMessage.caption || '';
      } else if (message.audioMessage) {
        tipo = 'audio';
        conteudo = 'Áudio';
      } else if (message.videoMessage) {
        tipo = 'video';
        conteudo = message.videoMessage.caption || 'Vídeo';
      } else if (message.documentMessage) {
        tipo = 'document';
        conteudo = message.documentMessage.title || 'Documento';
      } else if (message.stickerMessage) {
        tipo = 'sticker';
        conteudo = 'Sticker';
      } else if (message.text) {
        tipo = 'text';
        conteudo = message.text;
      } else {
        tipo = 'text';
        conteudo = '';
      }
      
      console.log('✓ Formato 1 detectado (messages.upsert)');
    }
    // Formato 2: body.messages (webhook direto)
    else if (body.messages && body.messages.length > 0) {
      message = body.messages[0];
      telefone = message.from || message.sender;
      tipo = message.type;
      conteudo = message.body || message.text;
      console.log('✓ Formato 2 detectado (body.messages)');
    }
    // Formato 3: propriedades diretas
    else if (body.from && body.type) {
      message = body;
      telefone = body.from;
      tipo = body.type;
      conteudo = body.body || body.text;
      console.log('✓ Formato 3 detectado (propriedades diretas)');
    }

    if (!message) {
      console.warn('⚠️ Nenhum formato de mensagem reconhecido. Event:', body.event, 'Body:', JSON.stringify(body).substring(0, 300));
      return Response.json({ success: true, skipped: 'unknown_format' });
    }

    if (message && telefone && tipo !== undefined) {
      const base44 = createClientFromRequest(req);

      console.error('[WEBHOOK] Telefone bruto:', telefone);
      const telefoneLimpo = String(telefone).replace(/\D/g, '');
      console.error('[WEBHOOK] Telefone limpo:', telefoneLimpo, '| Tipo:', tipo);

      console.error('[WEBHOOK] Buscando conversa...');
      let conversas = [];
      try {
        conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          cliente_telefone: telefoneLimpo
        });
        console.error('[WEBHOOK] Conversas encontradas:', conversas.length);
      } catch (filterErr) {
        console.error('[WEBHOOK] ❌ Erro filter:', filterErr.message);
        conversas = [];
      }

      let conversa;
      if (conversas.length === 0) {
        console.error('[WEBHOOK] Criando nova conversa...');
        let empresaId = body.empresa_id;
        if (!empresaId) {
          try {
            const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
            empresaId = empresas && empresas.length > 0 ? empresas[0].id : null;
            console.error('[WEBHOOK] Empresa:', empresaId);
          } catch (empErr) {
            console.error('[WEBHOOK] Erro Empresa:', empErr.message);
            empresaId = null;
          }
        }

        if (!empresaId) {
          console.error('[WEBHOOK] ERRO: Sem empresa!');
          return Response.json({ success: false, error: 'Sem empresa' }, { status: 400 });
        }

        try {
          const dadosConversa = {
            empresa_id: empresaId,
            cliente_id: '',
            cliente_nome: body.data?.pushName || 'Cliente',
            cliente_telefone: telefoneLimpo,
            whatsapp_id: body.data?.key?.id || 'wid_' + Date.now(),
            status: 'ativa',
            ultima_mensagem: conteudo || tipo,
            data_ultima_mensagem: new Date().toISOString()
          };
          console.error('[WEBHOOK] Dados conversa:', JSON.stringify(dadosConversa));
          
          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create(dadosConversa);
          console.error('[WEBHOOK] ✅ Conversa criada:', conversa.id);
        } catch (err) {
          console.error('[WEBHOOK] ❌ Erro conversa:', err.message, err);
          throw err;
        }
      } else {
        conversa = conversas[0];
        console.error('[WEBHOOK] Conversa existente:', conversa.id);
        try {
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
            ultima_mensagem: conteudo || tipo,
            data_ultima_mensagem: new Date().toISOString()
          });
        } catch (upErr) {
          console.error('[WEBHOOK] Erro update:', upErr.message);
        }
      }

      // Criar registro de mensagem
      let tipo_conteudo = 'texto';
      if (tipo === 'image') tipo_conteudo = 'imagem';
      if (tipo === 'audio') tipo_conteudo = 'audio';
      if (tipo === 'video') tipo_conteudo = 'video';
      if (tipo === 'document') tipo_conteudo = 'pdf';

      const dadosMensagem = {
        conversa_id: conversa.id,
        empresa_id: conversa.empresa_id,
        remetente: 'cliente',
        tipo_conteudo,
        texto: conteudo || '',
        arquivo_url: message.media?.url || '',
        arquivo_nome: message.media?.name || '',
        arquivo_tamanho: message.media?.size || 0,
        whatsapp_message_id: message.id || 'msg_' + Date.now(),
        data_envio: new Date().toISOString(),
        status: 'entregue'
      };
      
      console.error('[WEBHOOK] 💬 Mensagem:', JSON.stringify(dadosMensagem));
      
      try {
        const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create(dadosMensagem);
        console.error('[WEBHOOK] ✅ Mensagem criada:', novaMensagem.id);
      } catch (msgErr) {
        console.error('[WEBHOOK] ❌ Erro mensagem:', msgErr.message, msgErr);
        throw msgErr;
      }
    }

    console.error('[WEBHOOK] ✨ Sucesso!');
    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ ERRO CRÍTICO no webhook:', error);
    console.error('Stack:', error.stack);
    return Response.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});
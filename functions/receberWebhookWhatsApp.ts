import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.log('='.repeat(100));
  console.log(`🔔 WEBHOOK RECEBIDO - ${timestamp}`);
  console.log('='.repeat(100));
  
  // Suporte a GET (verificação/challenge)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge');
    console.log('✅ GET request - Challenge:', challenge);
    return new Response(challenge || 'OK', { status: 200 });
  }

  // Só aceitar POST
  if (req.method !== 'POST') {
    console.log('❌ Método não permitido:', req.method);
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Ler body
    const bodyText = await req.text();
    console.log('📥 Body recebido (length):', bodyText.length);
    console.log('📥 Body raw:', bodyText.substring(0, 500));
    
    const body = JSON.parse(bodyText);
    console.log('✅ JSON parseado');
    console.log('📋 Event type:', body.event);

    // Ignorar eventos não relevantes
    if (body.event === 'messages.update') {
      console.log('⏭️ Ignorado: messages.update');
      return Response.json({ success: true, skipped: 'status_update' });
    }

    // Aceitar tanto 'messages.upsert' quanto 'MESSAGES_UPSERT'
    const isMessageUpsert = body.event === 'messages.upsert' || body.event === 'MESSAGES_UPSERT';
    
    if (isMessageUpsert && body.data?.key?.fromMe === true) {
      console.log('⏭️ Ignorado: Mensagem do bot');
      return Response.json({ success: true, skipped: 'from_bot' });
    }

    if (!isMessageUpsert) {
      console.log('⚠️ Evento não suportado:', body.event);
      return Response.json({ success: true, skipped: 'unknown_event' });
    }

    // Processar mensagem
    console.log('💬 Processando mensagem...');
    console.log('📋 Body completo:', JSON.stringify(body, null, 2).substring(0, 1000));
    
    const message = body.data?.message;
    const key = body.data?.key;
    const pushName = body.data?.pushName || body.data?.senderName || 'Cliente';
    
    console.log('📨 Message:', message ? 'OK' : 'FALTANDO');
    console.log('🔑 Key:', key ? 'OK' : 'FALTANDO');
    console.log('👤 PushName:', pushName);
    
    if (!message || !key) {
      console.log('❌ Dados inválidos - message:', !!message, 'key:', !!key);
      console.log('📋 Body.data:', body.data);
      return Response.json({ success: false, error: 'Invalid data', recebido: { message: !!message, key: !!key } }, { status: 400 });
    }

    const telefone = key.remoteJid;
    const messageId = key.id;
    
    console.log('📞 Telefone:', telefone);
    console.log('🆔 Message ID:', messageId);
    console.log('👤 Nome:', pushName);

    // Determinar tipo e conteúdo
    let tipo = 'texto';
    let conteudo = '';
    
    if (message.conversation) {
      conteudo = message.conversation;
    } else if (message.extendedTextMessage?.text) {
      conteudo = message.extendedTextMessage.text;
    } else if (message.imageMessage) {
      tipo = 'imagem';
      conteudo = message.imageMessage.caption || 'Imagem';
    } else if (message.audioMessage) {
      tipo = 'audio';
      conteudo = 'Áudio';
    } else if (message.videoMessage) {
      tipo = 'video';
      conteudo = message.videoMessage.caption || 'Vídeo';
    } else if (message.documentMessage) {
      tipo = 'pdf';
      conteudo = message.documentMessage.title || 'Documento';
    } else {
      conteudo = 'Mensagem não suportada';
    }

    console.log('📝 Tipo:', tipo);
    console.log('📝 Conteúdo:', conteudo);

    // Limpar telefone
    const telefoneLimpo = String(telefone).replace(/\D/g, '');
    console.log('📱 Telefone limpo:', telefoneLimpo);

    // SDK
    const base44 = createClientFromRequest(req);
    
    // Buscar TODAS as empresas ativas
    console.log('🏢 Buscando empresas...');
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    console.log('🏢 Empresas encontradas:', empresas.length);
    
    if (!empresas || empresas.length === 0) {
      console.log('❌ Nenhuma empresa ativa');
      return Response.json({ success: false, error: 'No company' }, { status: 400 });
    }
    
    const empresaId = empresas[0].id;
    console.log('✅ Empresa ID:', empresaId);

    // Verificar se JÁ EXISTE esta mensagem (evitar duplicatas)
    console.log('🔍 Verificando duplicatas...');
    const mensagensExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      whatsapp_message_id: messageId
    });
    
    if (mensagensExistentes.length > 0) {
      console.log('⏭️ Mensagem já existe, ignorando duplicata');
      return Response.json({ success: true, skipped: 'duplicate' });
    }

    // Buscar ou criar conversa
    console.log('💬 Buscando conversa...');
    let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefoneLimpo
    });
    console.log('💬 Conversas encontradas:', conversas.length);

    let conversa;
    if (conversas.length === 0) {
      console.log('➕ Criando nova conversa...');
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: '',
        cliente_nome: pushName,
        cliente_telefone: telefoneLimpo,
        whatsapp_id: messageId,
        status: 'ativa',
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString()
      });
      console.log('✅ Conversa criada:', conversa.id);
    } else {
      conversa = conversas[0];
      console.log('✅ Conversa existente:', conversa.id);
      
      // Atualizar última mensagem
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        status: 'ativa'
      });
      console.log('✅ Conversa atualizada');
    }

    // CRIAR MENSAGEM
    console.log('💾 Criando mensagem...');
    const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'cliente',
      tipo_conteudo: tipo,
      texto: conteudo,
      whatsapp_message_id: messageId,
      data_envio: new Date().toISOString(),
      status: 'entregue'
    });

    console.log('='.repeat(100));
    console.log('✅ MENSAGEM SALVA COM SUCESSO!');
    console.log('ID:', novaMensagem.id);
    console.log('Conversa ID:', novaMensagem.conversa_id);
    console.log('Texto:', novaMensagem.texto);
    console.log('Tipo:', novaMensagem.tipo_conteudo);
    console.log('='.repeat(100));

    return Response.json({
      success: true,
      message_id: novaMensagem.id,
      conversa_id: conversa.id,
      telefone: telefoneLimpo,
      timestamp: timestamp
    });

  } catch (error) {
    console.log('='.repeat(100));
    console.log('❌ ERRO CRÍTICO');
    console.log('Mensagem:', error.message);
    console.log('Stack:', error.stack);
    console.log('='.repeat(100));
    
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
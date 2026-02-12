import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.log('='.repeat(100));
  console.log(`🔔 WEBHOOK RECEBIDO - ${timestamp}`);
  console.log('='.repeat(100));
  console.log('Método:', req.method);
  console.log('URL completa:', req.url);
  console.log('Headers:', JSON.stringify({
    'content-type': req.headers.get('content-type'),
    'user-agent': req.headers.get('user-agent')
  }));
  
  // Extrair nome da instância da URL
  const url = new URL(req.url);
  const instanceName = url.searchParams.get('instance');
  console.log('Instance Name extraído da URL:', instanceName);
  
  // Suporte a GET (verificação/challenge)
  if (req.method === 'GET') {
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
    // Ler e parsear body
    console.log('📥 Lendo body da requisição...');
    const bodyText = await req.text();
    console.log('Body length:', bodyText.length, 'bytes');
    console.log('Body raw (primeiros 1000 chars):', bodyText.substring(0, 1000));
    
    const body = JSON.parse(bodyText);
    console.log('✅ JSON parseado com sucesso');
    console.log('Event type:', body.event);
    console.log('Body completo:', JSON.stringify(body, null, 2));

    // Ignorar eventos não relevantes
    if (body.event === 'messages.update') {
      console.log('⏭️ Ignorado: messages.update (apenas status)');
      return Response.json({ success: true, skipped: 'status_update' });
    }

    if (body.event === 'messages.upsert' && body.data?.key?.fromMe === true) {
      console.log('⏭️ Ignorado: Mensagem enviada pelo bot');
      return Response.json({ success: true, skipped: 'from_bot' });
    }

    // Processar mensagem
    if (body.event !== 'messages.upsert') {
      console.log('⚠️ Evento não reconhecido:', body.event);
      return Response.json({ success: true, skipped: 'unknown_event' });
    }

    console.log('💬 Processando mensagem...');
    
    // Extrair dados da mensagem
    const message = body.data?.message;
    const key = body.data?.key;
    const pushName = body.data?.pushName || 'Cliente';
    
    if (!message || !key) {
      console.log('❌ Mensagem sem dados válidos');
      return Response.json({ success: false, error: 'Invalid message data' }, { status: 400 });
    }

    const telefone = key.remoteJid;
    const messageId = key.id;
    
    console.log('📞 Telefone:', telefone);
    console.log('📧 Message ID:', messageId);
    console.log('👤 Push Name:', pushName);

    // Determinar tipo e conteúdo
    let tipo = 'text';
    let conteudo = '';
    
    if (message.conversation) {
      tipo = 'text';
      conteudo = message.conversation;
    } else if (message.extendedTextMessage?.text) {
      tipo = 'text';
      conteudo = message.extendedTextMessage.text;
    } else if (message.imageMessage) {
      tipo = 'image';
      conteudo = message.imageMessage.caption || 'Imagem';
    } else if (message.audioMessage) {
      tipo = 'audio';
      conteudo = 'Áudio';
    } else if (message.videoMessage) {
      tipo = 'video';
      conteudo = message.videoMessage.caption || 'Vídeo';
    } else if (message.documentMessage) {
      tipo = 'document';
      conteudo = message.documentMessage.title || 'Documento';
    }

    console.log('Tipo:', tipo);
    console.log('Conteúdo:', conteudo);

    // Limpar telefone
    const telefoneLimpo = String(telefone).replace(/\D/g, '');
    console.log('Telefone limpo:', telefoneLimpo);

    // Inicializar SDK
    const base44 = createClientFromRequest(req);
    
    // Buscar empresa
    console.log('🏢 Buscando empresa...');
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    if (!empresas || empresas.length === 0) {
      console.log('❌ Nenhuma empresa ativa encontrada');
      return Response.json({ success: false, error: 'No active company' }, { status: 400 });
    }
    const empresaId = empresas[0].id;
    console.log('✅ Empresa ID:', empresaId);

    // Buscar ou criar conversa
    console.log('💬 Buscando conversa...');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      cliente_telefone: telefoneLimpo
    });

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
        ultima_mensagem: conteudo,
        data_ultima_mensagem: new Date().toISOString()
      });
      console.log('✅ Conversa criada:', conversa.id);
    } else {
      conversa = conversas[0];
      console.log('✅ Conversa existente:', conversa.id);
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: conteudo,
        data_ultima_mensagem: new Date().toISOString()
      });
    }

    // Criar mensagem
    console.log('💾 Salvando mensagem...');
    const tipoConteudo = tipo === 'image' ? 'imagem' : tipo === 'document' ? 'pdf' : tipo;
    
    const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'cliente',
      tipo_conteudo: tipoConteudo,
      texto: conteudo,
      whatsapp_message_id: messageId,
      data_envio: new Date().toISOString(),
      status: 'entregue'
    });

    console.log('='.repeat(100));
    console.log('✅ MENSAGEM SALVA COM SUCESSO!');
    console.log('ID da mensagem:', novaMensagem.id);
    console.log('Conversa ID:', novaMensagem.conversa_id);
    console.log('Texto:', novaMensagem.texto);
    console.log('='.repeat(100));

    return Response.json({
      success: true,
      message_id: novaMensagem.id,
      conversa_id: conversa.id,
      timestamp: timestamp
    });

  } catch (error) {
    console.log('='.repeat(100));
    console.log('❌ ERRO CRÍTICO');
    console.log('Timestamp:', timestamp);
    console.log('Mensagem:', error.message);
    console.log('Stack:', error.stack);
    console.log('='.repeat(100));
    
    return Response.json({
      success: false,
      error: error.message,
      timestamp: timestamp
    }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Webhook Oficial D-API - Endpoint Público
 * 
 * URL: POST /functions/webhookDapi
 * Full URL: https://app.jdpromotora.com.br/functions/webhookDapi
 * 
 * Eventos suportados:
 * - connection.status
 * - connection.qrcode
 * - messages.received
 * - messages.sent
 * - message.delivered
 * - message.read
 * - message.deleted
 * - contacts.upsert
 * - contacts.update
 * - chats.upsert
 * - chats.update
 * - logged_out
 */

Deno.serve(async (req) => {
  const startTime = Date.now();
  const webhookId = crypto.randomUUID();
  
  // Headers para diagnóstico
  const headers = Object.fromEntries(req.headers.entries());
  const ip = headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || 'unknown';
  const userAgent = headers['user-agent'] || 'unknown';
  
  console.log(`📬 [Webhook D-API] ${webhookId} - Recebido de ${ip}`);
  
  // Apenas POST é permitido
  if (req.method !== 'POST') {
    return Response.json({
      success: false,
      error: 'Method Not Allowed',
      webhookId,
      timestamp: new Date().toISOString()
    }, { status: 405 });
  }
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse do body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error(`❌ [Webhook D-API] ${webhookId} - Erro ao parse JSON:`, e.message);
      return Response.json({
        success: false,
        error: 'Invalid JSON',
        webhookId,
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }
    
    console.log(`📦 [Webhook D-API] ${webhookId} - Payload:`, JSON.stringify(body, null, 2));
    
    // Identificar tipo do evento
    const eventType = body.event || body.type || 'unknown';
    const sessionId = body.sessionId || body.session_id || body.sessionId || 'unknown';
    const timestamp = body.timestamp || body.createdAt || new Date().toISOString();
    
    console.log(`🏷️ [Webhook D-API] ${webhookId} - Evento: ${eventType}, Session: ${sessionId}`);
    
    // Buscar conexão pelo sessionId
    let connection = null;
    let connectionId = null;
    let empresaId = null;
    
    try {
      const connections = await base44.asServiceRole.entities.WhatsappConnection.filter({ 
        session_id: sessionId 
      });
      
      if (connections.length > 0) {
        connection = connections[0];
        connectionId = connection.id;
        empresaId = connection.empresa_id;
        console.log(`✅ [Webhook D-API] ${webhookId} - Conexão encontrada: ${connection.nome}`);
      } else {
        console.warn(`⚠️ [Webhook D-API] ${webhookId} - Conexão não encontrada para sessionId: ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ [Webhook D-API] ${webhookId} - Erro ao buscar conexão:`, error.message);
    }
    
    // Salvar log do webhook
    const logData = {
      empresa_id: empresaId || 'unknown',
      connection_id: connectionId,
      event_type: eventType,
      direction: 'inbound',
      payload_json: JSON.stringify({
        webhookId,
        event: eventType,
        sessionId,
        timestamp,
        body
      }),
      response_json: null,
      error_message: null,
      response_time_ms: Date.now() - startTime,
      created_at: new Date().toISOString()
    };
    
    // Processar evento específico
    let processResult = null;
    let errorMessage = null;
    
    try {
      processResult = await processEvent(base44, eventType, body, connection, empresaId);
      console.log(`✅ [Webhook D-API] ${webhookId} - Processado:`, processResult);
    } catch (error) {
      errorMessage = error.message;
      console.error(`❌ [Webhook D-API] ${webhookId} - Erro ao processar:`, error.message);
    }
    
    // Atualizar log com resultado
    logData.response_json = JSON.stringify({
      success: true,
      event: eventType,
      sessionId,
      processed: !!processResult,
      result: processResult,
      webhookId,
      timestamp: new Date().toISOString()
    });
    logData.error_message = errorMessage;
    
    // Salvar log (não bloquear resposta)
    base44.asServiceRole.entities.LogRecebimentoWebhook.create(logData).catch(e => {
      console.error(`❌ [Webhook D-API] ${webhookId} - Erro ao salvar log:`, e.message);
    });
    
    // Responder 200 OK imediatamente
    return Response.json({
      success: true,
      event: eventType,
      sessionId,
      webhookId,
      timestamp: new Date().toISOString(),
      processed: !!processResult
    });
    
  } catch (error) {
    console.error(`❌ [Webhook D-API] ${webhookId} - Erro geral:`, error.message);
    
    // Mesmo com erro, responder 200 para evitar retries da D-API
    return Response.json({
      success: false,
      error: error.message,
      webhookId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Mapear evento D-API para tipo no CRM
 */
function mapEventType(eventType) {
  const map = {
    'connection.status': 'session.status',
    'connection.qrcode': 'session.qr',
    'messages.received': 'message.received',
    'messages.sent': 'message.sent',
    'message.delivered': 'message.delivered',
    'message.read': 'message.read',
    'message.deleted': 'message.deleted',
    'contacts.upsert': 'contacts.upsert',
    'contacts.update': 'contacts.update',
    'chats.upsert': 'chats.upsert',
    'chats.update': 'chats.update',
    'logged_out': 'session.disconnected'
  };
  
  return map[eventType] || 'message.received';
}

/**
 * Processar evento específico
 */
async function processEvent(base44, eventType, body, connection, empresaId) {
  switch (eventType) {
    case 'connection.status':
      return await processConnectionStatus(base44, body, connection);
    
    case 'connection.qrcode':
      return await processConnectionQrCode(base44, body, connection);
    
    case 'messages.received':
      return await processMessageReceived(base44, body, connection, empresaId);
    
    case 'messages.sent':
      return await processMessageSent(base44, body, connection);
    
    case 'message.delivered':
      return await processMessageDelivered(base44, body, connection);
    
    case 'message.read':
      return await processMessageRead(base44, body, connection);
    
    case 'message.deleted':
      return await processMessageDeleted(base44, body, connection);
    
    case 'contacts.upsert':
    case 'contacts.update':
      return await processContactUpdate(base44, body, connection);
    
    case 'chats.upsert':
    case 'chats.update':
      return await processChatUpdate(base44, body, connection);
    
    case 'logged_out':
      return await processLoggedOut(base44, body, connection);
    
    default:
      console.log(`ℹ️ Evento não processado: ${eventType}`);
      return { handled: false, event: eventType };
  }
}

/**
 * Processar connection.status
 */
async function processConnectionStatus(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  const status = body.status || body.data?.status;
  const phoneNumber = body.authData?.phone || body.phone || body.phoneNumber;
  const profileName = body.profileName || body.profile_name;
  
  // Mapear status D-API para status CRM
  const statusMap = {
    'connected': 'conectado',
    'connecting': 'reiniciando',
    'disconnected': 'desconectado',
    'qr': 'aguardando_qr',
    'waiting_qr': 'aguardando_qr',
    'pending': 'aguardando_qr',
    'error': 'erro_recebimento',
    'failed': 'erro_recebimento'
  };
  
  const crmStatus = statusMap[status?.toLowerCase()] || 'desconectado';
  
  await base44.asServiceRole.entities.WhatsappConnection.update(connection.id, {
    status: crmStatus,
    phone_number: phoneNumber || connection.phone_number,
    profile_name: profileName || connection.profile_name,
    last_health_check_at: new Date().toISOString()
  });
  
  return { handled: true, status: crmStatus, phoneNumber };
}

/**
 * Processar connection.qrcode
 */
async function processConnectionQrCode(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  const qrCodeBase64 = body.qrCodeImage || body.qrCodeBase64 || body.qrCode;
  const qrCodeText = body.qrCode || body.text;
  
  // Atualizar QR Code na conexão (se necessário armazenar)
  // Normalmente o QR Code é buscado via GET /qr, não via webhook
  
  return { handled: true, hasQrCode: !!(qrCodeBase64 || qrCodeText) };
}

/**
 * Processar messages.received
 */
async function processMessageReceived(base44, body, connection, empresaId) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  const messageData = body.data || body.message || body;
  const externalMessageId = messageData.id || messageData.messageId || messageData.external_message_id;
  const from = messageData.from || messageData.sender || messageData.remoteJid;
  const to = messageData.to || messageData.receiver;
  const timestamp = messageData.timestamp || messageData.createdAt || new Date().toISOString();
  
  // Extrair conteúdo
  const messageType = messageData.messageType || messageData.type || 'text';
  const content = messageData.text || messageData.content || messageData.caption || '';
  const mediaUrl = messageData.mediaUrl || messageData.media_url || messageData.fileUrl;
  
  // Normalizar telefone (remover @s.whatsapp.net, etc)
  const fromPhone = from?.replace(/@[\w.]+/g, '') || '';
  
  console.log(`📨 [Webhook D-API] Mensagem recebida de ${fromPhone}: ${content.substring(0, 50)}`);
  
  // Localizar ou criar conversa
  let conversa = null;
  try {
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: fromPhone
    });
    
    if (conversas.length > 0) {
      conversa = conversas[0];
    } else {
      // Criar nova conversa
      const newConversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_telefone: fromPhone,
        cliente_nome: fromPhone,
        provider: 'whatsapp_dapi',
        canal_origem: 'dapi',
        tipo_conexao: 'empresa',
        status: 'ativa',
        ultima_mensagem: content.substring(0, 200),
        data_ultima_mensagem: new Date(timestamp).toISOString(),
        ultimo_remetente: 'cliente'
      });
      conversa = newConversa;
      console.log(`✅ [Webhook D-API] Conversa criada: ${conversa.id}`);
    }
  } catch (error) {
    console.error(`❌ [Webhook D-API] Erro ao buscar/criar conversa:`, error.message);
    return { handled: false, error: error.message };
  }
  
  // Criar mensagem
  const messageTypes = {
    'text': 'text',
    'image': 'image',
    'audio': 'audio',
    'voice': 'audio',
    'video': 'video',
    'document': 'document',
    'sticker': 'sticker',
    'contact': 'contact',
    'location': 'location'
  };
  
  const crmMessageType = messageTypes[messageType?.toLowerCase()] || 'text';
  
  const mensagemData = {
    empresa_id: empresaId,
    conversa_id: conversa.id,
    remetente: 'cliente',
    remetente_nome: fromPhone,
    tipo_conteudo: crmMessageType === 'text' ? 'texto' : 
                   crmMessageType === 'image' ? 'imagem' :
                   crmMessageType === 'audio' ? 'audio' :
                   crmMessageType === 'video' ? 'video' :
                   crmMessageType === 'document' ? 'documento' : 'texto',
    texto: crmMessageType === 'text' ? content : null,
    arquivo_url: mediaUrl,
    provider: 'whatsapp_dapi',
    whatsapp_message_id: externalMessageId,
    status: 'lida',
    data_envio: new Date(timestamp).toISOString()
  };
  
  await base44.asServiceRole.entities.MensagemWhatsapp.create(mensagemData);
  
  // Atualizar conversa
  await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
    ultima_mensagem: content.substring(0, 200),
    data_ultima_mensagem: new Date(timestamp).toISOString(),
    ultimo_remetente: 'cliente',
    last_inbound_provider: 'whatsapp_dapi'
  });
  
  return { 
    handled: true, 
    conversaId: conversa.id, 
    messageId: externalMessageId,
    fromPhone 
  };
}

/**
 * Processar messages.sent
 */
async function processMessageSent(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  const messageData = body.data || body.message || body;
  const externalMessageId = messageData.id || messageData.messageId;
  const to = messageData.to || messageData.receiver;
  const toPhone = to?.replace(/@[\w.]+/g, '') || '';
  
  // Buscar mensagem pelo external_message_id
  const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
    whatsapp_message_id: externalMessageId
  });
  
  if (mensagens.length > 0) {
    const msg = mensagens[0];
    await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
      status: 'enviada',
      entregue_em: new Date().toISOString()
    });
    
    return { handled: true, messageId: externalMessageId, status: 'enviada' };
  }
  
  return { handled: false, reason: 'mensagem não encontrada' };
}

/**
 * Processar message.delivered
 */
async function processMessageDelivered(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  const messageData = body.data || body.message || body;
  const externalMessageId = messageData.id || messageData.messageId;
  
  const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
    whatsapp_message_id: externalMessageId
  });
  
  if (mensagens.length > 0) {
    const msg = mensagens[0];
    await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
      status: 'entregue',
      entregue_em: new Date().toISOString()
    });
    
    return { handled: true, messageId: externalMessageId, status: 'entregue' };
  }
  
  return { handled: false, reason: 'mensagem não encontrada' };
}

/**
 * Processar message.read
 */
async function processMessageRead(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  const messageData = body.data || body.message || body;
  const externalMessageId = messageData.id || messageData.messageId;
  
  const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
    whatsapp_message_id: externalMessageId
  });
  
  if (mensagens.length > 0) {
    const msg = mensagens[0];
    await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
      status: 'lida',
      lida_em: new Date().toISOString()
    });
    
    return { handled: true, messageId: externalMessageId, status: 'lida' };
  }
  
  return { handled: false, reason: 'mensagem não encontrada' };
}

/**
 * Processar message.deleted
 */
async function processMessageDeleted(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  const messageData = body.data || body.message || body;
  const externalMessageId = messageData.id || messageData.messageId;
  
  const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
    whatsapp_message_id: externalMessageId
  });
  
  if (mensagens.length > 0) {
    const msg = mensagens[0];
    await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
      status: 'erro',
      download_erro: 'Mensagem excluída'
    });
    
    return { handled: true, messageId: externalMessageId, status: 'excluida' };
  }
  
  return { handled: false, reason: 'mensagem não encontrada' };
}

/**
 * Processar contacts.upsert / contacts.update
 */
async function processContactUpdate(base44, body, connection) {
  // Atualização de contato - pode ser implementado posteriormente
  return { handled: true, event: 'contact_update' };
}

/**
 * Processar chats.upsert / chats.update
 */
async function processChatUpdate(base44, body, connection) {
  // Atualização de chat - pode ser implementado posteriormente
  return { handled: true, event: 'chat_update' };
}

/**
 * Processar logged_out
 */
async function processLoggedOut(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };
  
  await base44.asServiceRole.entities.WhatsappConnection.update(connection.id, {
    status: 'desconectado',
    last_health_check_at: new Date().toISOString()
  });
  
  return { handled: true, status: 'desconectado' };
}
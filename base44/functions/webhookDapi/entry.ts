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
    
    // Salvar log (não bloquear resposta) — usa WhatsappConnectionLog, que é o schema correto para este payload
    base44.asServiceRole.entities.WhatsappConnectionLog.create(logData).catch(e => {
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
 *
 * Formato real do payload da D-API: { event, sessionId, timestamp, traceId, data }
 * onde data.from é um OBJETO ({ jid, name }), não uma string — por isso o telefone
 * deve ser extraído de data.from.jid (nunca tratar "from" como string).
 */
// Extrai texto/nome da mensagem citada (reply) quando o remetente respondeu citando outra mensagem.
// A D-API expõe o ContextInfo do Whatsmeow (mesmo formato usado no envio) — aceita camelCase e snake_case.
function extrairRespostaCitada(data) {
  const ctx = data?.contextInfo || data?.context_info || null;
  if (!ctx) return { texto: null, nome: null };
  const quotedMsg = ctx.quotedMessage || ctx.quoted_message || null;
  const texto = quotedMsg
    ? (quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || quotedMsg.text || null)
    : null;
  const participantJid = ctx.participant || ctx.participant_jid || '';
  const nome = ctx.participantName || ctx.participant_name || (participantJid ? String(participantJid).replace(/@.*/g, '') : null);
  return { texto: texto ? String(texto).substring(0, 200) : null, nome };
}

async function processMessageReceived(base44, body, connection, empresaId) {
  if (!connection) return { handled: false, reason: 'connection not found' };

  const data = body.data || body.message || body;
  const isFromMe = data?.fromMe === true || data?.key?.fromMe === true;

  if (data?.is_group === true || String(data?.from?.jid || '').includes('@g.us')) {
    return { handled: false, reason: 'mensagem de grupo' };
  }

  const externalMessageId = data.id || data?.key?.id || data.messageId || data.external_message_id;

  // Mensagem enviada pelo próprio número (fromMe): se já foi registrada pelo envio via CRM, ignorar (eco).
  // Se NÃO existir ainda, foi enviada direto pelo celular/WhatsApp — precisa ser salva no histórico.
  if (isFromMe) {
    if (externalMessageId) {
      const jaRegistrada = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        empresa_id: empresaId,
        whatsapp_message_id: externalMessageId
      }, '-created_date', 1);
      if (jaRegistrada && jaRegistrada.length > 0) {
        return { handled: false, reason: 'mensagem própria já registrada (enviada via CRM)' };
      }
    }
    return await processMessageSentFromPhone(base44, data, connection, empresaId, externalMessageId);
  }

  // O telefone vem em data.from.jid (objeto), não em data.from diretamente
  const remoteJid = data?.from?.jid || data?.key?.remoteJid || data?.chatId || data?.jid || '';
  const fromPhone = String(remoteJid).replace(/@.*/g, '').replace(/\D/g, '');
  const fromName = data?.from?.name || data?.from_name || data?.pushName || data?.notifyName || fromPhone;
  const timestamp = data.timestamp || data.createdAt || new Date().toISOString();

  if (!fromPhone) {
    console.error('❌ [Webhook D-API] Não foi possível extrair o telefone:', JSON.stringify(data, null, 2));
    return { handled: false, reason: 'telefone não encontrado' };
  }

  // Extrair conteúdo
  const messageType = data.type || 'text';
  let content = typeof data.message === 'string' ? data.message : (data.text || data.content || '');
  const mediaUrl = data.media_url || data.media_data?.url || data.mediaUrl || data.fileUrl || null;

  let crmMessageType;

  // Lista interativa (botões/opções) e respostas de lista/botão — monta um texto legível
  if (messageType === 'list' || messageType === 'list_response' || messageType === 'template_button_reply') {
    const listData = data?.data || {};
    const linhas = [];
    if (listData.title) linhas.push(`*${listData.title}*`);
    if (listData.description) linhas.push(listData.description);
    const opcoes = [];
    if (Array.isArray(listData.sections)) {
      listData.sections.forEach((sec) => {
        if (sec?.title) opcoes.push(`_${sec.title}_`);
        (sec?.rows || []).forEach((row) => {
          opcoes.push(`▸ ${row.title}${row.description ? ' - ' + row.description : ''}`);
        });
      });
    } else if (Array.isArray(listData.options)) {
      listData.options.forEach((opt) => opcoes.push(`▸ ${opt}`));
    }
    if (opcoes.length > 0) linhas.push(opcoes.join('\n'));
    if (listData.selected_title) linhas.push(`Selecionou: ${listData.selected_title}`);
    if (listData.selected_display_text) linhas.push(`Selecionou: ${listData.selected_display_text}`);
    if (listData.footer) linhas.push(listData.footer);
    content = linhas.filter(Boolean).join('\n\n') || content || 'Mensagem de lista/botões';
    crmMessageType = 'texto';
  } else if (messageType === 'contact') {
    // Compartilhamento de contato — monta o mesmo formato JSON que o front-end
    // já sabe renderizar como cartão de contato
    const cd = data?.data || {};
    content = JSON.stringify({
      contactMessage: {
        displayName: cd.display_name || cd.contact_name || 'Contato',
        vcard: cd.vcard || ''
      }
    });
    crmMessageType = 'texto';
  } else if (messageType === 'location') {
    // Localização — exibe como texto com link do Google Maps (clicável)
    const ld = data?.data || {};
    const partes = [`📍 Localização${ld.name ? ': ' + ld.name : ''}`];
    if (ld.address) partes.push(ld.address);
    if (ld.degrees_latitude != null && ld.degrees_longitude != null) {
      partes.push(`https://www.google.com/maps?q=${ld.degrees_latitude},${ld.degrees_longitude}`);
    }
    content = partes.join('\n');
    crmMessageType = 'texto';
  } else {
    const messageTypes = {
      text: 'texto',
      image: 'imagem',
      video: 'video',
      audio: 'audio',
      document: 'documento',
      sticker: 'imagem',
      reaction: 'texto',
      poll_update: 'texto',
      carousel: 'texto',
      nativeflow: 'texto'
    };
    crmMessageType = messageTypes[messageType] || 'texto';
  }

  // Segurança: nunca salvar um tipo fora do permitido pelo schema da entidade
  const tiposValidos = ['texto', 'imagem', 'audio', 'video', 'pdf', 'documento'];
  if (!tiposValidos.includes(crmMessageType)) crmMessageType = 'texto';

  if (!content) {
    content =
      data?.media_data?.caption ||
      data?.caption ||
      (crmMessageType === 'audio' ? 'Áudio'
        : crmMessageType === 'imagem' ? 'Imagem'
        : crmMessageType === 'video' ? 'Vídeo'
        : crmMessageType === 'documento' ? (data?.media_data?.filename || 'Documento')
        : 'Mensagem');
  }

  console.log(`📨 [Webhook D-API] Mensagem recebida de ${fromPhone}: ${String(content).substring(0, 50)}`);

  // Evitar duplicação caso o webhook seja reenviado
  if (externalMessageId) {
    const mensagensExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      empresa_id: empresaId,
      whatsapp_message_id: externalMessageId
    }, '-created_date', 1);
    if (mensagensExistentes && mensagensExistentes.length > 0) {
      return { handled: false, reason: 'mensagem já registrada', messageId: externalMessageId };
    }
  }

  // Localizar ou criar conversa
  let conversa = null;
  try {
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: fromPhone
    }, '-created_date', 1);

    if (conversas.length > 0) {
      conversa = conversas[0];
      // Canal de ENVIO travado manualmente pelo usuário — não sobrescrever.
      const canalTravado = conversa.locked_provider === true;
      const atualizarConversa = {
        cliente_nome: fromName,
        last_inbound_provider: 'dapi',
        cliente_respondeu: true
      };
      if (!canalTravado) {
        atualizarConversa.provider = 'dapi';
        atualizarConversa.canal_origem = 'dapi';
        atualizarConversa.instancia = connection.session_id;
      }
      // Se a conversa estava finalizada e o cliente mandou mensagem, reabrir e colocar em "Esperando"
      if (conversa.status === 'encerrada') {
        atualizarConversa.status = 'ativa';
        atualizarConversa.responsavel_id = null;
        atualizarConversa.responsavel_expira_em = null;
      }
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, atualizarConversa);
    } else {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_telefone: fromPhone,
        cliente_nome: fromName,
        whatsapp_id: remoteJid,
        provider: 'dapi',
        canal_origem: 'dapi',
        tipo_conexao: 'usuario',
        instancia: connection.session_id,
        status: 'ativa',
        ultima_mensagem: String(content).substring(0, 200),
        data_ultima_mensagem: new Date(timestamp).toISOString(),
        ultimo_remetente: 'cliente',
        last_inbound_provider: 'dapi',
        cliente_respondeu: true,
        data_primeira_resposta: new Date().toISOString()
      });
      console.log(`✅ [Webhook D-API] Conversa criada: ${conversa.id}`);
    }
  } catch (error) {
    console.error(`❌ [Webhook D-API] Erro ao buscar/criar conversa:`, error.message);
    return { handled: false, error: error.message };
  }

  const { texto: respostaParaTexto, nome: respostaParaNome } = extrairRespostaCitada(data);

  // DEBUG TEMPORÁRIO: grava o contextInfo bruto para descobrirmos o formato exato usado pela D-API
  // (será removido assim que a extração da citação for confirmada). Não afeta o fluxo normal.
  const ctxDebug = data?.contextInfo || data?.context_info;
  if (ctxDebug) {
    base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: empresaId,
      tipo_evento: 'mensagem_recebida',
      telefone: fromPhone,
      conteudo: 'DEBUG_CONTEXT_INFO: ' + JSON.stringify(ctxDebug).substring(0, 1900),
      status: 'sucesso'
    }).catch(() => {});
  }

  const mensagemData = {
    empresa_id: empresaId,
    conversa_id: conversa.id,
    remetente: 'cliente',
    remetente_nome: fromName,
    tipo_conteudo: crmMessageType,
    texto: content,
    arquivo_url: mediaUrl,
    provider: 'dapi',
    resposta_para_texto: respostaParaTexto,
    resposta_para_nome: respostaParaNome,
    whatsapp_message_id: externalMessageId || `dapi_in_${Date.now()}`,
    status: 'entregue',
    data_envio: new Date(timestamp).toISOString()
  };

  await base44.asServiceRole.entities.MensagemWhatsapp.create(mensagemData);

  // Atualizar conversa
  await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
    ultima_mensagem: String(content).substring(0, 200),
    data_ultima_mensagem: new Date(timestamp).toISOString(),
    ultimo_remetente: 'cliente',
    cliente_nome: fromName,
    last_inbound_provider: 'dapi'
  });

  return {
    handled: true,
    conversaId: conversa.id,
    messageId: externalMessageId,
    fromPhone
  };
}

/**
 * Processar mensagem enviada diretamente pelo celular (fora do CRM).
 * Salva no histórico como remetente "vendedor" e marca a conversa como respondida.
 */
async function processMessageSentFromPhone(base44, data, connection, empresaId, externalMessageId) {
  // IMPORTANTE: em mensagens fromMe, "data.from" é o PRÓPRIO número (quem enviou), não o contato.
  // O destinatário/chat deve vir de "data.to" (ou key.remoteJid, que é sempre o JID do chat).
  const remoteJid = data?.to?.jid || data?.key?.remoteJid || data?.chatId || data?.jid || '';
  const telefone = String(remoteJid).replace(/@.*/g, '').replace(/\D/g, '');
  if (!telefone) {
    return { handled: false, reason: 'telefone não encontrado (fromMe)' };
  }

  const messageType = data.type || 'text';
  let content = typeof data.message === 'string' ? data.message : (data.text || data.content || '');
  const mediaUrl = data.media_url || data.media_data?.url || data.mediaUrl || data.fileUrl || null;
  let crmMessageType;

  if (messageType === 'contact') {
    const cd = data?.data || {};
    content = JSON.stringify({
      contactMessage: { displayName: cd.display_name || cd.contact_name || 'Contato', vcard: cd.vcard || '' }
    });
    crmMessageType = 'texto';
  } else if (messageType === 'location') {
    const ld = data?.data || {};
    const partes = [`📍 Localização${ld.name ? ': ' + ld.name : ''}`];
    if (ld.address) partes.push(ld.address);
    if (ld.degrees_latitude != null && ld.degrees_longitude != null) {
      partes.push(`https://www.google.com/maps?q=${ld.degrees_latitude},${ld.degrees_longitude}`);
    }
    content = partes.join('\n');
    crmMessageType = 'texto';
  } else {
    const messageTypes = {
      text: 'texto', image: 'imagem', video: 'video', audio: 'audio', ptt: 'audio', voice: 'audio', document: 'documento',
      sticker: 'imagem'
    };
    crmMessageType = messageTypes[messageType] || 'texto';
  }

  // Segurança: nunca salvar um tipo fora do permitido pelo schema da entidade
  const tiposValidos = ['texto', 'imagem', 'audio', 'video', 'pdf', 'documento'];
  if (!tiposValidos.includes(crmMessageType)) crmMessageType = 'texto';

  if (!content) {
    content = data?.media_data?.caption || data?.caption || (crmMessageType === 'audio' ? 'Áudio' : crmMessageType === 'imagem' ? 'Imagem' : crmMessageType === 'video' ? 'Vídeo' : crmMessageType === 'documento' ? (data?.media_data?.filename || 'Documento') : 'Mensagem');
  }
  const timestamp = data.timestamp || data.createdAt || new Date().toISOString();

  const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
    empresa_id: empresaId,
    cliente_telefone: telefone
  }, '-created_date', 1);

  let conversa;
  if (conversas && conversas.length > 0) {
    conversa = conversas[0];
  } else {
    const nomeContato = data?.to?.name || data?.name || telefone;
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId,
      cliente_telefone: telefone,
      cliente_nome: nomeContato,
      whatsapp_id: remoteJid,
      provider: 'dapi',
      canal_origem: 'dapi',
      tipo_conexao: 'usuario',
      instancia: connection.session_id,
      status: 'ativa',
      ultima_mensagem: '',
      data_ultima_mensagem: new Date().toISOString(),
      ultimo_remetente: 'vendedor'
    });
  }

  await base44.asServiceRole.entities.MensagemWhatsapp.create({
    empresa_id: empresaId,
    conversa_id: conversa.id,
    remetente: 'vendedor',
    tipo_conteudo: crmMessageType,
    texto: content,
    arquivo_url: mediaUrl,
    provider: 'dapi',
    whatsapp_message_id: externalMessageId || `dapi_out_phone_${Date.now()}`,
    status: 'enviada',
    data_envio: new Date(timestamp).toISOString()
  });

  // Responder pelo WhatsApp normal (celular) também move o cliente para "Em atendimento"
  await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
    ultima_mensagem: String(content).substring(0, 200),
    data_ultima_mensagem: new Date(timestamp).toISOString(),
    ultimo_remetente: 'vendedor',
    responsavel_id: conversa.responsavel_id || 'whatsapp_celular',
    responsavel_nome: conversa.responsavel_nome || connection.profile_name || 'Atendente (WhatsApp)',
    responsavel_expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  return { handled: true, conversaId: conversa.id, messageId: externalMessageId, fromPhone: telefone, viaCelular: true };
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
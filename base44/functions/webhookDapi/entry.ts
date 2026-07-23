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

/**
 * Parseia timestamp flexível e retorna ISO string válida.
 * Resolve o bug "Invalid time value" da D-API Cloud API, que envia timestamp
 * como "1784775654936" (Unix ms em string) — new Date("1784775654936") = Invalid Date.
 * Aceita: ISO string, número (ms), string numérica (ms ou s), ou null/undefined → agora.
 */
function parseTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'number') {
    let n = ts;
    if (n < 1e12) n = n * 1000; // seconds → ms
    return new Date(n).toISOString();
  }
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      let n = Number(ts);
      if (n < 1e12) n = n * 1000; // seconds → ms
      return new Date(n).toISOString();
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Helper de diagnóstico — registra cada etapa do processamento do webhook.
 * NÃO altera a lógica; apenas consolida console.log + grava LogRecebimentoWebhook.
 * Permite rastrear exatamente em qual etapa a mensagem deixa de fluir.
 */
// Logs de diagnóstico de webhook em produção — apenas metadados seguros (sem corpo bruto,
// telefone, conteúdo de mensagem, headers, tokens ou mídia). Telefones e trechos de mensagem
// permanecem apenas no console.log (efêmero, servidor) p/ diagnóstico operacional.
async function registrarDiagnostico(base44, traceId, etapa, dados) {
  const etapaNome = dados?.etapa_nome || '';
  const status = dados?.status || 'sucesso';
  const event = dados?.event || '-';
  const session_id = dados?.session_id || '-';
  const conversation_id = dados?.conversation_id || '-';
  const message_id = dados?.mensagem_salva_id || dados?.message_id || '-';
  console.log(`🔍 [TRACE ${traceId}] ETAPA ${etapa} ${etapaNome} event=${event} session_id=${session_id} conversation_id=${conversation_id} message_id=${message_id} status=${status}${dados?.erro ? ' erro=' + dados?.erro : ''}`);
  try {
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: dados?.empresa_id || 'unknown',
      tipo_evento: dados?.tipo_evento || 'mensagem_recebida',
      status: status === 'erro' ? 'erro' : 'sucesso',
      // Fase diagnóstica temporária: o telefone é persistido APENAS no log inicial (etapa 1),
      // para permitir o pareamento (telefone ⇄ D-API ⇄ cliente) quando eles restaurarem o
      // messages.received. Etapas subsequentes continuam sem persistir telefone.
      telefone: etapa === 1 ? (dados?.telefone_normalizado || dados?.telefone_recebido || null) : null,
      conteudo: `etapa=${etapa} ${etapaNome} | trace=${traceId} | event=${event}`,
      mensagem_erro: dados?.erro || null,
      mensagem_id,
      conversa_id: conversation_id,
      instancia: session_id,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`🔍 [TRACE ${traceId}] Falha ao salvar diagnóstico em LogRecebimentoWebhook:`, e.message);
  }
}

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
    
    // Log bruto do payload removido — não persiste corpo do webhook (pode conter telefones e
    // conteúdo de mensagem). Detalhamento das etapas permanece via registrarDiagnostico.
    
    // Identificar tipo do evento
    const eventType = body.event || body.type || 'unknown';
    const sessionId = body.sessionId || body.session_id || body.sessionId || 'unknown';
    const timestamp = body.timestamp || body.createdAt || new Date().toISOString();
    
    console.log(`🏷️ [Webhook D-API] ${webhookId} - Evento: ${eventType}, Session: ${sessionId}`);

    // ───────── ETAPA 1 — Registro da entrada bruta do webhook ─────────
    // Captura: data/hora, headers, body bruto, event, sessionId, remoteJid, messageId,
    // conversationId (se existir), telefone e texto (se extraíveis do payload).
    const _dataRaw = body.data || body.message || body || {};
    const _remoteJidRaw = _dataRaw?.from?.jid || _dataRaw?.key?.remoteJid || _dataRaw?.chatId || _dataRaw?.jid || '';
    const _messageIdRaw = _dataRaw?.id || _dataRaw?.key?.id || _dataRaw?.messageId || _dataRaw?.external_message_id || null;
    const _telefoneRaw = String(_remoteJidRaw).replace(/@.*/g, '').replace(/\D/g, '') || '';
    const _textoRaw = typeof _dataRaw?.message === 'string' ? _dataRaw.message
      : (_dataRaw?.text || _dataRaw?.content || _dataRaw?.caption || '');
    await registrarDiagnostico(base44, webhookId, 1, {
      etapa_nome: 'WEBHOOK_ENTRADA',
      tipo_evento: 'mensagem_recebida',
      event: eventType,
      session_id: sessionId,
      message_id: _messageIdRaw,
      conversation_id: _dataRaw?.conversationId || _dataRaw?.conversation_id || null,
      telefone_recebido: _telefoneRaw,
      conteudo_extra: `headers=${Object.keys(headers).length} | body_size=${JSON.stringify(body).length} | texto="${String(_textoRaw).slice(0,80)}"`,
      status: 'sucesso',
    });
    
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

        // ───────── ETAPA 2 — Validar evento (descartes informados) ─────────
        const _isMsgsReceived = eventType === 'messages.received';
        await registrarDiagnostico(base44, webhookId, 2, {
          etapa_nome: 'VALIDACAO_EVENTO',
          event: eventType,
          session_id: sessionId,
          connection_id: connectionId,
          empresa_id: empresaId,
          status: 'sucesso',
          conteudo_extra: `is_messages_received=${_isMsgsReceived} | connection=${connection.nome} | provider_type=${connection.provider_type}`,
          motivo_descarte: _isMsgsReceived ? null : `evento diferente de messages.received (vai para processEvent handler específico)`,
        });
      } else {
        console.warn(`⚠️ [Webhook D-API] ${webhookId} - Conexão não encontrada para sessionId: ${sessionId}`);
        await registrarDiagnostico(base44, webhookId, 2, {
          etapa_nome: 'VALIDACAO_EVENTO',
          event: eventType,
          session_id: sessionId,
          status: 'erro',
          erro: `Conexão não encontrada para sessionId=${sessionId} — evento descartado`,
          conteudo_extra: 'PT3_CONEXAO_NAO_ENCONTRADA',
          motivo_descarte: 'session_id não casa com nenhuma WhatsappConnection ativa',
        });
      }
      // ETAPA 3 — Detectar múltiplas conexões com o mesmo session_id (caso raro)
      if (connections.length > 1) {
        await registrarDiagnostico(base44, webhookId, 3, {
          etapa_nome: 'CONEXAO_DUPLA_DETECTADA',
          status: 'erro',
          erro: `${connections.length} conexões compartilham session_id=${sessionId}`,
          conteudo_extra: `ids=${connections.map(c => c.id).join(',')}`,
        });
      }
    } catch (error) {
      console.error(`❌ [Webhook D-API] ${webhookId} - Erro ao buscar conexão:`, error.message);
      await registrarDiagnostico(base44, webhookId, 3, {
        etapa_nome: 'BUSCA_CONEXAO_ERRO',
        status: 'erro',
        erro: error.message,
      });
    }
    
    // Log do webhook — somente metadados seguros. Não persistimos mais corpo bruto do payload
    // (body) nem fromPhone/fromName/conteúdo do result. Apenas: event, sessionId, conversation_id,
    // message_id, status, trace/webhookId p/ auditoria.
    const logData = {
      empresa_id: empresaId || 'unknown',
      connection_id: connectionId,
      event_type: eventType,
      direction: 'inbound',
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
      console.log(`✅ [Webhook D-API] ${webhookId} - Processado: handled=${!!processResult?.handled}`);
    } catch (error) {
      errorMessage = error.message;
      console.error(`❌ [Webhook D-API] ${webhookId} - Erro ao processar:`, error.message);
    }
    
    // Atualizar log com resultado — somente metadados seguros (sem telefone, conteúdo, etc.)
    logData.response_json = JSON.stringify({
      success: !errorMessage,
      event: eventType,
      sessionId,
      processed: !!processResult,
      handled: !!processResult?.handled,
      conversation_id: processResult?.conversaId || null,
      message_id: processResult?.messageId || null,
      webhookId,
      timestamp: new Date().toISOString()
    });
    logData.error_message = errorMessage;
    
    // Salvar log (não bloquear resposta)
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
// Formato real da D-API: data.contextInfo = { participant, quoted_message: { body, type }, quoted_message_id, stanza_id }
// Como o participant vem como JID @lid (não dá pra extrair nome), buscamos a mensagem original salva
// no banco pelo whatsapp_message_id para pegar o texto e o nome corretos do remetente.
async function extrairRespostaCitada(base44, empresaId, data) {
  const ctx = data?.contextInfo || data?.context_info || null;
  if (!ctx) return { texto: null, nome: null, whatsappId: null };

  const quotedMsg = ctx.quoted_message || ctx.quotedMessage || null;
  const quotedId = ctx.quoted_message_id || ctx.stanza_id || ctx.quotedMessageId || null;

  if (quotedId) {
    try {
      const originais = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        empresa_id: empresaId,
        whatsapp_message_id: String(quotedId)
      }, '-created_date', 1);
      if (originais && originais.length > 0) {
        const original = originais[0];
        const nomeOriginal = original.remetente === 'vendedor' ? (original.usuario_nome || 'Você') : (original.remetente_nome || 'Cliente');
        const textoOriginal = original.texto || (quotedMsg?.body || null);
        return { texto: textoOriginal ? String(textoOriginal).substring(0, 200) : null, nome: nomeOriginal, whatsappId: String(quotedId) };
      }
    } catch (_) {}
  }

  const texto = quotedMsg?.body || quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || quotedMsg?.text || null;
  return { texto: texto ? String(texto).substring(0, 200) : null, nome: null, whatsappId: quotedId ? String(quotedId) : null };
}

async function processMessageReceived(base44, body, connection, empresaId) {
  const _traceId = (body?.traceId || body?._traceId || crypto.randomUUID());
  if (!connection) {
    await registrarDiagnostico(base44, _traceId, 4, {
      etapa_nome: 'PROCESS_MSG_RECEIVED',
      status: 'erro',
      erro: 'connection not found — descartando messages.received',
      motivo_descarte: 'connection not found',
    });
    return { handled: false, reason: 'connection not found' };
  }

  const data = body.data || body.message || body;
  const isFromMe = data?.fromMe === true || data?.key?.fromMe === true;

  if (data?.is_group === true || String(data?.from?.jid || '').includes('@g.us')) {
    await registrarDiagnostico(base44, _traceId, 4, {
      etapa_nome: 'PROCESS_MSG_RECEIVED_GRUPO_DESCARTADO',
      empresa_id: empresaId,
      connection_id: connection.id,
      session_id: connection.session_id,
      status: 'erro',
      erro: 'mensagem de grupo — descartada pelo fluxo (intencional)',
      motivo_descarte: 'mensagem de grupo',
    });
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
  const timestamp = parseTimestamp(data.timestamp || data.createdAt);

  if (!fromPhone) {
    console.error('❌ [Webhook D-API] Não foi possível extrair o telefone:', JSON.stringify(data, null, 2));
    await registrarDiagnostico(base44, _traceId, 4, {
      etapa_nome: 'FONE_NAO_EXTRAIDO',
      empresa_id: empresaId,
      connection_id: connection.id,
      session_id: connection.session_id,
      status: 'erro',
      erro: 'telefone não encontrado no payload (data.from.jid/key.remoteJid/chatId/jid vazios)',
      motivo_descarte: 'telefone não encontrado',
    });
    return { handled: false, reason: 'telefone não encontrado' };
  }

  // ───────── ETAPA 4 — Normalização do telefone ─────────
  // Garante sempre o mesmo formato para a busca (ex: 558799058241), mesmo se a
  // D-API mandar +558799058241 ou 8799058241. Não permite divergências.
  const _telefoneOriginal = fromPhone;
  await registrarDiagnostico(base44, _traceId, 4, {
    etapa_nome: 'NORMALIZACAO_TELEFONE',
    empresa_id: empresaId,
    connection_id: connection.id,
    session_id: connection.session_id,
    telefone_recebido: _telefoneOriginal,
    telefone_normalizado: fromPhone,
    message_id: externalMessageId,
    status: 'sucesso',
    conteudo_extra: `raw_jid=${remoteJid} | from_name=${fromName}`,
  });

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
      await registrarDiagnostico(base44, _traceId, 6, {
        etapa_nome: 'Duplicidade_DETECTADA',
        empresa_id: empresaId,
        connection_id: connection.id,
        session_id: connection.session_id,
        message_id: externalMessageId,
        telefone_normalizado: fromPhone,
        status: 'erro',
        erro: 'mensagem já registrada com este whatsapp_message_id — descartada',
        motivo_descarte: 'mensagem já registrada',
      });
      return { handled: false, reason: 'mensagem já registrada', messageId: externalMessageId };
    }
  }

  // Localizar ou criar conversa
  let conversa = null;
  let _conversaCriada = false;
  let _antesUltimaMensagem = null;
  let _antesUltimaMensagemEm = null;
  try {
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: fromPhone
    }, '-created_date', 1);

    // ───────── ETAPA 5 — Localizar a conversa ─────────
    // Lista TODAS as conversas com o mesmo telefone para detectar duplicidade.
    let _todasConversasTelefone = [];
    try {
      _todasConversasTelefone = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        empresa_id: empresaId,
        cliente_telefone: fromPhone
      }, '-created_date', 50);
    } catch (_) {}

    await registrarDiagnostico(base44, _traceId, 5, {
      etapa_nome: conversas.length > 0 ? 'CONVERSA_ENCONTRADA' : 'CONVERSA_NAO_ENCONTRADA',
      empresa_id: empresaId,
      connection_id: connection.id,
      session_id: connection.session_id,
      telefone_normalizado: fromPhone,
      conversation_id: conversas[0]?.id || null,
      conteudo_extra: `total_conversas_mes_telefone=${_todasConversasTelefone.length} | ids=${_todasConversasTelefone.map(c => c.id).slice(0,5).join(',')} | status=${_todasConversasTelefone.map(c => c.status).slice(0,5).join(',')}`,
      status: conversas.length > 0 ? 'sucesso' : 'erro',
      erro: conversas.length === 0 ? 'nenhuma conversa com este telefone — será criada' : null,
      motivo_descarte: conversas.length > 1 ? `EXISTEM ${conversas.length}+ conversas com mesmo telefone — picked [0]` : null,
    });

    if (conversas.length > 0) {
      conversa = conversas[0];
      // Canal de ENVIO travado manualmente pelo usuário — não sobrescrever.
      const canalTravado = conversa.locked_provider === true;
      // connection_id amarra a conversa à conexão (D-API Oficial / Douglas) que recebeu
      // a última mensagem — usado no envio para escolher o canal certo (multi-D-API).
      const atualizarConversa = {
        cliente_nome: fromName,
        last_inbound_provider: 'dapi',
        cliente_respondeu: true,
        connection_id: connection.id
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
      _antesUltimaMensagem = conversa.ultima_mensagem;
      _antesUltimaMensagemEm = conversa.data_ultima_mensagem;
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, atualizarConversa);
      await registrarDiagnostico(base44, _traceId, 5, {
        etapa_nome: 'CONVERSA_EXISTENTE_ATUALIZADA',
        empresa_id: empresaId,
        connection_id: connection.id,
        session_id: connection.session_id,
        conversation_id: conversa.id,
        telefone_normalizado: fromPhone,
        status: 'sucesso',
        conteudo_extra: `provider=${conversa.provider} | locked=${conversa.locked_provider} | status=${conversa.status}`,
      });
    } else {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_telefone: fromPhone,
        cliente_nome: fromName,
        whatsapp_id: remoteJid,
        provider: 'dapi',
        canal_origem: 'dapi',
        tipo_conexao: 'usuario',
        connection_id: connection.id,
        instancia: connection.session_id,
        status: 'ativa',
        ultima_mensagem: String(content).substring(0, 200),
        data_ultima_mensagem: new Date(timestamp).toISOString(),
        ultimo_remetente: 'cliente',
        last_inbound_provider: 'dapi',
        cliente_respondeu: true,
        data_primeira_resposta: new Date().toISOString()
      });
      _conversaCriada = true;
      console.log(`✅ [Webhook D-API] Conversa criada: ${conversa.id}`);
      await registrarDiagnostico(base44, _traceId, 5, {
        etapa_nome: 'CONVERSA_CRIADA',
        empresa_id: empresaId,
        connection_id: connection.id,
        session_id: connection.session_id,
        conversation_id: conversa.id,
        conversa_criada: true,
        telefone_normalizado: fromPhone,
        status: 'sucesso',
        conteudo_extra: `nova conversa para ${fromPhone}`,
      });
    }
  } catch (error) {
    console.error(`❌ [Webhook D-API] Erro ao buscar/criar conversa:`, error.message);
    await registrarDiagnostico(base44, _traceId, 5, {
      etapa_nome: 'CONVERSA_ERRO',
      empresa_id: empresaId,
      connection_id: connection.id,
      session_id: connection.session_id,
      status: 'erro',
      erro: error.message,
    });
    return { handled: false, error: error.message };
  }

  const { texto: respostaParaTexto, nome: respostaParaNome, whatsappId: respostaParaWhatsappId } = await extrairRespostaCitada(base44, empresaId, data);

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
    resposta_para_whatsapp_id: respostaParaWhatsappId,
    whatsapp_message_id: externalMessageId || `dapi_in_${Date.now()}`,
    status: 'entregue',
    data_envio: new Date(timestamp).toISOString()
  };

  let _mensagemSalva = null;
  try {
    _mensagemSalva = await base44.asServiceRole.entities.MensagemWhatsapp.create(mensagemData);
  } catch (_e) {
    await registrarDiagnostico(base44, _traceId, 6, {
      etapa_nome: 'MENSAGEM_SAVE_ERRO',
      empresa_id: empresaId,
      connection_id: connection.id,
      session_id: connection.session_id,
      conversation_id: conversa.id,
      telefone_normalizado: fromPhone,
      status: 'erro',
      erro: _e?.message,
      message_id: externalMessageId,
    });
    throw _e;
  }

  // ───────── ETAPA 6 — Mensagem salva ─────────
  await registrarDiagnostico(base44, _traceId, 6, {
    etapa_nome: 'MENSAGEM_SALVA',
    empresa_id: empresaId,
    connection_id: connection.id,
    session_id: connection.session_id,
    conversation_id: conversa.id,
    telefone_normalizado: fromPhone,
    message_id: externalMessageId,
    mensagem_salva_id: _mensagemSalva?.id || null,
    conteudo_extra: `direction=cliente | tipo=${crmMessageType} | texto="${String(content).slice(0,50)}"`,
    status: 'sucesso',
  });

  // ───────── ETAPA 7 — Conferir no banco (re-query by id) ─────────
  let _msgConfirmada = null;
  try {
    _msgConfirmada = _mensagemSalva?.id ? await base44.asServiceRole.entities.MensagemWhatsapp.get(_mensagemSalva.id) : null;
  } catch (_e) {
    _msgConfirmada = null;
  }
  const _gravadaOk = !!(_msgConfirmada && _msgConfirmada.id === _mensagemSalva?.id);
  await registrarDiagnostico(base44, _traceId, 7, {
    etapa_nome: 'MENSAGEM_CONFERIDA_BANCO',
    empresa_id: empresaId,
    connection_id: connection.id,
    session_id: connection.session_id,
    conversation_id: conversa.id,
    mensagem_salva_id: _mensagemSalva?.id,
    mensagem_gravada: _gravadaOk,
    conteudo_extra: `query=MensagemWhatsapp.get(${_mensagemSalva?.id}) | conversa_id_banco=${_msgConfirmada?.conversa_id || 'N/A'} | direction_banco=${_msgConfirmada?.remetente || 'N/A'}`,
    status: _gravadaOk ? 'sucesso' : 'erro',
    erro: _gravadaOk ? null : 'Mensagem NÃO foi encontrada no banco após o create',
  });

  // Atualizar conversa
  await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
    ultima_mensagem: String(content).substring(0, 200),
    data_ultima_mensagem: new Date(timestamp).toISOString(),
    ultimo_remetente: 'cliente',
    cliente_nome: fromName,
    last_inbound_provider: 'dapi'
  });

  // ───────── ETAPA 8 — Atualização da conversa (antes/depois) ─────────
  await registrarDiagnostico(base44, _traceId, 8, {
    etapa_nome: 'CONVERSA_ATUALIZADA',
    empresa_id: empresaId,
    connection_id: connection.id,
    session_id: connection.session_id,
    conversation_id: conversa.id,
    telefone_normalizado: fromPhone,
    mensagem_salva_id: _mensagemSalva?.id,
    conteudo_extra: `antes_ultima_mensagem="${String(_antesUltimaMensagem||'').slice(0,40)}" | antes_em=${_antesUltimaMensagemEm||'-'} | depois_ultima_mensagem="${String(content).slice(0,40)}" | depois_depois_em=${new Date(timestamp).toISOString()}`,
    status: 'sucesso',
  });

  // ───────── ETAPA 9 — Emissão realtime ─────────
  // O Base44 dispara realtime automaticamente quando uma MensagemWhatsapp é criada.
  // Não há Socket/SSE manual: o sdk do frontend (base44.entities.MensagemWhatsapp.subscribe)
  // recebe eventos de "create" do banco em tempo real. Registramos aqui o evento disparado.
  await registrarDiagnostico(base44, _traceId, 9, {
    etapa_nome: 'REALTIME_EMITIDO_SISTEMA',
    empresa_id: empresaId,
    connection_id: connection.id,
    session_id: connection.session_id,
    conversation_id: conversa.id,
    mensagem_salva_id: _mensagemSalva?.id,
    realtime_emitido: true,
    conteudo_extra: 'base44.entities.MensagemWhatsapp.create() dispara realtime automaticamente para subscribers do front (BatePapo.jsx)',
    status: 'sucesso',
  });

  return {
    handled: true,
    conversaId: conversa.id,
    messageId: externalMessageId,
    fromPhone,
    traceId: _traceId,
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
  const timestamp = parseTimestamp(data.timestamp || data.createdAt);

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
      connection_id: connection.id,
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

  // Marcar todas as mensagens do cliente anteriores como lidas.
  // Se o atendente respondeu pelo celular, ele obrigatoriamente leu as mensagens do cliente.
  try {
    const naoLidas = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
      remetente: 'cliente'
    }, '-created_date', 200);
    if (naoLidas && naoLidas.length > 0) {
      const paraMarcar = naoLidas.filter(m => m.status !== 'lida').map(m => ({ id: m.id, status: 'lida', lida_em: new Date(timestamp).toISOString() }));
      if (paraMarcar.length > 0) {
        await base44.asServiceRole.entities.MensagemWhatsapp.bulkUpdate(paraMarcar);
        console.log(`✅ [Webhook D-API] ${paraMarcar.length} mensagens do cliente marcadas como lidas (resposta via celular)`);
      }
    }
  } catch (e) {
    console.error(`⚠️ [Webhook D-API] Erro ao marcar mensagens do cliente como lidas:`, e.message);
  }

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
 *
 * Quando o usuário ABRE um chat no celular (sem necessariamente responder), o WhatsApp Multi-Device
 * dispara chats.update com unreadCount=0. Sem tratar isso, o CRM nunca saberia que as mensagens
 * recebidas do cliente foram visualizadas no celular — o badge verde ficaria travado.
 * Aqui marcamos todas as mensagens INBOUND (remetente=cliente) da conversa como "lida".
 */
async function processChatUpdate(base44, body, connection) {
  if (!connection) return { handled: false, reason: 'connection not found' };

  const data = body.data || body.chat || body;
  // data pode ser um único chat, um array de chats, ou { chats: [...] }
  const chats = Array.isArray(data) ? data : (Array.isArray(data?.chats) ? data.chats : [data]);

  let totalMarcados = 0;

  for (const chat of chats) {
    const remoteJid = chat?.jid || chat?.id || chat?.remoteJid || chat?.chatId || '';
    const unreadCount = (chat?.unreadCount ?? chat?.unread_count ?? chat?.count ?? null);

    if (!remoteJid) {
      console.log(`ℹ️ [Webhook D-API] chats.update sem jid:`, JSON.stringify(chat, null, 2));
      continue;
    }

    if (String(remoteJid).includes('@g.us')) {
      console.log(`ℹ️ [Webhook D-API] Ignorando chats.update de grupo:`, remoteJid);
      continue;
    }

    const telefone = String(remoteJid).replace(/@.*/g, '').replace(/\D/g, '');
    if (!telefone) continue;

    // Só marca como lidas quando o unreadCount chegou a 0 (usuário abriu o chat no celular)
    if (unreadCount !== 0) {
      console.log(`ℹ️ [Webhook D-API] chats.update ${telefone} unreadCount=${unreadCount} — ignorando`);
      continue;
    }

    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: connection.empresa_id,
      cliente_telefone: telefone
    }, '-created_date', 1);

    if (!conversas || conversas.length === 0) {
      console.log(`ℹ️ [Webhook D-API] Conversa não encontrada para ${telefone}`);
      continue;
    }

    const conversa = conversas[0];
    const agora = new Date().toISOString();

    const msgsCliente = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
      remetente: 'cliente'
    }, '-created_date', 200);

    const paraMarcar = msgsCliente
      .filter(m => m.status !== 'lida')
      .map(m => ({ id: m.id, status: 'lida', lida_em: agora }));

    if (paraMarcar.length > 0) {
      await base44.asServiceRole.entities.MensagemWhatsapp.bulkUpdate(paraMarcar);
      console.log(`✅ [Webhook D-API] ${paraMarcar.length} mensagens de ${telefone} marcadas como lidas (leitura no celular via chats.update)`);
      totalMarcados += paraMarcar.length;
    } else {
      console.log(`ℹ️ [Webhook D-API] Nenhuma mensagem de ${telefone} pendente de leitura`);
    }
  }

  return { handled: true, event: 'chat_update', marcadosComoLidos: totalMarcados };
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
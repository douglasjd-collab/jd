import { createClient } from 'npm:@base44/sdk@0.8.31';

/**
 * Webhook D-API - Recebe eventos de conexão em tempo real
 * 
 * Endpoint: POST /functions/receberWebhookDapi
 * 
 * Eventos suportados:
 * - connection.status - Mudança de status da conexão
 * - connection.qrcode - QR Code gerado/atualizado
 * - logged_out - Sessão deslogada
 * - messages.received - Mensagem recebida
 * - messages.sent - Mensagem enviada
 * - message.read - Mensagem lida
 * - message.delivered - Mensagem entregue
 * - message.update - Atualização de mensagem
 * - message.deleted - Mensagem apagada
 * - contacts.upsert - Contato criado/atualizado
 * - contacts.update - Contato atualizado
 * - chats.upsert - Chat criado
 * - chats.update - Chat atualizado
 * 
 * Estrutura do webhook:
 * {
 *   "event": "connection.status",
 *   "sessionId": "CRM JD",
 *   "data": { ... },
 *   "timestamp": "2026-06-28T10:00:00Z",
 *   "traceId": "abc123"
 * }
 */

Deno.serve(async (req) => {
  try {
    // Não requer autenticação de usuário - é um webhook público
    const base44 = createClient({
      appUrl: Deno.env.get('BASE44_APP_URL'),
      serviceRole: true
    });
    
    const payload = await req.json().catch(() => ({}));
    const { event, sessionId, data, timestamp, traceId } = payload;
    
    console.log('📥 Webhook D-API recebido:', {
      event,
      sessionId,
      timestamp,
      traceId,
      dataType: typeof data
    });
    
    // Buscar conexão pelo session_id
    const connections = await base44.entities.WhatsappConnection.filter({ 
      session_id: sessionId 
    });
    
    if (!connections || connections.length === 0) {
      console.log('⚠️ Conexão não encontrada para session_id:', sessionId);
      return Response.json({ 
        success: false, 
        error: 'Connection not found' 
      }, { status: 404 });
    }
    
    const connection = connections[0];
    
    // Mapear status do evento para status do CRM
    const mapStatus = (rawStatus) => {
      const statusLower = (rawStatus || '').toLowerCase();
      
      if (statusLower === 'connected') return 'conectado';
      if (statusLower === 'connecting') return 'reiniciando';
      if (statusLower === 'disconnected') return 'desconectado';
      if (['qr', 'waiting_qr', 'pending'].includes(statusLower)) return 'aguardando_qr';
      if (['error', 'failed'].includes(statusLower)) return 'erro_recebimento';
      
      return 'desconectado';
    };
    
    // Atualizar dados da conexão baseado no evento
    const updates = {
      last_health_check_at: new Date().toISOString()
    };
    
    // Processar diferentes tipos de evento
    switch (event) {
      case 'connection.status':
        // Evento de mudança de status da conexão
        if (data.status) {
          updates.status = mapStatus(data.status);
        }
        
        // Telefone: authData.phone (oficial D-API) ou phone/phoneNumber
        const phone = data.authData?.phone || data.phone || data.phoneNumber;
        if (phone) {
          updates.phone_number = phone;
        }
        
        if (data.profileName || data.profile_name) {
          updates.profile_name = data.profileName || data.profile_name;
        }
        
        if (data.connectedAt || data.connected_at) {
          updates.last_success_at = data.connectedAt || data.connected_at;
        }
        
        console.log('✅ Status atualizado:', updates.status, 'Phone:', phone);
        break;
        
      case 'connection.qrcode':
        // QR Code gerado/atualizado
        updates.status = 'aguardando_qr';
        
        if (data.qrCode || data.qr_code) {
          updates.config_json = JSON.stringify({
            ...JSON.parse(connection.config_json || '{}'),
            lastQrCode: data.qrCode || data.qr_code,
            lastQrCodeAt: timestamp
          });
        }
        
        console.log('✅ QR Code atualizado');
        break;
        
      case 'logged_out':
        // Sessão deslogada
        updates.status = 'desconectado';
        updates.last_error_at = new Date().toISOString();
        updates.last_error_message = 'Sessão deslogada';
        
        console.log('✅ Sessão deslogada');
        break;
        
      case 'messages.received':
        console.log('📨 Mensagem recebida:', data);
        await processarMensagemRecebida(base44, connection, data);
        break;
        
      case 'messages.sent':
        console.log('📤 Mensagem enviada (confirmação):', data);
        await processarConfirmacaoEnvio(base44, connection, data);
        break;
        
      case 'message.delivered':
        await atualizarStatusMensagem(base44, connection, data, 'entregue');
        break;
        
      case 'message.read':
        await atualizarStatusMensagem(base44, connection, data, 'lida');
        break;
        
      default:
        console.log('ℹ️ Evento não tratado:', event);
    }
    
    // Salvar log do webhook
    await base44.entities.WhatsappConnectionLog.create({
      empresa_id: connection.empresa_id,
      connection_id: connection.id,
      event_type: 'connection.status',
      direction: 'inbound',
      payload_json: JSON.stringify(payload),
      response_json: JSON.stringify({ success: true, updates }),
      response_time_ms: 0,
      created_at: new Date().toISOString()
    });
    
    // Atualizar conexão no banco
    if (Object.keys(updates).length > 0) {
      await base44.entities.WhatsappConnection.update(connection.id, updates);
    }
    
    console.log('✅ Webhook processado com sucesso');
    
    return Response.json({ 
      success: true, 
      message: 'Webhook processed',
      connectionId: connection.id,
      sessionId
    });
    
  } catch (error) {
    console.error('❌ Erro ao processar webhook D-API:', error);
    
    // Não retornar erro 500 para evitar retentativas desnecessárias
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 200 });
  }
});

// Processa uma mensagem recebida de cliente via D-API e salva no CRM
async function processarMensagemRecebida(base44, connection, data) {
  try {
    // Ignorar mensagens enviadas por nós mesmos (fromMe)
    if (data?.fromMe || data?.key?.fromMe) {
      console.log('ℹ️ Ignorando mensagem própria (fromMe)');
      return;
    }

    // Ignorar mensagens de grupo
    const remoteJid = data?.from || data?.key?.remoteJid || data?.chatId || data?.jid || '';
    if (String(remoteJid).includes('@g.us')) {
      console.log('ℹ️ Ignorando mensagem de grupo');
      return;
    }

    const telefone = String(remoteJid).replace(/@.*/g, '').replace(/\D/g, '');
    if (!telefone) {
      console.warn('⚠️ Não foi possível extrair telefone da mensagem D-API:', JSON.stringify(data).substring(0, 300));
      return;
    }

    const nomeContato = data?.pushName || data?.notifyName || data?.senderName || telefone;
    const empresaId = connection.empresa_id;

    // Extrair conteúdo da mensagem (formatos possíveis da D-API/Baileys)
    let tipo_conteudo = 'texto';
    let texto = '';
    let arquivo_url = null;

    const msgContent = data?.message || data;

    if (msgContent?.conversation || msgContent?.text) {
      tipo_conteudo = 'texto';
      texto = msgContent.conversation || msgContent.text || '';
    } else if (msgContent?.extendedTextMessage?.text) {
      tipo_conteudo = 'texto';
      texto = msgContent.extendedTextMessage.text;
    } else if (msgContent?.imageMessage) {
      tipo_conteudo = 'imagem';
      texto = msgContent.imageMessage.caption || '';
      arquivo_url = msgContent.imageMessage.url || null;
    } else if (msgContent?.audioMessage) {
      tipo_conteudo = 'audio';
      texto = 'Áudio';
      arquivo_url = msgContent.audioMessage.url || null;
    } else if (msgContent?.videoMessage) {
      tipo_conteudo = 'video';
      texto = msgContent.videoMessage.caption || 'Vídeo';
      arquivo_url = msgContent.videoMessage.url || null;
    } else if (msgContent?.documentMessage) {
      tipo_conteudo = 'documento';
      texto = msgContent.documentMessage.fileName || 'Documento';
      arquivo_url = msgContent.documentMessage.url || null;
    } else {
      texto = data?.body || data?.text || 'Mensagem';
    }

    // Buscar ou criar conversa
    let conversas = await base44.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone
    }, '-created_date', 1);

    let conversa;
    if (conversas.length > 0) {
      conversa = conversas[0];
      if (conversa.status === 'campanha') {
        await base44.entities.ConversaWhatsapp.update(conversa.id, {
          status: 'ativa',
          cliente_respondeu: true,
          data_primeira_resposta: new Date().toISOString(),
          tipo_conexao: 'usuario',
          provider: 'dapi',
        });
      }
    } else {
      conversa = await base44.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_telefone: telefone,
        cliente_nome: nomeContato,
        whatsapp_id: remoteJid,
        status: 'ativa',
        tipo_conexao: 'usuario',
        provider: 'dapi',
        canal_origem: 'evolution',
        instancia: connection.session_id,
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        ultimo_remetente: 'cliente',
      });
    }

    const wamid = data?.key?.id || data?.id || `dapi_in_${Date.now()}`;

    await base44.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'cliente',
      tipo_conteudo,
      texto,
      arquivo_url,
      provider: 'dapi',
      whatsapp_message_id: wamid,
      data_envio: new Date().toISOString(),
      status: 'entregue',
    });

    await base44.entities.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: texto.substring(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      ultimo_remetente: 'cliente',
      cliente_nome: nomeContato,
      last_inbound_provider: 'dapi',
    });

    console.log('✅ Mensagem D-API recebida e salva na conversa:', conversa.id);
  } catch (e) {
    console.error('❌ Erro ao processar mensagem recebida D-API:', e.message);
  }
}

// Confirma o envio de uma mensagem já registrada pelo backend (apenas log/registro, sem duplicar)
async function processarConfirmacaoEnvio(base44, connection, data) {
  try {
    const wamid = data?.key?.id || data?.id;
    if (!wamid) return;
    console.log('ℹ️ Confirmação de envio D-API para wamid:', wamid);
  } catch (e) {
    console.error('❌ Erro ao processar confirmação de envio D-API:', e.message);
  }
}

// Atualiza status (entregue/lida) de uma mensagem enviada pelo CRM via D-API
async function atualizarStatusMensagem(base44, connection, data, statusInterno) {
  try {
    const wamid = data?.key?.id || data?.id;
    if (!wamid) return;

    const mensagens = await base44.entities.MensagemWhatsapp.filter({
      empresa_id: connection.empresa_id,
      whatsapp_message_id: wamid,
    }, '-created_date', 1);

    if (mensagens.length === 0) {
      console.warn('⚠️ Mensagem D-API não encontrada para atualizar status:', wamid);
      return;
    }

    const mensagem = mensagens[0];
    const ordemStatus = { 'enviada': 1, 'entregue': 2, 'lida': 3, 'erro': -1 };
    const statusAtual = mensagem.status || 'pendente';
    if ((ordemStatus[statusInterno] || 0) <= (ordemStatus[statusAtual] || 0)) return;

    const updateData = { status: statusInterno };
    if (statusInterno === 'entregue') updateData.entregue_em = new Date().toISOString();
    if (statusInterno === 'lida') updateData.lida_em = new Date().toISOString();

    await base44.entities.MensagemWhatsapp.update(mensagem.id, updateData);
    console.log(`✅ Status D-API atualizado: ${wamid} → ${statusInterno}`);
  } catch (e) {
    console.error('❌ Erro ao atualizar status D-API:', e.message);
  }
}
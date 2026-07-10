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

    console.log("========== WEBHOOK BRUTO ==========");
    console.log(JSON.stringify(payload, null, 2));
    console.log("==================================");

    const { event, sessionId, data, timestamp, traceId } = payload;

    if (!event || !sessionId || !data) {
      console.error('❌ Payload D-API inválido:', payload);
      return Response.json({
        success: false,
        error: 'Payload inválido',
        received: payload
      }, { status: 200 });
    }
    
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
        console.log('📨 Evento messages.received:', JSON.stringify(data, null, 2));
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
        console.log('ℹ️ Evento não tratado:', event, JSON.stringify(data, null, 2));
    }
    
    // Salvar log do webhook (payload bruto sempre salvo, útil para diagnóstico de eventos não mapeados)
    await base44.entities.WhatsappConnectionLog.create({
      empresa_id: connection.empresa_id,
      connection_id: connection.id,
      event_type: event,
      direction: 'inbound',
      payload_json: JSON.stringify(payload),
      response_json: JSON.stringify({ success: true, event, sessionId, updates }),
      error_message: null,
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
    console.log('📦 Processando mensagem D-API:', JSON.stringify(data, null, 2));

    // Ignorar grupos por enquanto
    if (data?.is_group === true || String(data?.from?.jid || '').includes('@g.us')) {
      console.log('ℹ️ Ignorando mensagem de grupo');
      return;
    }

    // Mensagem enviada pelo próprio número (fromMe): se já foi registrada pelo envio via CRM, ignorar (eco).
    // Se ainda não existir, foi enviada direto pelo celular/WhatsApp e precisa ser salva no histórico.
    // IMPORTANTE: para fromMe, "data.from" é o PRÓPRIO número (quem enviou) — o contato/chat está em "data.to".
    const isFromMe = data?.fromMe === true || data?.key?.fromMe === true;
    if (isFromMe) {
      const remoteJidFromMe = data?.to?.jid || data?.key?.remoteJid || data?.chatId || data?.jid || '';
      const telefoneFromMe = String(remoteJidFromMe).replace(/@.*/g, '').replace(/\D/g, '');
      if (!telefoneFromMe) {
        console.error('❌ Não foi possível extrair o telefone do destinatário (fromMe):', JSON.stringify(data, null, 2));
        return;
      }
      const wamidFromMe = data?.id || data?.key?.id;
      if (wamidFromMe) {
        const jaRegistrada = await base44.entities.MensagemWhatsapp.filter({
          empresa_id: connection.empresa_id,
          whatsapp_message_id: wamidFromMe
        }, '-created_date', 1);
        if (jaRegistrada && jaRegistrada.length > 0) {
          console.log('ℹ️ Mensagem própria já registrada (enviada via CRM):', wamidFromMe);
          return;
        }
      }
      await processarMensagemEnviadaPeloCelular(base44, connection, data, telefoneFromMe, wamidFromMe);
      return;
    }

    // Na D-API, data.from é um objeto. O telefone está em data.from.jid.
    const remoteJid = data?.from?.jid || data?.key?.remoteJid || data?.chatId || data?.jid || '';

    const telefone = String(remoteJid).replace(/@.*/g, '').replace(/\D/g, '');

    if (!telefone) {
      console.error('❌ Não foi possível extrair o telefone:', JSON.stringify(data, null, 2));
      return;
    }

    const nomeContato =
      data?.from_name ||
      data?.from?.name ||
      data?.pushName ||
      data?.notifyName ||
      data?.senderName ||
      telefone;

    const empresaId = connection.empresa_id;

    let tipo_conteudo = data?.type || 'text';
    let texto = typeof data?.message === 'string' ? data.message : '';

    let arquivo_url = data?.media_url || data?.media_data?.url || null;

    const mapaTipos = {
      text: 'texto',
      image: 'imagem',
      video: 'video',
      audio: 'audio',
      document: 'documento',
      sticker: 'figurinha',
      contact: 'contato',
      location: 'localizacao',
      reaction: 'reacao',
      poll_update: 'enquete',
      list_response: 'resposta_lista',
      template_button_reply: 'resposta_botao',
      list: 'lista',
      carousel: 'carrossel',
      nativeflow: 'fluxo'
    };

    tipo_conteudo = mapaTipos[tipo_conteudo] || tipo_conteudo;

    if (!texto) {
      texto =
        data?.media_data?.caption ||
        data?.body ||
        (tipo_conteudo === 'audio' ? 'Áudio'
          : tipo_conteudo === 'imagem' ? 'Imagem'
          : tipo_conteudo === 'video' ? 'Vídeo'
          : tipo_conteudo === 'documento' ? (data?.media_data?.filename || 'Documento')
          : tipo_conteudo === 'figurinha' ? 'Figurinha'
          : tipo_conteudo === 'localizacao' ? 'Localização'
          : tipo_conteudo === 'contato' ? 'Contato'
          : tipo_conteudo === 'reacao' ? (data?.data?.reaction_text || 'Reação')
          : 'Mensagem');
    }

    console.log('✅ Dados extraídos:', { telefone, nomeContato, tipo_conteudo, texto, arquivo_url });

    // Buscar conversa existente
    let conversas = await base44.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone
    }, '-created_date', 1);

    let conversa;

    if (conversas && conversas.length > 0) {
      conversa = conversas[0];

      // Canal de ENVIO travado manualmente pelo usuário (seletor do chat) — não sobrescrever.
      const canalTravadoDapi = conversa.locked_provider === true;

      const atualizarConversa = {
        cliente_nome: nomeContato,
        last_inbound_provider: 'dapi',
        cliente_respondeu: true
      };

      if (!canalTravadoDapi) {
        atualizarConversa.provider = 'dapi';
        atualizarConversa.canal_origem = 'dapi';
        atualizarConversa.instancia = connection.session_id;
      } else {
        console.log(`🔒 Canal travado manualmente (${conversa.provider || conversa.canal_origem}) — não sobrescrevendo canal de envio para conversa ${conversa.id}`);
      }

      if (conversa.status === 'campanha') {
        atualizarConversa.status = 'ativa';
        atualizarConversa.data_primeira_resposta = conversa.data_primeira_resposta || new Date().toISOString();
        atualizarConversa.tipo_conexao = 'usuario';
      } else if (conversa.status === 'encerrada') {
        // Conversa finalizada e cliente mandou mensagem: reabrir e colocar em "Esperando"
        atualizarConversa.status = 'ativa';
        atualizarConversa.responsavel_id = null;
        atualizarConversa.responsavel_expira_em = null;
      }

      await base44.entities.ConversaWhatsapp.update(conversa.id, atualizarConversa);
    } else {
      conversa = await base44.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_telefone: telefone,
        cliente_nome: nomeContato,
        whatsapp_id: remoteJid,
        status: 'ativa',
        tipo_conexao: 'usuario',
        provider: 'dapi',
        canal_origem: 'dapi',
        instancia: connection.session_id,
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        ultimo_remetente: 'cliente',
        last_inbound_provider: 'dapi',
        cliente_respondeu: true,
        data_primeira_resposta: new Date().toISOString()
      });
    }

    const whatsappMessageId = data?.id || data?.key?.id || `dapi_in_${Date.now()}`;

    // Evitar duplicação caso o webhook seja reenviado
    const mensagensExistentes = await base44.entities.MensagemWhatsapp.filter({
      empresa_id: empresaId,
      whatsapp_message_id: whatsappMessageId
    }, '-created_date', 1);

    if (mensagensExistentes && mensagensExistentes.length > 0) {
      console.log('ℹ️ Mensagem D-API já registrada:', whatsappMessageId);
      return;
    }

    await base44.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'cliente',
      tipo_conteudo,
      texto,
      arquivo_url,
      provider: 'dapi',
      whatsapp_message_id: whatsappMessageId,
      data_envio: data?.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
      status: 'entregue'
    });

    await base44.entities.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: String(texto).substring(0, 200),
      data_ultima_mensagem: data?.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
      ultimo_remetente: 'cliente',
      cliente_nome: nomeContato,
      provider: 'dapi',
      canal_origem: 'dapi',
      instancia: connection.session_id,
      last_inbound_provider: 'dapi',
      cliente_respondeu: true
    });

    console.log('✅ Mensagem D-API salva com sucesso:', { conversaId: conversa.id, whatsappMessageId, telefone, texto });
  } catch (error) {
    console.error('❌ Erro ao processar mensagem D-API:', error?.message, error?.stack);
    throw error;
  }
}

// Salva mensagem enviada diretamente pelo celular (fora do CRM) no histórico como "vendedor"
// IMPORTANTE: para mensagens fromMe, o telefone/JID do contato deve ser extraído de "data.to"
// (ou key.remoteJid), pois "data.from" representa o próprio número que enviou.
async function processarMensagemEnviadaPeloCelular(base44, connection, data, telefone, wamid) {
  try {
    const empresaId = connection.empresa_id;

    let tipo_conteudo = data?.type || 'text';
    let texto = typeof data?.message === 'string' ? data.message : '';
    let arquivo_url = data?.media_url || data?.media_data?.url || null;
    const mapaTipos = { text: 'texto', image: 'imagem', video: 'video', audio: 'audio', document: 'documento', sticker: 'figurinha', contact: 'contato', location: 'localizacao' };
    tipo_conteudo = mapaTipos[tipo_conteudo] || tipo_conteudo;
    if (!texto) {
      texto = data?.media_data?.caption || data?.body || (tipo_conteudo === 'audio' ? 'Áudio' : tipo_conteudo === 'imagem' ? 'Imagem' : tipo_conteudo === 'video' ? 'Vídeo' : tipo_conteudo === 'documento' ? (data?.media_data?.filename || 'Documento') : 'Mensagem');
    }

    const conversas = await base44.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone
    }, '-created_date', 1);

    const timestamp = data?.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString();
    let conversa;
    if (conversas && conversas.length > 0) {
      conversa = conversas[0];
    } else {
      const nomeContato = data?.to?.name || data?.name || telefone;
      conversa = await base44.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_telefone: telefone,
        cliente_nome: nomeContato,
        whatsapp_id: data?.to?.jid || data?.key?.remoteJid || data?.chatId || data?.jid || '',
        provider: 'dapi',
        canal_origem: 'dapi',
        tipo_conexao: 'usuario',
        instancia: connection.session_id,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: timestamp,
        ultimo_remetente: 'vendedor'
      });
      console.log('✅ Conversa criada a partir de mensagem enviada pelo celular:', conversa.id);
    }

    await base44.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'vendedor',
      tipo_conteudo,
      texto,
      arquivo_url,
      provider: 'dapi',
      whatsapp_message_id: wamid || `dapi_out_phone_${Date.now()}`,
      data_envio: timestamp,
      status: 'enviada'
    });

    // Responder pelo WhatsApp normal (celular) também move o cliente para "Em atendimento"
    const expiraAtendimento = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await base44.entities.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: String(texto).substring(0, 200),
      data_ultima_mensagem: timestamp,
      ultimo_remetente: 'vendedor',
      responsavel_id: conversa.responsavel_id || 'whatsapp_celular',
      responsavel_nome: conversa.responsavel_nome || connection.profile_name || 'Atendente (WhatsApp)',
      responsavel_expira_em: expiraAtendimento,
    });

    console.log('✅ Mensagem enviada pelo celular salva no histórico:', { conversaId: conversa.id, wamid, telefone });
  } catch (error) {
    console.error('❌ Erro ao processar mensagem enviada pelo celular:', error?.message);
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
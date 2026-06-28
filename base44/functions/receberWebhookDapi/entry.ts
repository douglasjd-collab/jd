import { createClient } from 'npm:@base44/sdk@0.8.31';

/**
 * Webhook D-API - Recebe eventos de conexão em tempo real
 * 
 * Endpoint: POST /functions/receberWebhookDapi
 * 
 * Eventos esperados da D-API:
 * - connection.status - Mudança de status da conexão
 * - connection.qrcode - QR Code gerado/atualizado
 * - logged_out - Sessão deslogada
 * - messages.received - Mensagem recebida
 * - messages.sent - Mensagem enviada
 * 
 * Estrutura do webhook:
 * {
 *   "event": "connection.status",
 *   "sessionId": "CRM JD",
 *   "data": {
 *     "status": "connected",
 *     "phone": "5511999999999",
 *     "profileName": "Nome do Perfil"
 *   },
 *   "timestamp": "2026-06-28T10:00:00Z",
 *   "traceId": "abc123"
 * }
 */

Deno.serve(async (req) => {
  try {
    // Não requer autenticação de usuário - é um webhook público
    // Validação por API Key no header (opcional, configurável na D-API)
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
      traceId
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
        
        if (data.phone || data.phoneNumber) {
          updates.phone_number = data.phone || data.phoneNumber;
        }
        
        if (data.profileName || data.profile_name) {
          updates.profile_name = data.profileName || data.profile_name;
        }
        
        if (data.connectedAt || data.connected_at) {
          updates.last_success_at = data.connectedAt || data.connected_at;
        }
        
        console.log('✅ Status atualizado:', updates.status);
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
        // Mensagem recebida (apenas log)
        console.log('📨 Mensagem recebida:', data);
        break;
        
      case 'messages.sent':
        // Mensagem enviada (apenas log)
        console.log('📤 Mensagem enviada:', data);
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
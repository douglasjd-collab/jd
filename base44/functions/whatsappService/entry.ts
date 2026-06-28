import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Endpoint para operações com WhatsApp Service
 * Ações: healthCheck, createSession, getQr, disconnect, sendMessage
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const isAdmin = ['master', 'super_admin', 'admin'].includes(user.perfil);
    if (!isAdmin) {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }
    
    const payload = await req.json().catch(() => ({}));
    const { connectionId, action, webhookUrl, phoneNumber, text, imageUrl, audioUrl, documentUrl, videoUrl, caption } = payload;
    
    // Buscar conexão
    const connections = await base44.entities.WhatsappConnection.filter({ id: connectionId });
    const connection = connections[0];
    
    if (!connection) {
      return Response.json({ error: 'Connection not found' }, { status: 404 });
    }
    
    // D-API Adapter inline
    const adapter = {
      baseUrl: connection.base_url || 'https://api.d-api.cloud',
      apiKey: connection.api_key_encrypted,
      sessionId: connection.session_id || 'CRM JD',
      
      async request(endpoint, method = 'GET', body = null) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        };
        
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : null
        });
        
        const responseData = await response.json().catch(() => ({}));
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
        }
        
        return responseData;
      },
      
      async healthCheck() {
        const url = `${this.baseUrl}/health`;
        const headers = { 'Authorization': this.apiKey };
        
        const response = await fetch(url, { method: 'GET', headers });
        const responseTime = Date.now();
        
        return {
          success: response.ok,
          status: response.ok ? 'ok' : 'error',
          responseTime
        };
      },
      
      async createSession(webhookUrl) {
        const payload = {
          sessionId: this.sessionId,
          connectionMode: 'qr',
          webhookUrl
        };
        
        return await this.request('/api/v1/sessions', 'POST', payload);
      },
      
      async getQrCode() {
        try {
          const response = await this.request(`/api/v1/sessions/${this.sessionId}/qr`);
          
          if (response.qrCode) {
            return {
              success: true,
              qrCode: response.qrCode,
              base64: response.qrCodeBase64 || response.qrCode
            };
          }
          
          return {
            success: false,
            message: 'QR Code não disponível. Sessão pode estar conectada.'
          };
        } catch (error) {
          return {
            success: false,
            message: error.message
          };
        }
      },
      
      async disconnect() {
        return await this.request(`/api/v1/sessions/${this.sessionId}/disconnect`, 'POST');
      },
      
      async sendText(phoneNumber, text) {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const payload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          text
        };
        
        return await this.request('/api/v1/messages/send/text', 'POST', payload);
      },
      
      async sendImage(phoneNumber, imageUrl, caption = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const payload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          image_url: imageUrl,
          caption
        };
        
        return await this.request('/api/v1/messages/send/image', 'POST', payload);
      },
      
      async sendAudio(phoneNumber, audioUrl) {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const payload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          audio_url: audioUrl
        };
        
        return await this.request('/api/v1/messages/send/audio', 'POST', payload);
      },
      
      async sendDocument(phoneNumber, documentUrl, caption = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const payload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          document_url: documentUrl,
          caption
        };
        
        return await this.request('/api/v1/messages/send/document', 'POST', payload);
      },
      
      async sendVideo(phoneNumber, videoUrl, caption = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const payload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          video_url: videoUrl,
          caption
        };
        
        return await this.request('/api/v1/messages/send/video', 'POST', payload);
      },
      
      async getStatus() {
        try {
          const response = await this.request(`/api/v1/sessions/${this.sessionId}/status`);
          return {
            connected: response.connected || false,
            status: response.connected ? 'conectado' : 'desconectado',
            data: response
          };
        } catch (error) {
          return {
            connected: false,
            status: 'erro',
            error: error.message
          };
        }
      }
    };
    
    // Executar ação
    let result;
    
    switch (action) {
      case 'healthCheck':
        result = await adapter.healthCheck();
        break;
        
      case 'createSession':
        if (!webhookUrl) {
          return Response.json({ error: 'webhookUrl required' }, { status: 400 });
        }
        result = await adapter.createSession(webhookUrl);
        break;
        
      case 'getQr':
        result = await adapter.getQrCode();
        break;
        
      case 'disconnect':
        result = await adapter.disconnect();
        break;
        
      case 'sendText':
        if (!phoneNumber || !text) {
          return Response.json({ error: 'phoneNumber and text required' }, { status: 400 });
        }
        result = await adapter.sendText(phoneNumber, text);
        break;
        
      case 'sendImage':
        if (!phoneNumber || !imageUrl) {
          return Response.json({ error: 'phoneNumber and imageUrl required' }, { status: 400 });
        }
        result = await adapter.sendImage(phoneNumber, imageUrl, caption);
        break;
        
      case 'sendAudio':
        if (!phoneNumber || !audioUrl) {
          return Response.json({ error: 'phoneNumber and audioUrl required' }, { status: 400 });
        }
        result = await adapter.sendAudio(phoneNumber, audioUrl);
        break;
        
      case 'sendDocument':
        if (!phoneNumber || !documentUrl) {
          return Response.json({ error: 'phoneNumber and documentUrl required' }, { status: 400 });
        }
        result = await adapter.sendDocument(phoneNumber, documentUrl, caption);
        break;
        
      case 'sendVideo':
        if (!phoneNumber || !videoUrl) {
          return Response.json({ error: 'phoneNumber and videoUrl required' }, { status: 400 });
        }
        result = await adapter.sendVideo(phoneNumber, videoUrl, caption);
        break;
        
      case 'getStatus':
        result = await adapter.getStatus();
        break;
        
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
    
    // Log da operação
    try {
      await base44.entities.WhatsappConnectionLog.create({
        empresa_id: connection.empresa_id,
        connection_id: connection.id,
        event_type: action === 'healthCheck' ? 'health.check' : 'api.call',
        direction: 'outbound',
        payload_json: JSON.stringify({ action, ...payload }),
        response_json: JSON.stringify(result),
        error_message: result.error || null,
        response_time_ms: Date.now(),
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('Erro ao logar:', e);
    }
    
    return Response.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Erro whatsappService:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});
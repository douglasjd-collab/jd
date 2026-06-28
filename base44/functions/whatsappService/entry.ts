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
        const startTime = Date.now();
        const url = `${this.baseUrl}/health`;
        const headers = { 'Authorization': this.apiKey };
        
        try {
          const response = await fetch(url, { method: 'GET', headers });
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          return {
            success: response.ok,
            status: response.ok ? 'ok' : 'error',
            responseTime,
            httpStatus: response.status,
            responseData,
            endpoint: url
          };
        } catch (error) {
          return {
            success: false,
            status: 'error',
            error: error.message,
            endpoint: url,
            responseTime: Date.now() - startTime
          };
        }
      },
      
      async createSession(webhookUrl) {
        const startTime = Date.now();
        
        // Primeiro, verificar se a sessão já existe
        try {
          const statusResponse = await fetch(`${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}/status`, {
            method: 'GET',
            headers: { 'Authorization': this.apiKey }
          });
          
          // Se a sessão existe e está conectada, retornar sucesso
          if (statusResponse.ok) {
            const statusData = await statusResponse.json().catch(() => ({}));
            return {
              success: true,
              message: 'Sessão já existe',
              exists: true,
              status: statusData,
              responseTime: Date.now() - startTime
            };
          }
        } catch (error) {
          // Sessão não existe, vamos criar
          console.log('Sessão não existe, criando nova sessão');
        }
        
        // Criar nova sessão
        const payload = {
          sessionId: this.sessionId,
          connectionMode: 'qr',
          webhookUrl
        };
        
        const url = `${this.baseUrl}/api/v1/sessions`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        const responseData = await response.json().catch(() => ({}));
        const responseTime = Date.now() - startTime;
        
        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
            endpoint: url,
            payload,
            responseData,
            responseTime
          };
        }
        
        return {
          success: true,
          message: 'Sessão criada com sucesso',
          exists: false,
          data: responseData,
          responseTime
        };
      },
      
      async getQrCode() {
        const startTime = Date.now();
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}/qr?image=1`;
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this.apiKey }
          });
          
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
              endpoint: url,
              responseData,
              responseTime
            };
          }
          
          // D-API retorna o QR Code em diferentes formatos
          const qrCodeBase64 = responseData.qrCodeBase64 || responseData.qrCode || responseData.base64 || responseData.image;
          const qrCodeText = responseData.qrCode || responseData.text;
          
          if (qrCodeBase64 || qrCodeText) {
            return {
              success: true,
              qrCode: qrCodeText,
              base64: qrCodeBase64,
              responseTime,
              endpoint: url,
              responseData
            };
          }
          
          return {
            success: false,
            message: 'QR Code não disponível. Sessão pode estar conectada ou expirada.',
            responseData,
            responseTime
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            endpoint: url,
            responseTime: Date.now() - startTime
          };
        }
      },
      
      async disconnect() {
        const startTime = Date.now();
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}/disconnect`;
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': this.apiKey }
          });
          
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
              endpoint: url,
              responseData,
              responseTime
            };
          }
          
          return {
            success: true,
            message: 'Sessão desconectada com sucesso',
            data: responseData,
            responseTime
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            endpoint: url,
            responseTime: Date.now() - startTime
          };
        }
      },
      
      async reconnect() {
        const startTime = Date.now();
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}/reconnect`;
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': this.apiKey }
          });
          
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
              endpoint: url,
              responseData,
              responseTime
            };
          }
          
          return {
            success: true,
            message: 'Sessão reconectando',
            data: responseData,
            responseTime
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            endpoint: url,
            responseTime: Date.now() - startTime
          };
        }
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
        const startTime = Date.now();
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}/status`;
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this.apiKey }
          });
          
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          // Log completo da resposta (para diagnóstico)
          const logData = {
            endpoint: url,
            httpStatus: response.status,
            responseData,
            timestamp: new Date().toISOString()
          };
          console.log('D-API Status Response:', logData);
          
          // Salvar log no banco (opcional - para auditoria)
          try {
            await base44.entities.WhatsappConnectionLog.create({
              empresa_id: connection.empresa_id,
              connection_id: connectionId,
              event_type: 'api.call',
              direction: 'outbound',
              payload_json: JSON.stringify({ action: 'getStatus', sessionId: this.sessionId }),
              response_json: JSON.stringify(logData),
              response_time_ms: responseTime,
              created_at: new Date().toISOString()
            });
          } catch (logError) {
            console.error('Erro ao salvar log:', logError.message);
          }
          
          if (!response.ok) {
            return {
              connected: false,
              status: 'api_offline',
              error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
              endpoint: url,
              httpStatus: response.status,
              responseData,
              responseTime
            };
          }
          
          // Função normalizadora de status da D-API
          const normalizeStatus = (rawStatus, connected) => {
            const statusLower = (rawStatus || '').toLowerCase();
            
            // Status conectado
            if (connected === true || 
                ['connected', 'open', 'online', 'logged', 'authenticated'].includes(statusLower)) {
              return 'conectado';
            }
            
            // Status aguardando QR
            if (['qr', 'qrcode', 'pairing', 'pending', 'waiting_qr', 'waiting_for_qr'].includes(statusLower)) {
              return 'aguardando_qr';
            }
            
            // Status conectando
            if (['connecting', 'starting', 'loading'].includes(statusLower)) {
              return 'reiniciando';
            }
            
            // Status desconectado
            if (['disconnected', 'close', 'closed', 'offline', 'logged_out'].includes(statusLower)) {
              return 'desconectado';
            }
            
            // Status erro
            if (['error', 'failed'].includes(statusLower)) {
              return 'erro_recebimento';
            }
            
            // Default: desconectado
            return 'desconectado';
          };
          
          // Extrair status bruto da resposta
          const rawStatus = responseData.status || responseData.state || responseData.connectionStatus || 'unknown';
          const isConnected = responseData.connected === true || 
                             rawStatus === 'connected' || 
                             rawStatus === 'open' ||
                             rawStatus === 'online';
          
          // Normalizar status
          const crmStatus = normalizeStatus(rawStatus, isConnected);
          
          // Extrair dados adicionais
          const phoneNumber = responseData.phoneNumber || responseData.phone || responseData.phone_number || null;
          const profileName = responseData.profileName || responseData.profile_name || responseData.name || null;
          const errorMessage = responseData.error || responseData.message || responseData.error_message || null;
          
          return {
            connected: isConnected,
            status: crmStatus,
            dapiStatus: rawStatus,
            phoneNumber,
            profileName,
            errorMessage,
            data: responseData,
            responseTime,
            endpoint: url,
            httpStatus: response.status
          };
        } catch (error) {
          console.error('Erro ao buscar status D-API:', error);
          return {
            connected: false,
            status: 'api_offline',
            error: error.message,
            endpoint: url,
            httpStatus: 0,
            responseData: { error: error.message },
            responseTime: Date.now() - startTime
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
        
      case 'reconnect':
        result = await adapter.reconnect();
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
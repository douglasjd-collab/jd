import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * WhatsApp Service - D-API Official Integration
 * 
 * Endpoints oficiais conforme documentação:
 * - Base URL: https://api.d-api.cloud
 * - Auth: Header Authorization com API Key
 * - Docs: https://docs.d-api.cloud/api-reference/introduction
 * 
 * Endpoints utilizados:
 * - POST /api/v1/sessions - Criar sessão
 * - GET /api/v1/sessions/{sessionId} - Obter status da sessão
 * - GET /api/v1/sessions/{sessionId}/qr - Obter QR Code
 * - POST /api/v1/sessions/{sessionId}/disconnect - Desconectar
 * - POST /api/v1/sessions/{sessionId}/reconnect - Reconectar
 * - POST /api/v1/messages/send/text - Enviar texto
 * - POST /api/v1/messages/send/image - Enviar imagem
 * - POST /api/v1/messages/send/audio - Enviar áudio
 * - POST /api/v1/messages/send/document - Enviar documento
 * - POST /api/v1/messages/send/video - Enviar vídeo
 * - GET /health - Health check da API
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
    
    // D-API Adapter - endpoints oficiais
    const adapter = {
      baseUrl: connection.base_url || 'https://api.d-api.cloud',
      apiKey: connection.api_key_encrypted,
      sessionId: connection.session_id || 'CRM JD',
      
      // Request genérico com tratamento de erro padrão
      async request(endpoint, method = 'GET', body = null) {
        const url = `${this.baseUrl}${endpoint}`;
        const startTime = Date.now();
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
        const responseTime = Date.now() - startTime;
        
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
          error.status = response.status;
          error.data = responseData;
          error.endpoint = endpoint;
          error.traceId = responseData.traceId;
          throw error;
        }
        
        return {
          success: true,
          data: responseData,
          responseTime,
          endpoint: url,
          httpStatus: response.status,
          traceId: responseData.traceId
        };
      },
      
      // Health check da API
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
      
      // Criar sessão - POST /api/v1/sessions
      async createSession(webhookUrl) {
        const startTime = Date.now();
        
        // Primeiro verificar se sessão existe usando endpoint oficial
        try {
          const sessionResponse = await fetch(`${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}`, {
            method: 'GET',
            headers: { 'Authorization': this.apiKey }
          });
          
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json().catch(() => ({}));
            return {
              success: true,
              message: 'Sessão já existe',
              exists: true,
              status: this.normalizeStatus(sessionData),
              data: sessionData,
              responseTime: Date.now() - startTime
            };
          }
        } catch (error) {
          console.log('Sessão não existe, criando nova sessão');
        }
        
        // Criar nova sessão conforme documentação oficial
        const sessionPayload = {
          sessionId: this.sessionId,
          type: 'unofficial',
          connectionMode: 'qr',
          provider: 'whatsmeow',
          webhookUrl: webhookUrl || undefined
        };
        
        return await this.request('/api/v1/sessions', 'POST', sessionPayload);
      },
      
      // Obter QR Code - GET /api/v1/sessions/{sessionId}/qr
      async getQrCode() {
        const startTime = Date.now();
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}/qr`;
        
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
              responseTime,
              httpStatus: response.status,
              traceId: responseData.traceId
            };
          }
          
          // Extrair QR Code conforme formato oficial da D-API
          const qrCodeBase64 = responseData.qrCodeImage || responseData.qrCodeBase64 || responseData.qrCode || responseData.base64 || responseData.image;
          const qrCodeText = responseData.qrCode || responseData.text;
          const status = responseData.status;
          
          return {
            success: true,
            qrCode: qrCodeText,
            base64: qrCodeBase64,
            status: status,
            qrCodeUpdatedAt: responseData.qrCodeUpdatedAt,
            responseTime,
            endpoint: url,
            httpStatus: response.status,
            traceId: responseData.traceId,
            data: responseData
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
      
      // Desconectar sessão - POST /api/v1/sessions/{sessionId}/disconnect
      async disconnect() {
        return await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionId)}/disconnect`, 'POST');
      },
      
      // Reconectar sessão - POST /api/v1/sessions/{sessionId}/reconnect
      async reconnect() {
        return await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionId)}/reconnect`, 'POST');
      },
      
      // Enviar texto - POST /api/v1/messages/send/text
      async sendText(phoneNumber, text) {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          text: text
        };
        
        return await this.request('/api/v1/messages/send/text', 'POST', messagePayload);
      },
      
      // Enviar imagem - POST /api/v1/messages/send/image
      async sendImage(phoneNumber, imageUrl, caption = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          image_url: imageUrl,
          caption: caption
        };
        
        return await this.request('/api/v1/messages/send/image', 'POST', messagePayload);
      },
      
      // Enviar áudio - POST /api/v1/messages/send/audio
      async sendAudio(phoneNumber, audioUrl) {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          audio_url: audioUrl
        };
        
        return await this.request('/api/v1/messages/send/audio', 'POST', messagePayload);
      },
      
      // Enviar documento - POST /api/v1/messages/send/document
      async sendDocument(phoneNumber, documentUrl, caption = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          document_url: documentUrl,
          caption: caption
        };
        
        return await this.request('/api/v1/messages/send/document', 'POST', messagePayload);
      },
      
      // Enviar vídeo - POST /api/v1/messages/send/video
      async sendVideo(phoneNumber, videoUrl, caption = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          video_url: videoUrl,
          caption: caption
        };
        
        return await this.request('/api/v1/messages/send/video', 'POST', messagePayload);
      },
      
      // Obter status da sessão - GET /api/v1/sessions/{sessionId}
      async getStatus() {
        const startTime = Date.now();
        
        // Normalizar status da D-API para status do CRM
        const normalizeStatus = (data) => {
          if (!data) return 'desconectado';
          
          const rawStatus = (data.status || data.state || data.connectionStatus || data.data?.status || '').toLowerCase();
          const connected = data.connected === true || data.data?.connected === true;
          
          // Status conectado
          if (connected === true || ['connected', 'open', 'online', 'logged', 'authenticated'].includes(rawStatus)) {
            return 'conectado';
          }
          
          // Status aguardando QR
          if (['qr', 'qrcode', 'pairing', 'pending', 'waiting_qr', 'waiting_for_qr'].includes(rawStatus)) {
            return 'aguardando_qr';
          }
          
          // Status conectando
          if (['connecting', 'starting', 'loading'].includes(rawStatus)) {
            return 'reiniciando';
          }
          
          // Status desconectado
          if (['disconnected', 'close', 'closed', 'offline', 'logged_out'].includes(rawStatus)) {
            return 'desconectado';
          }
          
          // Status erro
          if (['error', 'failed'].includes(rawStatus)) {
            return 'erro_recebimento';
          }
          
          return 'desconectado';
        };
        
        // Extrair dados da sessão
        const extractData = (data) => {
          if (!data) return {};
          
          return {
            phoneNumber: data.phoneNumber || data.phone || data.phone_number || data.data?.phoneNumber,
            profileName: data.profileName || data.profile_name || data.name || data.data?.profileName,
            errorMessage: data.error || data.message || data.error_message || data.data?.error
          };
        };
        
        // Tentativa 1: GET /api/v1/sessions/{sessionId} (endpoint oficial)
        const trySessionEndpoint = async () => {
          const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}`;
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Authorization': this.apiKey }
            });
            
            const responseData = await response.json().catch(() => ({}));
            const responseTime = Date.now() - startTime;
            
            if (response.ok) {
              const crmStatus = normalizeStatus(responseData);
              const extraData = extractData(responseData);
              
              return {
                success: true,
                attempt: 1,
                endpoint: url,
                httpStatus: response.status,
                connected: crmStatus === 'conectado',
                status: crmStatus,
                dapiStatus: responseData.status || responseData.state || 'unknown',
                phoneNumber: extraData.phoneNumber,
                profileName: extraData.profileName,
                errorMessage: extraData.errorMessage,
                data: responseData,
                responseTime,
                traceId: responseData.traceId
              };
            }
            
            return {
              success: false,
              attempt: 1,
              endpoint: url,
              httpStatus: response.status,
              error: `HTTP ${response.status}`,
              traceId: responseData.traceId,
              responseData,
              responseTime
            };
          } catch (error) {
            return {
              success: false,
              attempt: 1,
              endpoint: url,
              httpStatus: 0,
              error: error.message,
              responseTime: Date.now() - startTime
            };
          }
        };
        
        // Tentativa 2: GET /api/v1/sessions (listar todas)
        const trySessionsListEndpoint = async () => {
          const url = `${this.baseUrl}/api/v1/sessions`;
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Authorization': this.apiKey }
            });
            
            const responseData = await response.json().catch(() => ({}));
            const responseTime = Date.now() - startTime;
            
            if (response.ok) {
              const sessions = Array.isArray(responseData) ? responseData : 
                               Array.isArray(responseData.sessions) ? responseData.sessions :
                               Array.isArray(responseData.data) ? responseData.data : [responseData];
              
              const session = sessions.find(s => 
                s.sessionId === this.sessionId || 
                s.id === this.sessionId || 
                s.name === this.sessionId
              );
              
              if (session) {
                const crmStatus = normalizeStatus(session);
                const extraData = extractData(session);
                
                return {
                  success: true,
                  attempt: 2,
                  endpoint: url,
                  httpStatus: response.status,
                  connected: crmStatus === 'conectado',
                  status: crmStatus,
                  dapiStatus: session.status || session.state || 'unknown',
                  phoneNumber: extraData.phoneNumber,
                  profileName: extraData.profileName,
                  errorMessage: extraData.errorMessage,
                  data: session,
                  responseTime,
                  traceId: session.traceId
                };
              }
              
              return {
                success: false,
                attempt: 2,
                endpoint: url,
                httpStatus: response.status,
                error: `Sessão "${this.sessionId}" não encontrada`,
                responseData,
                responseTime
              };
            }
            
            return {
              success: false,
              attempt: 2,
              endpoint: url,
              httpStatus: response.status,
              error: `HTTP ${response.status}`,
              traceId: responseData.traceId,
              responseData,
              responseTime
            };
          } catch (error) {
            return {
              success: false,
              attempt: 2,
              endpoint: url,
              httpStatus: 0,
              error: error.message,
              responseTime: Date.now() - startTime
            };
          }
        };
        
        // Tentativa 3: GET /health (fallback)
        const tryHealthEndpoint = async () => {
          const url = `${this.baseUrl}/health`;
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Authorization': this.apiKey }
            });
            
            const responseData = await response.json().catch(() => ({}));
            const responseTime = Date.now() - startTime;
            
            return {
              success: response.ok,
              attempt: 3,
              endpoint: url,
              httpStatus: response.status,
              connected: false,
              status: response.ok ? 'api_online_session_unknown' : 'api_offline',
              dapiStatus: response.ok ? 'ok' : 'error',
              errorMessage: response.ok ? 'API online, sessão não encontrada' : `HTTP ${response.status}`,
              data: responseData,
              responseTime,
              traceId: responseData.traceId
            };
          } catch (error) {
            return {
              success: false,
              attempt: 3,
              endpoint: url,
              httpStatus: 0,
              error: error.message,
              responseTime: Date.now() - startTime
            };
          }
        };
        
        // Executar tentativas em sequência
        const attempt1 = await trySessionEndpoint();
        if (attempt1.success) return attempt1;
        
        const attempt2 = await trySessionsListEndpoint();
        if (attempt2.success) return attempt2;
        
        return await tryHealthEndpoint();
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
        response_time_ms: result.responseTime || Date.now(),
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
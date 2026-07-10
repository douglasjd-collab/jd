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
    const { connectionId, action, webhookUrl, phoneNumber, text, imageUrl, audioUrl, documentUrl, videoUrl, caption, fileName } = payload;
    
    // Buscar conexão
    const connections = await base44.entities.WhatsappConnection.filter({ id: connectionId });
    const connection = connections[0];
    
    if (!connection) {
      return Response.json({ error: 'Connection not found' }, { status: 404 });
    }
    
    // D-API Adapter - endpoints oficiais
    // Descriptografar API Key (armazenada em base64)
    let apiKeyDecrypted = connection.api_key_encrypted;
    try {
      // Tentar descriptografar se estiver em base64
      const decoded = atob(connection.api_key_encrypted);
      // Validar se é UUID válido (36 chars, formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      if (decoded && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
        apiKeyDecrypted = decoded.trim();
        console.log('✅ API Key descriptografada com sucesso');
      } else {
        // Se não for UUID válido, usar o valor original (pode já estar em texto claro)
        apiKeyDecrypted = connection.api_key_encrypted.trim();
        console.log('ℹ️ API Key não parece estar em base64, usando valor original');
      }
    } catch (error) {
      // Se falhar descriptografia, usar valor original
      apiKeyDecrypted = connection.api_key_encrypted.trim();
      console.log('⚠️ Erro ao descriptografar API Key, usando valor original:', error.message);
    }
    
    // Logs seguros para diagnóstico
    const apiKeyLength = apiKeyDecrypted.length;
    const apiKeyLast4 = apiKeyDecrypted.substring(apiKeyDecrypted.length - 4);
    const apiKeyHasSpaces = apiKeyDecrypted.includes(' ');
    const authorizationHeaderMasked = `****${apiKeyLast4}`;
    
    console.log('🔐 Diagnóstico API Key:', {
      api_key_length: apiKeyLength,
      api_key_last4: apiKeyLast4,
      api_key_has_spaces: apiKeyHasSpaces,
      authorization_header_masked: authorizationHeaderMasked
    });
    
    const adapter = {
      baseUrl: connection.base_url || 'https://api.d-api.cloud',
      apiKey: apiKeyDecrypted,
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
          return {
            success: false,
            error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
            data: responseData,
            responseTime,
            endpoint: url,
            httpStatus: response.status,
            traceId: responseData.traceId
          };
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
      
      // Criar sessão - POST /api/v1/sessions com webhookConfig completo
      async createSession(webhookUrl) {
        const startTime = Date.now();
        
        console.log('🔧 Criando sessão D-API:', {
          sessionId: this.sessionId,
          webhookUrl,
          baseUrl: this.baseUrl
        });
        
        // Primeiro verificar se sessão existe usando endpoint oficial
        try {
          const sessionResponse = await fetch(`${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}`, {
            method: 'GET',
            headers: { 'Authorization': this.apiKey }
          });
          
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json().catch(() => ({}));
            console.log('✅ Sessão já existe:', sessionData);
            return {
              success: true,
              message: 'Sessão já existe',
              exists: true,
              status: sessionData.session?.status || 'unknown',
              data: sessionData,
              responseTime: Date.now() - startTime
            };
          }
        } catch (error) {
          console.log('ℹ️ Sessão não existe, criando nova sessão');
        }
        
        // Criar nova sessão conforme orientação oficial do suporte D-API
        const sessionPayload = {
          sessionId: this.sessionId,
          connectionMode: 'qr',
          webhookUrl: webhookUrl || undefined,
          webhookConfig: {
            enabled: true,
            type: 'single',
            events: {
              'messages.received': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'messages.sent': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'message.read': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'message.delivered': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'message.update': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'message.deleted': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'contacts.upsert': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'contacts.update': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'chats.upsert': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'chats.update': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'logged_out': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'connection.qrcode': {
                enabled: true,
                webhookUrl: webhookUrl
              },
              'connection.status': {
                enabled: true,
                webhookUrl: webhookUrl
              }
            }
          },
          ignoreGroups: true,
          ignoreStatus: true,
          historySync: true
        };
        
        console.log('📦 Payload de criação:', JSON.stringify(sessionPayload, null, 2));
        
        // POST /api/v1/sessions
        const url = `${this.baseUrl}/api/v1/sessions`;
        const headers = {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        };
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(sessionPayload)
          });
          
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          console.log('📡 Resposta D-API:', {
            status: response.status,
            ok: response.ok,
            traceId: responseData.traceId,
            data: responseData
          });
          
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
              endpoint: url,
              httpStatus: response.status,
              traceId: responseData.traceId,
              responseData,
              responseTime,
              payloadSent: sessionPayload
            };
          }
          
          return {
            success: true,
            message: 'Sessão criada com sucesso',
            exists: false,
            data: responseData,
            session: responseData.session,
            responseTime,
            endpoint: url,
            httpStatus: response.status,
            traceId: responseData.traceId,
            payloadSent: sessionPayload
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            endpoint: url,
            responseTime: Date.now() - startTime,
            payloadSent: sessionPayload
          };
        }
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
          image: imageUrl,
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
          audio: audioUrl,
          ptt: true
        };
        
        return await this.request('/api/v1/messages/send/audio', 'POST', messagePayload);
      },
      
      // Enviar documento - POST /api/v1/messages/send/document
      async sendDocument(phoneNumber, documentUrl, caption = '', fileName = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          document: documentUrl,
          caption: caption,
          fileName: fileName || undefined
        };
        
        return await this.request('/api/v1/messages/send/document', 'POST', messagePayload);
      },
      
      // Enviar vídeo - POST /api/v1/messages/send/video
      async sendVideo(phoneNumber, videoUrl, caption = '') {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          video: videoUrl,
          caption: caption
        };
        
        return await this.request('/api/v1/messages/send/video', 'POST', messagePayload);
      },
      
      // Atualizar webhook da sessão - PATCH /api/v1/sessions/{sessionId}
      // Conforme documentação oficial D-API
      async updateWebhook(webhookUrl) {
        const startTime = Date.now();
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}`;
        
        console.log('🔗 Atualizando webhook da sessão:', {
          sessionId: this.sessionId,
          webhookUrl,
          baseUrl: this.baseUrl
        });
        
        // Payload completo com webhookConfig
        const updatePayload = {
          webhookUrl: webhookUrl || undefined,
          webhookConfig: {
            enabled: true,
            type: 'single',
            events: {
              'messages.received': { enabled: true, webhookUrl },
              'messages.sent': { enabled: true, webhookUrl },
              'message.read': { enabled: true, webhookUrl },
              'message.delivered': { enabled: true, webhookUrl },
              'message.update': { enabled: true, webhookUrl },
              'message.deleted': { enabled: true, webhookUrl },
              'contacts.upsert': { enabled: true, webhookUrl },
              'contacts.update': { enabled: true, webhookUrl },
              'chats.upsert': { enabled: true, webhookUrl },
              'chats.update': { enabled: true, webhookUrl },
              'logged_out': { enabled: true, webhookUrl },
              'connection.qrcode': { enabled: true, webhookUrl },
              'connection.status': { enabled: true, webhookUrl }
            }
          },
          ignoreGroups: true,
          ignoreStatus: true,
          historySync: true
        };
        
        console.log('📦 Payload de atualização:', JSON.stringify(updatePayload, null, 2));
        
        const headers = {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        };
        
        try {
          const response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updatePayload)
          });
          
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          console.log('📡 Resposta D-API (update webhook):', {
            status: response.status,
            ok: response.ok,
            traceId: responseData.traceId,
            data: responseData
          });
          
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
              endpoint: url,
              httpStatus: response.status,
              traceId: responseData.traceId,
              responseData,
              responseTime,
              payloadSent: updatePayload
            };
          }
          
          return {
            success: true,
            message: 'Webhook atualizado com sucesso',
            data: responseData,
            session: responseData.session,
            responseTime,
            endpoint: url,
            httpStatus: response.status,
            traceId: responseData.traceId,
            payloadSent: updatePayload
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            endpoint: url,
            responseTime: Date.now() - startTime,
            payloadSent: updatePayload
          };
        }
      },
      
      // Obter status da sessão - GET /api/v1/sessions/{sessionId}
      // Conforme orientação oficial do suporte D-API
      async getStatus() {
        const startTime = Date.now();
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}`;
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this.apiKey }
          });
          
          console.log("=== GET STATUS D-API ===");
          console.log("URL:", url);
          console.log("HTTP Status:", response.status);
          
          const responseText = await response.text();
          console.log("Response Body:", responseText);
          
          let responseData = {};
          try { responseData = JSON.parse(responseText); } catch { responseData = {}; }
          const responseTime = Date.now() - startTime;
          
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
              endpoint: url,
              httpStatus: response.status,
              traceId: responseData.traceId,
              responseData,
              responseTime
            };
          }
          
          // Estrutura oficial da resposta: response.session
          const session = responseData.session || responseData;
          
          // Mapear status conforme orientação do suporte
          const rawStatus = String(
            session.status ||
            responseData.status ||
            responseData.data?.status ||
            responseData.session?.status ||
            responseData.connectionStatus ||
            ''
          ).toLowerCase();
          console.log('STATUS RAW D-API:', rawStatus);
          console.log('RESPONSE STATUS COMPLETA:', JSON.stringify(responseData));
          let crmStatus = 'desconectado';
          
          if (rawStatus === 'connected') {
            crmStatus = 'conectado';
          } else if (rawStatus === 'connecting') {
            crmStatus = 'reiniciando';
          } else if (rawStatus === 'disconnected') {
            crmStatus = 'desconectado';
          } else if (['qr', 'waiting_qr', 'pending'].includes(rawStatus)) {
            crmStatus = 'aguardando_qr';
          } else if (['error', 'failed'].includes(rawStatus)) {
            crmStatus = 'erro_recebimento';
          }
          
          // Extrair dados da sessão conforme estrutura oficial
          // Telefone: session.authData.phone ou session.phone
          const phoneNumber = session.authData?.phone || session.phone || session.phoneNumber || session.phone_number;
          const profileName = session.profileName || session.profile_name || session.name;
          const webhookUrl = (typeof session.webhookUrl === 'string' ? session.webhookUrl : null) ||
            (typeof session.webhook_url === 'string' ? session.webhook_url : null) ||
            session.settings?.webhook?.events?.['messages.received']?.webhookUrl ||
            null;
          const qrCodeImage = session.qrCodeImage || session.qr_code_image || session.qrCodeBase64;
          const qrCode = session.qrCode || session.qr_code;
          const connectedAt = session.connectedAt || session.connected_at;
          
          return {
            success: true,
            endpoint: url,
            httpStatus: response.status,
            connected: crmStatus === 'conectado',
            status: crmStatus,
            dapiStatus: rawStatus || 'unknown',
            phoneNumber,
            profileName,
            webhookUrl,
            qrCodeImage,
            qrCode,
            connectedAt,
            data: responseData,
            session: session,
            responseTime,
            traceId: responseData.traceId
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            endpoint: url,
            httpStatus: 0,
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
        result = await adapter.sendDocument(phoneNumber, documentUrl, caption, fileName);
        break;
        
      case 'sendVideo':
        if (!phoneNumber || !videoUrl) {
          return Response.json({ error: 'phoneNumber and videoUrl required' }, { status: 400 });
        }
        result = await adapter.sendVideo(phoneNumber, videoUrl, caption);
        break;
        
      case 'updateWebhook':
        if (!webhookUrl) {
          return Response.json({ error: 'webhookUrl required' }, { status: 400 });
        }
        result = await adapter.updateWebhook(webhookUrl);
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
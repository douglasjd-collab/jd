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
        
        // Função normalizadora de status da D-API (usada em todos os endpoints)
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
        
        // Extrair status de qualquer estrutura de resposta
        const extractStatus = (data) => {
          if (!data) return { rawStatus: null, connected: null };
          
          // Verificar todos os campos possíveis
          const rawStatus = 
            data.status || 
            data.state || 
            data.connectionStatus || 
            data.session?.status || 
            data.session?.state || 
            data.data?.status || 
            data.data?.state || 
            data.data?.connected;
          
          const connected = 
            data.connected === true || 
            data.session?.connected === true || 
            data.data?.connected === true;
          
          return { rawStatus, connected };
        };
        
        // Extrair dados adicionais de qualquer estrutura
        const extractData = (data) => {
          if (!data) return {};
          
          return {
            phoneNumber: data.phoneNumber || data.phone || data.phone_number || data.session?.phoneNumber || data.data?.phoneNumber,
            profileName: data.profileName || data.profile_name || data.name || data.session?.profileName || data.data?.profileName,
            errorMessage: data.error || data.message || data.error_message || data.data?.error
          };
        };
        
        // Tentativa 1: GET /api/v1/sessions/{sessionId} (endpoint principal alternativo)
        const trySessionEndpoint = async () => {
          const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}`;
          console.log('Tentativa 1:', url);
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Authorization': this.apiKey }
            });
            
            const responseData = await response.json().catch(() => ({}));
            const responseTime = Date.now() - startTime;
            
            console.log('Tentativa 1 - Resultado:', { 
              httpStatus: response.status, 
              ok: response.ok,
              data: responseData 
            });
            
            if (response.ok) {
              const { rawStatus, connected } = extractStatus(responseData);
              const extraData = extractData(responseData);
              const crmStatus = normalizeStatus(rawStatus, connected);
              
              return {
                success: true,
                attempt: 1,
                endpoint: url,
                httpStatus: response.status,
                connected: connected === true || crmStatus === 'conectado',
                status: crmStatus,
                dapiStatus: rawStatus || 'unknown',
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
        
        // Tentativa 2: GET /api/v1/sessions (listar todas e filtrar)
        const trySessionsListEndpoint = async () => {
          const url = `${this.baseUrl}/api/v1/sessions`;
          console.log('Tentativa 2:', url);
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Authorization': this.apiKey }
            });
            
            const responseData = await response.json().catch(() => ({}));
            const responseTime = Date.now() - startTime;
            
            console.log('Tentativa 2 - Resultado:', { 
              httpStatus: response.status, 
              ok: response.ok,
              data: responseData 
            });
            
            if (response.ok) {
              // Buscar sessão pelo sessionId
              const sessions = Array.isArray(responseData) ? responseData : 
                               Array.isArray(responseData.sessions) ? responseData.sessions :
                               Array.isArray(responseData.data) ? responseData.data : [responseData];
              
              const session = sessions.find(s => 
                s.sessionId === this.sessionId || 
                s.id === this.sessionId || 
                s.name === this.sessionId
              );
              
              if (session) {
                const { rawStatus, connected } = extractStatus(session);
                const extraData = extractData(session);
                const crmStatus = normalizeStatus(rawStatus, connected);
                
                return {
                  success: true,
                  attempt: 2,
                  endpoint: url,
                  httpStatus: response.status,
                  connected: connected === true || crmStatus === 'conectado',
                  status: crmStatus,
                  dapiStatus: rawStatus || 'unknown',
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
                error: `Sessão "${this.sessionId}" não encontrada na lista`,
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
        
        // Tentativa 3: GET /health (fallback final)
        const tryHealthEndpoint = async () => {
          const url = `${this.baseUrl}/health`;
          console.log('Tentativa 3:', url);
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Authorization': this.apiKey }
            });
            
            const responseData = await response.json().catch(() => ({}));
            const responseTime = Date.now() - startTime;
            
            console.log('Tentativa 3 - Resultado:', { 
              httpStatus: response.status, 
              ok: response.ok,
              data: responseData 
            });
            
            return {
              success: response.ok,
              attempt: 3,
              endpoint: url,
              httpStatus: response.status,
              connected: false,
              status: response.ok ? 'api_online_session_unknown' : 'api_offline',
              dapiStatus: response.ok ? 'ok' : 'error',
              errorMessage: response.ok ? 'API online, mas sessão não identificada' : `HTTP ${response.status}`,
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
        console.log('=== Iniciando consulta de status com fallback ===');
        
        // Tentativa 1: Endpoint da sessão
        const attempt1 = await trySessionEndpoint();
        if (attempt1.success) {
          console.log('✅ Tentativa 1 bem-sucedida');
          
          // Salvar log
          try {
            await base44.entities.WhatsappConnectionLog.create({
              empresa_id: connection.empresa_id,
              connection_id: connectionId,
              event_type: 'api.call',
              direction: 'outbound',
              payload_json: JSON.stringify({ action: 'getStatus', sessionId: this.sessionId, strategy: 'fallback' }),
              response_json: JSON.stringify({
                endpointUsed: attempt1.endpoint,
                attempts: [1],
                result: attempt1
              }),
              response_time_ms: attempt1.responseTime,
              created_at: new Date().toISOString()
            });
          } catch (logError) {
            console.error('Erro ao salvar log:', logError.message);
          }
          
          return attempt1;
        }
        
        console.log('❌ Tentativa 1 falhou:', attempt1.error);
        
        // Tentativa 2: Listar sessões
        const attempt2 = await trySessionsListEndpoint();
        if (attempt2.success) {
          console.log('✅ Tentativa 2 bem-sucedida');
          
          // Salvar log
          try {
            await base44.entities.WhatsappConnectionLog.create({
              empresa_id: connection.empresa_id,
              connection_id: connectionId,
              event_type: 'api.call',
              direction: 'outbound',
              payload_json: JSON.stringify({ action: 'getStatus', sessionId: this.sessionId, strategy: 'fallback' }),
              response_json: JSON.stringify({
                endpointsAttempted: [attempt1.endpoint, attempt2.endpoint],
                successfulEndpoint: attempt2.endpoint,
                result: attempt2
              }),
              response_time_ms: attempt2.responseTime,
              created_at: new Date().toISOString()
            });
          } catch (logError) {
            console.error('Erro ao salvar log:', logError.message);
          }
          
          return attempt2;
        }
        
        console.log('❌ Tentativa 2 falhou:', attempt2.error);
        
        // Tentativa 3: Health check
        const attempt3 = await tryHealthEndpoint();
        console.log(attempt3.success ? '✅ Tentativa 3 bem-sucedida' : '❌ Tentativa 3 falhou:', attempt3.error);
        
        // Salvar log
        try {
          await base44.entities.WhatsappConnectionLog.create({
            empresa_id: connection.empresa_id,
            connection_id: connectionId,
            event_type: 'api.call',
            direction: 'outbound',
            payload_json: JSON.stringify({ action: 'getStatus', sessionId: this.sessionId, strategy: 'fallback' }),
            response_json: JSON.stringify({
              endpointsAttempted: [attempt1.endpoint, attempt2.endpoint, attempt3.endpoint],
              allAttemptsFailed: true,
              result: attempt3
            }),
            response_time_ms: attempt3.responseTime,
            created_at: new Date().toISOString()
          });
        } catch (logError) {
          console.error('Erro ao salvar log:', logError.message);
        }
        
        return attempt3;
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
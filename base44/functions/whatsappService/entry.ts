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
    const { connectionId, action, webhookUrl, phoneNumber, text, imageUrl, audioUrl, documentUrl, videoUrl, caption, fileName, messageIds, messageId, emoji } = payload;
    
    // Buscar conexão (opcional p/ ação testConnection com dados do form ainda não salvos)
    const connections = connectionId ? await base44.entities.WhatsappConnection.filter({ id: connectionId }) : [];
    const connection = connections[0];
    
    if (!connection && action !== 'testConnection') {
      return Response.json({ error: 'Connection not found' }, { status: 404 });
    }
    
    // D-API Adapter - endpoints oficiais
    // Descriptografar API Key (armazenada em base64) se houver conexão existente
    let apiKeyDecrypted = connection?.api_key_encrypted || '';
    try {
      // Tentar descriptografar se estiver em base64
      const decoded = connection?.api_key_encrypted ? atob(connection.api_key_encrypted) : '';
      // Validar se é UUID válido (36 chars, formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      if (decoded && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
        apiKeyDecrypted = decoded.trim();
        console.log('✅ API Key descriptografada com sucesso');
      } else {
        // Se não for UUID válido, usar o valor original (pode já estar em texto claro)
        apiKeyDecrypted = (connection?.api_key_encrypted || '').trim();
        console.log('ℹ️ API Key não parece estar em base64, usando valor original');
      }
    } catch (error) {
      // Se falhar descriptografia, usar valor original
      apiKeyDecrypted = (connection?.api_key_encrypted || '').trim();
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
    
    // Permite override por payload (usado por testConnection com dados do form ainda não salvos).
    // Saneamento automático: se a URL Base salva tem o padrão do webhook do CRM (não da D-API),
    // corrige para o default https://api.d-api.cloud e avisa. Isso impede o 404 legacy quando o
    // usuário salvou acidentalmente a URL do webhook como base_url.
    let resolvedBaseUrl = ((payload.base_url || connection?.base_url || 'https://api.d-api.cloud') + '').trim();
    if (/\/functions\/(receberWebhookDapi|webhookDapi)/i.test(resolvedBaseUrl) || /\/webhook/i.test(resolvedBaseUrl)) {
      console.log('⚠️ base_url salva parece ser a URL do webhook, não da D-API. Auto-corrigindo para https://api.d-api.cloud');
      resolvedBaseUrl = 'https://api.d-api.cloud';
    }

    const adapter = {
      baseUrl: resolvedBaseUrl,
      apiKey: (payload.api_key && payload.api_key !== '***hidden***') ? String(payload.api_key).trim() : apiKeyDecrypted,
      sessionId: ((payload.session_id || connection?.session_id || '') + '').trim() || 'CRM JD',
      
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
      
      // Enviar reação (emoji) a uma mensagem - POST /api/v1/messages/send/reaction
      // fromMe=false porque reagimos a mensagens RECEBIDAS do cliente (não enviadas por nós)
      async sendReaction(phoneNumber, reactionMessageId, reactionEmoji) {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          messageId: reactionMessageId,
          emoji: reactionEmoji,
          fromMe: false
        };
        return await this.request('/api/v1/messages/send/reaction', 'POST', messagePayload);
      },
      
      // Marcar mensagens como lidas - POST /api/v1/chats/read
      async markAsRead(phoneNumber, messageIds) {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');

        const messagePayload = {
          sessionId: this.sessionId,
          to: normalizedPhone,
          messageIds: messageIds
        };

        return await this.request('/api/v1/chats/read', 'POST', messagePayload);
      },

      // Atualizar webhook da sessão - POST /api/v1/sessions/{sessionId}/webhook-config
      // Endpoint oficial (validado contra OpenAPI da D-API em 2026-07-23): usa o schema
      // completo webhookConfig (mesma estrutura enviada na criação) que popula settings.webhook.
      // O endpoint alternativo /webhook só salva webhookUrl na raiz da sessão e NÃO popula
      // settings.webhook → por isso as mensagens cloud chegam vazias no payload de diagnóstico.
      async updateWebhook(webhookUrl, mode = 'per_event') {
        const startTime = Date.now();
        const endpoint = '/webhook-config'; // popula settings.webhook (estrutura completa)
        const url = `${this.baseUrl}/api/v1/sessions/${encodeURIComponent(this.sessionId)}${endpoint}`;
        
        console.log('🔗 Atualizando webhook da sessão:', {
          sessionId: this.sessionId,
          webhookUrl,
          mode,
          baseUrl: this.baseUrl
        });
        
        // Lista oficial de eventos suportados (constante da documentação D-API)
        const EVENTS = [
          'messages.received', 'messages.sent',
          'message.read', 'message.delivered', 'message.deleted', 'message.update',
          'connection.qrcode', 'connection.paircode', 'connection.status',
          'logged_out',
          'chats.update', 'chats.upsert',
          'contacts.update', 'contacts.upsert',
          'presence',
          'groups_participants.join', 'groups_participants.leave',
          'groups_participants.promote', 'groups_participants.demote',
          'group_participants.join-request',
          'group_participants.join-request.revoked',
          'group_participants.join-request.approved',
          'call.offer', 'call.accepted', 'call.rejected'
        ];
        
        const eventsConfig = {};
        for (const ev of EVENTS) {
          eventsConfig[ev] = { enabled: true, webhookUrl };
        }
        
        // Schema do webhook-config:
        //   enabled: true, type: 'single' (uma URL) ou 'per_event' (URL por evento),
        //   events: { [eventName]: { enabled, webhookUrl } }
        const updatePayload = {
          enabled: true,
          type: mode === 'single' ? 'single' : 'per_event',
          events: eventsConfig
        };
        
        console.log('📦 Payload webhook-config:', JSON.stringify(updatePayload).slice(0, 500) + '...');
        
        const headers = {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        };
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(updatePayload)
          });
          
          const responseData = await response.json().catch(() => ({}));
          const responseTime = Date.now() - startTime;
          
          console.log('📡 Resposta D-API (update webhook-config):', {
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
        
      case 'sendReaction':
        if (!phoneNumber || !messageId || !emoji) {
          return Response.json({ error: 'phoneNumber, messageId and emoji required' }, { status: 400 });
        }
        result = await adapter.sendReaction(phoneNumber, messageId, emoji);
        break;
        
      case 'markAsRead':
        if (!phoneNumber || !messageIds || !messageIds.length) {
          return Response.json({ error: 'phoneNumber and messageIds required' }, { status: 400 });
        }
        result = await adapter.markAsRead(phoneNumber, messageIds);
        break;

      case 'updateWebhook':
        if (!webhookUrl) {
          return Response.json({ error: 'webhookUrl required' }, { status: 400 });
        }
        result = await adapter.updateWebhook(webhookUrl, payload.mode || 'per_event');
        break;
        
      case 'getStatus':
        result = await adapter.getStatus();
        break;
        
      case 'testConnection': {
        // Teste autenticado para validar dados da conexão (form ainda não salvo ou conexão existente).
        // Confirma o identificador (session_id) e o tipo da conexão (Cloud vs Padrão) sem expor a API Key.
        const testBaseUrl = ((payload.base_url || connection?.base_url || '') + '').trim();
        const testSessionId = ((payload.session_id || connection?.session_id || '') + '').trim();
        let testApiKey = apiKeyDecrypted;
        if (payload.api_key && String(payload.api_key).trim() !== '' && payload.api_key !== '***hidden***') {
          testApiKey = String(payload.api_key).trim();
        }
        
        if (!testApiKey) {
          result = { success: false, http_status: 0, error: 'API Key obrigatória para testar a conexão.', endpoint_called: testBaseUrl || '(vazio)', session_id_used: testSessionId, detected_connection_type: null, response_body: {} };
          break;
        }
        if (!testBaseUrl || !/^https?:\/\//i.test(testBaseUrl)) {
          result = { success: false, http_status: 0, error: 'URL Base inválida. Preencha a URL da API da D-API (ex: https://api.d-api.cloud).', endpoint_called: testBaseUrl || '(vazio)', session_id_used: testSessionId, detected_connection_type: null, response_body: {} };
          break;
        }
        // Saneamento crítico — base_url não pode ser a URL do webhook do CRM
        if (/\/functions\/(receberWebhookDapi|webhookDapi)/i.test(testBaseUrl) || /\/webhook/i.test(testBaseUrl)) {
          result = { success: false, http_status: 0, error: 'A URL Base parece ser a URL do webhook do CRM, não da D-API. Use https://api.d-api.cloud.', endpoint_called: testBaseUrl, session_id_used: testSessionId, detected_connection_type: null, response_body: {} };
          break;
        }
        if (!testSessionId || /^CRM\s*JD$/i.test(testSessionId)) {
          result = { success: false, http_status: 0, error: 'Session ID inválido. Use o identificador técnico retornado pela D-API (painel), ex: cloud-ea36bc0e-... — nunca "CRM JD".', endpoint_called: testBaseUrl, session_id_used: testSessionId, detected_connection_type: null, response_body: {} };
          break;
        }
        
        const cleanBaseUrl = testBaseUrl.replace(/\/$/, '');
        const testUrl = `${cleanBaseUrl}/api/v1/sessions/${encodeURIComponent(testSessionId)}`;
        const tStart = Date.now();
        try {
          const r = await fetch(testUrl, { method: 'GET', headers: { 'Authorization': testApiKey, 'Content-Type': 'application/json' } });
          const txt = await r.text();
          let body = {};
          try { body = JSON.parse(txt); } catch {}
          result = {
            success: r.ok,
            http_status: r.status,
            endpoint_called: testUrl,
            session_id_used: testSessionId,
            detected_connection_type: /^cloud-/i.test(testSessionId) ? 'Cloud (Meta Oficial)' : 'Padrão (QR)',
            response_body: body,
            response_time_ms: Date.now() - tStart,
            api_key_last4: testApiKey.slice(-4),
            error: r.ok ? null : `HTTP ${r.status}${body?.message ? ': ' + body.message : ''}`
          };
        } catch (error) {
          result = { success: false, http_status: 0, error: 'Erro de rede ao chamar D-API: ' + error.message, endpoint_called: testUrl, session_id_used: testSessionId, detected_connection_type: null, response_body: {} };
        }
        break;
      }
      
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
    
    // Log da operação (apenas quando há conexão persistida)
    if (connection) {
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
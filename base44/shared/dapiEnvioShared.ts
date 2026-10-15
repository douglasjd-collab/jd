/**
 * Módulo compartilhado de envio direto à D-API.
 *
 * Antes o envio do Bate-Papo passava por uma função intermediária
 * (whatsappService): cada mensagem pagava nova inicialização de runtime,
 * releitura da conexão e um log extra — cerca de 3s de espera antes da
 * confirmação de envio aparecer no chat (a chamada real à D-API leva ~0,5s).
 *
 * Aqui a mesma chamada HTTP é feita direto, com o mesmo endpoint, headers e
 * payload usados pelo whatsappService, e a resposta tem o mesmo formato
 * ({ success, data, error?, httpStatus?, traceId?, responseTime?, endpoint? })
 * para que o tratamento de erro e a leitura do messageId sigam iguais.
 */

const DAPI_ENDPOINTS = {
  sendText: '/api/v1/messages/send/text',
  sendImage: '/api/v1/messages/send/image',
  sendSticker: '/api/v1/messages/send/sticker',
  sendAudio: '/api/v1/messages/send/audio',
  sendDocument: '/api/v1/messages/send/document',
  sendVideo: '/api/v1/messages/send/video',
};

function montarPayloadDapi(action, sessionId, numero, texto, params) {
  const base = { sessionId, to: String(numero || '').replace(/\D/g, '') };
  const ctx = params?.contextInfo ? { contextInfo: params.contextInfo } : {};
  switch (action) {
    case 'sendText':
      return { ...base, text: texto, ...ctx };
    case 'sendImage':
      return { ...base, image: params.imageUrl, caption: params.caption || '', ...ctx };
    case 'sendSticker':
      return { ...base, sticker: params.stickerUrl };
    case 'sendAudio':
      return { ...base, audio: params.audioUrl, ptt: true, ...ctx };
    case 'sendDocument':
      return { ...base, document: params.documentUrl, caption: params.caption || '', fileName: params.fileName || undefined, ...ctx };
    case 'sendVideo':
      return { ...base, video: params.videoUrl, caption: params.caption || '', ...ctx };
    default:
      throw new Error(`Ação D-API desconhecida: ${action}`);
  }
}

// Limite de espera da resposta da D-API. Sem isso, uma resposta que nunca chega
// deixa a chamada pendurada: o atendente fica com "Enviando..." na tela sem saber
// se a mensagem saiu. A D-API responde normalmente em ~1s.
const DAPI_TIMEOUT_MS = 20000;

export async function enviarDapiDireto(conexao, action, numero, texto, params) {
  let baseUrl = String(conexao?.base_url || 'https://api.d-api.cloud').trim();
  if (/\/functions\/(receberWebhookDapi|webhookDapi)/i.test(baseUrl) || /\/webhook/i.test(baseUrl)) {
    baseUrl = 'https://api.d-api.cloud';
  }

  // A API Key é gravada em base64 (UUID) nas conexões D-API.
  let apiKey = String(conexao?.api_key_encrypted || '').trim();
  try {
    const decoded = apiKey ? atob(apiKey) : '';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
      apiKey = decoded.trim();
    }
  } catch (_) {}

  const endpoint = `${baseUrl}${DAPI_ENDPOINTS[action]}`;
  const body = montarPayloadDapi(action, String(conexao?.session_id || '').trim(), numero, texto, params || {});
  const startTime = Date.now();

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DAPI_TIMEOUT_MS),
    });
  } catch (e) {
    const expirou = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return {
      success: false,
      error: expirou
        ? `A D-API não respondeu em ${Math.round(DAPI_TIMEOUT_MS / 1000)}s. A mensagem pode não ter sido enviada — confirme no WhatsApp antes de tentar novamente.`
        : `Falha de conexão com a D-API: ${e?.message || 'erro desconhecido'}`,
      httpStatus: 0,
      responseTime: Date.now() - startTime,
      endpoint,
    };
  }

  const responseData = await response.json().catch(() => ({}));
  const responseTime = Date.now() - startTime;

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
      data: responseData,
      httpStatus: response.status,
      traceId: responseData.traceId,
      responseTime,
      endpoint,
    };
  }

  return {
    success: true,
    data: responseData,
    httpStatus: response.status,
    traceId: responseData.traceId,
    responseTime,
    endpoint,
  };
}
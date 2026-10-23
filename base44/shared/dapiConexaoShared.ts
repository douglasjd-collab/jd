// Resolve as credenciais de uma conexão D-API: URL base, API Key (gravada em
// base64 quando é um UUID) e sessionId técnico.
export function resolverConexaoDapi(conexao: any) {
  let baseUrl = String(conexao?.base_url || 'https://api.d-api.cloud').trim();
  if (/\/functions\/(receberWebhookDapi|webhookDapi)/i.test(baseUrl) || /\/webhook/i.test(baseUrl)) {
    baseUrl = 'https://api.d-api.cloud';
  }

  let apiKey = String(conexao?.api_key_encrypted || '').trim();
  try {
    const decoded = apiKey ? atob(apiKey) : '';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
      apiKey = decoded.trim();
    }
  } catch (_) {
    // mantém a chave como está
  }

  return { baseUrl, apiKey, sessionId: String(conexao?.session_id || '').trim() };
}
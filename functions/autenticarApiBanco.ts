import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { configuracao_id } = await req.json();

  const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({ id: configuracao_id });
  if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
  const config = configs[0];

  const inicio = Date.now();
  let token = null;
  let erro = null;

  try {
    if (config.auth_type === 'OAuth2' || config.auth_type === 'Bearer') {
      // OAuth2: tenta login com client_id/client_secret ou username/password
      let body, url, headers = { 'Content-Type': 'application/json' };

      if (config.client_id && config.client_secret) {
        body = JSON.stringify({ client_id: config.client_id, client_secret: config.client_secret });
        url = `${config.base_url}/oauth/token`;
      } else if (config.username && config.password) {
        body = JSON.stringify({ username: config.username, password: config.password });
        url = `${config.base_url}/auth/login`;
      } else {
        return Response.json({ error: 'Credenciais insuficientes para autenticação' }, { status: 400 });
      }

      const res = await fetch(url, { method: 'POST', headers, body });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

      token = data.access_token || data.token || data.apiKey;
      if (!token) throw new Error('Token não encontrado na resposta');

      // Salva token na configuração
      const expira = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
      await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
        token_atual: token,
        token_expira_em: expira,
        ultimo_erro: null,
      });

    } else if (config.auth_type === 'ApiKey') {
      token = config.api_key;
    } else if (config.auth_type === 'Basic') {
      token = btoa(`${config.username}:${config.password}`);
    }

    // Log de sucesso
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id: config.empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'login',
      sucesso: true,
      executado_em: new Date().toISOString(),
    });

    return Response.json({ success: true, token, tempo_ms: Date.now() - inicio });

  } catch (e) {
    erro = e.message;
    await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, { ultimo_erro: erro });
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id: config.empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'login',
      sucesso: false,
      mensagem_erro: erro,
      executado_em: new Date().toISOString(),
    });
    return Response.json({ success: false, error: erro, tempo_ms: Date.now() - inicio });
  }
});
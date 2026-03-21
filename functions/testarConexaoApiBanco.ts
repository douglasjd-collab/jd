import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { configuracao_id } = await req.json();
  const inicio = Date.now();

  const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({ id: configuracao_id });
  if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
  const config = configs[0];

  try {
    let headers = { 'Content-Type': 'application/json' };

    if (config.auth_type === 'Bearer' && config.token_atual) {
      headers['Authorization'] = `Bearer ${config.token_atual}`;
    } else if (config.auth_type === 'ApiKey' && config.api_key) {
      headers['X-API-Key'] = config.api_key;
    } else if (config.auth_type === 'Basic' && config.username) {
      headers['Authorization'] = `Basic ${btoa(`${config.username}:${config.password}`)}`;
    }

    // Tenta fazer um ping/health na URL base
    const testUrl = `${config.base_url}/health`;
    let res;
    try {
      res = await fetch(testUrl, { method: 'GET', headers });
    } catch {
      // fallback: tenta a URL raiz
      res = await fetch(config.base_url, { method: 'GET', headers });
    }

    const tempo = Date.now() - inicio;
    const sucesso = res.ok || res.status < 500;

    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id: config.empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'consultar_status',
      status_http: res.status,
      sucesso,
      executado_em: new Date().toISOString(),
    });

    return Response.json({ success: sucesso, status_http: res.status, tempo_ms: tempo });

  } catch (e) {
    const tempo = Date.now() - inicio;
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id: config.empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'consultar_status',
      sucesso: false,
      mensagem_erro: e.message,
      executado_em: new Date().toISOString(),
    });
    return Response.json({ success: false, error: e.message, tempo_ms: tempo });
  }
});
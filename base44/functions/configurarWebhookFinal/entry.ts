import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const INSTANCE_NAME = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'PROMOTORAJD';

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({ erro: 'Variáveis não configuradas' }, { status: 500 });
    }

    const baseUrl = EVOLUTION_API_URL.endsWith('/') ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL;
    const WEBHOOK_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';

    const payload = {
      webhook: {
        enabled: true,
        url: WEBHOOK_URL,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        webhookByEvents: false,
        webhookBase64: false
      }
    };

    // Evolution API v2.x usa PUT /webhook/set/{instance}
    const endpoints = [
      { method: 'PUT',  path: `/webhook/set/${INSTANCE_NAME}` },
      { method: 'POST', path: `/webhook/set/${INSTANCE_NAME}` },
      { method: 'PUT',  path: `/instance/setWebhook/${INSTANCE_NAME}` },
      { method: 'POST', path: `/instance/setWebhook/${INSTANCE_NAME}` },
      // payload alternativo sem wrapper "webhook"
      { method: 'PUT',  path: `/webhook/set/${INSTANCE_NAME}`, altPayload: true },
    ];

    const altPayload = {
      url: WEBHOOK_URL,
      enabled: true,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      webhookByEvents: false,
      webhookBase64: false
    };

    const resultados = {};

    for (const ep of endpoints) {
      const url = baseUrl + ep.path;
      const body = ep.altPayload ? altPayload : payload;
      try {
        console.log(`📡 ${ep.method} ${ep.path}`);
        const response = await fetch(url, {
          method: ep.method,
          headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        let respBody = null;
        try { respBody = await response.json(); } catch { respBody = await response.text(); }

        resultados[`${ep.method} ${ep.path}`] = { status: response.status, ok: response.ok, body: respBody };
        console.log(`→ Status: ${response.status}`);

        if (response.ok || response.status === 201) {
          return Response.json({
            sucesso: true,
            endpoint: `${ep.method} ${ep.path}`,
            webhook_url: WEBHOOK_URL,
            resposta: respBody
          });
        }
      } catch (e) {
        resultados[`${ep.method} ${ep.path}`] = { erro: e.message };
      }
    }

    return Response.json({
      sucesso: false,
      mensagem: 'Nenhum endpoint de webhook funcionou',
      instance_name: INSTANCE_NAME,
      resultados
    }, { status: 400 });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});
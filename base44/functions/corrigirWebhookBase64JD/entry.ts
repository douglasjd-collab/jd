import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // URL correta da Evolution para JD Promotora
  const evolutionUrl = 'https://supabase-jdpromotora.0ntuaf.easypanel.host';
  const instanceName = 'JDPROMOTORA';

  // Buscar API key da empresa
  const empresas = await base44.asServiceRole.entities.Empresa.filter(
    { evolution_instance_name: instanceName }, null, 1
  );
  if (!empresas.length) {
    return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
  }
  const empresa = empresas[0];
  const apiKey = empresa.evolution_api_key;

  const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;
  const logs = [];

  // Tentar endpoint v2 (Evolution 2.x)
  const endpointsParaTentar = [
    { method: 'PUT', path: `/webhook/set/${instanceName}` },
    { method: 'POST', path: `/webhook/set/${instanceName}` },
    { method: 'PUT', path: `/webhook/${instanceName}` },
    { method: 'POST', path: `/webhook/${instanceName}` },
    { method: 'PUT', path: `/instance/setWebhook/${instanceName}` },
    { method: 'POST', path: `/instance/setWebhook/${instanceName}` },
    { method: 'PATCH', path: `/webhook/set/${instanceName}` },
  ];

  const webhookPayload = {
    webhook: {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      enabled: true,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONNECTION_UPDATE'
      ]
    }
  };

  for (const ep of endpointsParaTentar) {
    const fullUrl = `${evolutionUrl}${ep.path}`;
    try {
      const res = await fetch(fullUrl, {
        method: ep.method,
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = text; }

      logs.push({ endpoint: ep.method + ' ' + ep.path, status: res.status, result: parsed });

      if (res.status >= 200 && res.status < 300) {
        // Sucesso! Verificar configuração final
        const verifyRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
          headers: { 'apikey': apiKey }
        });
        let verifyData = {};
        if (verifyRes.ok) {
          try { verifyData = await verifyRes.json(); } catch (_) {}
        }

        return Response.json({
          success: true,
          endpoint_usado: ep.method + ' ' + ep.path,
          webhook_base64_novo: verifyData?.webhookBase64 ?? verifyData?.webhook_base64,
          url_configurada: verifyData?.url,
          config_final: verifyData,
          logs
        });
      }
    } catch (e) {
      logs.push({ endpoint: ep.method + ' ' + ep.path, erro: e.message });
    }
  }

  // Nenhum endpoint funcionou — verificar estado atual
  const currentRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
    headers: { 'apikey': apiKey }
  });
  let currentData = {};
  if (currentRes.ok) {
    try { currentData = await currentRes.json(); } catch (_) {}
  }

  return Response.json({
    success: false,
    mensagem: 'Nenhum endpoint de webhook aceitou a requisição',
    webhook_atual: currentData,
    logs
  });
});
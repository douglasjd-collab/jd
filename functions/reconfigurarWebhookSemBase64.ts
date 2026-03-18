import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.perfil !== 'super_admin' && user?.perfil !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || 'JDPROMOTORA';
    const appId = Deno.env.get('BASE44_APP_ID') || '';

    const webhookUrl = `https://api.base44.com/apps/${appId}/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    const body = {
      url: webhookUrl,
      enabled: true,
      webhookByEvents: false,
      webhookBase64: false,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE']
    };

    console.log(`🔧 Reconfigurando webhook: ${webhookUrl}`);
    console.log(`🔧 webhookBase64: false`);

    const res = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    let resultado;
    try { resultado = JSON.parse(text); } catch (_) { resultado = text; }

    console.log(`📡 Status: ${res.status}`);
    console.log(`📡 Resposta:`, JSON.stringify(resultado));

    // Verificar configuração atual
    const check = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const checkText = await check.text();
    let checkData;
    try { checkData = JSON.parse(checkText); } catch (_) { checkData = checkText; }

    return Response.json({
      ok: res.ok,
      status: res.status,
      resultado,
      webhook_atual: checkData,
      webhookBase64_configurado: false,
      url: webhookUrl
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
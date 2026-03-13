import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const instanceName = body.instance || Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';
    const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';

    if (!evolutionUrl || !apiKey) {
      return Response.json({ error: 'EVOLUTION_API_URL e EVOLUTION_API_KEY precisam estar configurados nos secrets' }, { status: 400 });
    }

    const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    console.log(`📡 Configurando webhook para instância: ${instanceName}`);
    console.log(`📡 URL do webhook: ${webhookUrl}`);
    console.log(`📡 Evolution URL: ${evolutionUrl}`);

    // Verificar webhook atual primeiro
    let webhookAtual = null;
    try {
      const findResp = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
        headers: { 'apikey': apiKey }
      });
      webhookAtual = await findResp.json();
      console.log(`🔍 Webhook atual: ${JSON.stringify(webhookAtual)}`);
    } catch (e) {
      console.log(`⚠️ Erro ao buscar webhook atual: ${e.message}`);
    }

    // Configurar webhook
    const webhookPayload = {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_ACK"]
      }
    };

    const setResp = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });

    const setResult = await setResp.json();
    console.log(`✅ Resultado configuração: ${JSON.stringify(setResult)}`);

    // Verificar se foi configurado corretamente
    const findResp2 = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const webhookNovo = await findResp2.json();
    console.log(`🔍 Webhook novo: ${JSON.stringify(webhookNovo)}`);

    return Response.json({
      sucesso: true,
      webhook_url_configurada: webhookUrl,
      instance: instanceName,
      resultado: setResult,
      webhook_confirmado: webhookNovo
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
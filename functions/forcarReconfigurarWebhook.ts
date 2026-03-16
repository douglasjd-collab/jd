import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    // Buscar empresa JD para pegar credenciais atualizadas
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];

    if (!empresa) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const evolutionUrl = (empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '';
    const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';

    if (!evolutionUrl || !apiKey) {
      return Response.json({ error: 'Credenciais Evolution não configuradas' }, { status: 400 });
    }

    const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    console.log(`📡 Instância: ${instanceName}`);
    console.log(`📡 Evolution URL: ${evolutionUrl}`);
    console.log(`📡 Webhook URL: ${webhookUrl}`);

    // 1. Verificar estado da instância
    const stateResp = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const stateData = await stateResp.json();
    console.log(`📶 Estado instância: ${JSON.stringify(stateData)}`);

    // 2. Reconfigurar webhook com todos os eventos necessários
    const webhookPayload = {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: true,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_ACK", "CONNECTION_UPDATE"]
      }
    };

    const setResp = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    });
    const setResult = await setResp.json();
    console.log(`✅ Webhook reconfigurado: ${JSON.stringify(setResult)}`);

    // 3. Verificar webhook novo
    const findResp = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const webhookAtual = await findResp.json();
    console.log(`🔍 Webhook após reconfiguração: ${JSON.stringify(webhookAtual)}`);

    // 4. Disparar mensagem de teste para o webhook (simular recebimento)
    const testPayload = {
      event: "MESSAGES_UPSERT",
      instance: instanceName,
      data: {
        key: {
          remoteJid: "5500000000000@s.whatsapp.net",
          fromMe: false,
          id: `WEBHOOK_TEST_${Date.now()}`
        },
        pushName: "Teste Reconfiguração",
        message: { conversation: "Teste de reconfiguração webhook" }
      }
    };

    const testResp = await fetch(`${webhookUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const testResult = await testResp.json();
    console.log(`🧪 Teste webhook auto: ${JSON.stringify(testResult)}`);

    return Response.json({
      ok: true,
      instancia: instanceName,
      estado: stateData,
      webhook_reconfigurado: setResult,
      webhook_confirmado: webhookAtual,
      teste_disparo: testResult
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
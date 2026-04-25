import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const EVOLUTION_URL = 'https://jdpromotora.0ntuaf.easypanel.host';
    const API_KEY = '72F05FA223C5-437A-B07B-31CEE2921192';
    const INSTANCE = 'JDPROMOTORA';

    // Buscar configuração atual do webhook
    const [webhookRes, instanceRes] = await Promise.all([
      fetch(`${EVOLUTION_URL}/webhook/find/${INSTANCE}`, {
        headers: { 'apikey': API_KEY }
      }),
      fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
        headers: { 'apikey': API_KEY }
      })
    ]);

    const webhookData = await webhookRes.json().catch(() => ({}));
    const instanceData = await instanceRes.json().catch(() => ({}));

    // Filtrar instância JDPROMOTORA
    const jdInstance = Array.isArray(instanceData) 
      ? instanceData.find(i => i.instance?.instanceName === INSTANCE || i.name === INSTANCE)
      : instanceData;

    return Response.json({
      webhook: webhookData,
      instance: jdInstance,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
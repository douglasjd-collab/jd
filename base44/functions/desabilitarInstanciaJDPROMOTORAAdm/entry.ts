import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const EVOLUTION_URL = 'https://jdpromotora.0ntuaf.easypanel.host';
    const API_KEY = '8C861082846F-4A65-88CD-037FEFB6C0FC';
    const INSTANCE = 'JDPROMOTORAADM';

    // Desabilitar webhook da instância JDPROMOTORAADM
    const webhookRes = await fetch(`${EVOLUTION_URL}/webhook/set/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
      },
      body: JSON.stringify({
        webhook: {
          enabled: false,
          url: '',
          webhookByEvents: false,
          events: []
        }
      })
    });

    const webhookData = await webhookRes.json().catch(() => ({}));

    return Response.json({
      success: true,
      message: `Webhook da instância ${INSTANCE} desabilitado`,
      status: webhookRes.status,
      response: webhookData
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
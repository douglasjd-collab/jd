import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const urlsTestar = [
      'https://app--appjdpromorora.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp',
      'https://app--appjdpromorora.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=JDPROMOTORA',
      'https://appjdpromorora.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=JDPROMOTORA',
    ];

    const payload = {
      event: 'messages.upsert',
      instance: 'JDPROMOTORA',
      data: {
        key: { remoteJid: '558781184956@s.whatsapp.net', fromMe: false, id: `URL_TEST_${Date.now()}` },
        pushName: 'Teste URL',
        message: { conversation: 'Teste URL webhook' },
        messageType: 'conversation',
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    };

    const resultados = [];
    for (const url of urlsTestar) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await res.text();
        resultados.push({ url, status: res.status, body: body.substring(0, 300) });
      } catch (e) {
        resultados.push({ url, erro: e.message });
      }
    }

    return Response.json({ resultados });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
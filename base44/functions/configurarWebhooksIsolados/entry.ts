import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const evolutionUrl = 'https://jdpromotora.0ntuaf.easypanel.host';
  const baseWebhook = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';

  const instancias = [
    { nome: 'JDPROMOTORA', key: '72F05FA223C5-437A-B07B-31CEE2921192' },
    { nome: 'LOTUS',       key: 'B81529F5C201-4489-B118-F10F5A0671A2' },
  ];

  const resultados = [];

  for (const { nome, key } of instancias) {
    const webhookUrl = `${baseWebhook}?instance=${nome}`;
    // Evolution API v2 — formato correto com eventos válidos
    const payload = {
      webhook: {
        url: webhookUrl,
        enabled: true,
        byEvents: false,
        base64: false, // CRÍTICO: desativar base64 para identificar instância corretamente
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE']
      }
    };

    try {
      // Verificar webhook atual
      const resBefore = await fetch(`${evolutionUrl}/webhook/find/${nome}`, {
        headers: { 'apikey': key }
      });
      const before = resBefore.ok ? await resBefore.json() : { status: resBefore.status };

      // Configurar webhook
      const resSet = await fetch(`${evolutionUrl}/webhook/set/${nome}`, {
        method: 'POST',
        headers: { 'apikey': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resultSet = await resSet.json();

      // Verificar depois
      const resAfter = await fetch(`${evolutionUrl}/webhook/find/${nome}`, {
        headers: { 'apikey': key }
      });
      const after = resAfter.ok ? await resAfter.json() : null;

      resultados.push({
        instancia: nome,
        webhook_url_configurada: webhookUrl,
        status_set: resSet.status,
        antes: { url: before?.url, base64: before?.webhookBase64, enabled: before?.enabled },
        depois: { url: after?.url, base64: after?.webhookBase64, enabled: after?.enabled },
        sucesso: resSet.ok,
        resposta: resultSet
      });

      console.log(`${resSet.ok ? '✅' : '❌'} ${nome}: ${resSet.status} | URL: ${webhookUrl}`);
    } catch (e) {
      resultados.push({ instancia: nome, erro: e.message });
      console.error(`❌ Erro em ${nome}:`, e.message);
    }
  }

  return Response.json({ resultados });
});
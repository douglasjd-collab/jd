import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const evolutionUrl = 'https://evolutionapi-evolution-api.dsnnn7.easypanel.host';
  const apiKey = 'B5A385811637-40AE-82BB-7FBA0310FEC6';
  const instanceName = 'JDPROMOTORAAGUASBELAS';
  const webhookUrlCorreta = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;

  // 1. Status da instância
  let statusInstancia = null;
  try {
    const r = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    statusInstancia = await r.json();
  } catch (e) {
    statusInstancia = { error: e.message };
  }

  // 2. Webhook configurado
  let webhookInfo = null;
  try {
    const r = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    webhookInfo = await r.json();
  } catch (e) {
    webhookInfo = { error: e.message };
  }

  const webhookConfigurado = webhookInfo?.webhook?.url || webhookInfo?.url || '';
  const webhookCorreto = webhookConfigurado === webhookUrlCorreta;
  const instanciaConectada = statusInstancia?.instance?.state === 'open';

  const problemas = [];
  if (!instanciaConectada) {
    problemas.push(`Instância NÃO conectada. Estado: "${statusInstancia?.instance?.state}"`);
  }
  if (!webhookConfigurado) {
    problemas.push('Nenhum webhook configurado na Evolution API');
  } else if (!webhookCorreto) {
    problemas.push(`URL do webhook INCORRETA. Configurada: "${webhookConfigurado}" | Correta: "${webhookUrlCorreta}"`);
  }

  return Response.json({
    instancia: instanceName,
    instancia_conectada: instanciaConectada,
    estado_instancia: statusInstancia?.instance?.state,
    webhook_url_correta: webhookUrlCorreta,
    webhook_url_configurada: webhookConfigurado,
    webhook_correto: webhookCorreto,
    webhook_detalhes: webhookInfo,
    status_detalhes: statusInstancia,
    problemas,
    tudo_ok: problemas.length === 0
  });
});
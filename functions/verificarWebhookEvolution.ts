import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    // Buscar empresa no banco
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    if (!evolutionUrl || !apiKey || !instanceName) {
      return Response.json({
        error: 'Empresa sem configuração Evolution completa',
        empresa: empresa.nome,
        campos_faltando: {
          evolution_url: !evolutionUrl,
          evolution_api_key: !apiKey,
          evolution_instance_name: !instanceName
        }
      }, { status: 400 });
    }

    // 1. Verificar status da instância
    let statusInstancia = null;
    try {
      const r = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' }
      });
      statusInstancia = await r.json();
    } catch (e) {
      statusInstancia = { error: e.message };
    }

    // 2. Verificar webhook configurado
    let webhookInfo = null;
    try {
      const r = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' }
      });
      webhookInfo = await r.json();
    } catch (e) {
      webhookInfo = { error: e.message };
    }

    const webhookUrlCorreta = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    const webhookUrlConfigurada = webhookInfo?.webhook?.url || webhookInfo?.url || '';
    const webhookCorreto = webhookUrlConfigurada === webhookUrlCorreta;
    const instanciaConectada = statusInstancia?.instance?.state === 'open';

    const problemas = [];
    if (!instanciaConectada) {
      problemas.push(`❌ Instância NÃO conectada. Estado atual: "${statusInstancia?.instance?.state || 'desconhecido'}"`);
    }
    if (!webhookUrlConfigurada) {
      problemas.push('❌ Nenhum webhook configurado na Evolution API');
    } else if (!webhookCorreto) {
      problemas.push(`❌ URL do webhook INCORRETA.\n   Configurada: ${webhookUrlConfigurada}\n   Correta:     ${webhookUrlCorreta}`);
    }

    return Response.json({
      empresa: empresa.nome,
      instancia: instanceName,
      instancia_conectada: instanciaConectada,
      estado_instancia: statusInstancia?.instance?.state,
      webhook_url_correta: webhookUrlCorreta,
      webhook_url_configurada: webhookUrlConfigurada,
      webhook_correto: webhookCorreto,
      webhook_raw: webhookInfo,
      status_raw: statusInstancia,
      problemas,
      ok: problemas.length === 0
    });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
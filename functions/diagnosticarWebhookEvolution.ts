import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;

    if (!empresaId) {
      return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    }

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const { evolution_url, evolution_api_key, evolution_instance_name } = empresa;

    if (!evolution_url || !evolution_api_key || !evolution_instance_name) {
      return Response.json({
        error: 'Empresa sem configuração Evolution completa',
        campos: { evolution_url: !!evolution_url, evolution_api_key: !!evolution_api_key, evolution_instance_name: !!evolution_instance_name }
      }, { status: 400 });
    }

    const baseUrl = evolution_url.replace(/\/$/, '');

    // 1. Verificar status da instância
    let instanceStatus = null;
    try {
      const r = await fetch(`${baseUrl}/instance/connectionState/${evolution_instance_name}`, {
        headers: { 'apikey': evolution_api_key }
      });
      instanceStatus = await r.json();
    } catch (e) {
      instanceStatus = { error: e.message };
    }

    // 2. Verificar webhook atual configurado
    let webhookAtual = null;
    try {
      const r = await fetch(`${baseUrl}/webhook/find/${evolution_instance_name}`, {
        headers: { 'apikey': evolution_api_key }
      });
      webhookAtual = await r.json();
    } catch (e) {
      webhookAtual = { error: e.message };
    }

    // 3. URL correta do webhook
    const webhookUrlCorreta = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${evolution_instance_name}`;

    // 4. Verificar se o webhook configurado bate com o correto
    const webhookConfigurado = webhookAtual?.webhook?.url || webhookAtual?.url || '';
    const webhookCorreto = webhookConfigurado === webhookUrlCorreta;

    return Response.json({
      empresa: empresa.nome,
      instancia: evolution_instance_name,
      status_conexao: instanceStatus,
      webhook_atual: webhookAtual,
      webhook_url_correta: webhookUrlCorreta,
      webhook_url_configurada: webhookConfigurado,
      webhook_correto: webhookCorreto,
      problemas: [
        !webhookCorreto && `URL do webhook está ERRADA. Configurada: "${webhookConfigurado}" | Correta: "${webhookUrlCorreta}"`,
        instanceStatus?.instance?.state !== 'open' && `Instância não está conectada. Estado: ${instanceStatus?.instance?.state}`,
      ].filter(Boolean)
    });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: '699696c2c9f5bffc2e67402b' });
    const empresa = empresas?.[0];
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || 'JDPROMOTORA';
    const appId = Deno.env.get('BASE44_APP_ID') || '';

    // URL correta: usar o domínio do app (não api.base44.com que pode não rotear)
    const webhookUrl = `https://appjdpromorora.base44.app/api/apps/${appId}/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    console.log(`🎯 URL correta: ${webhookUrl}`);
    console.log(`🏭 Evolution: ${evolutionUrl} | Instance: ${instanceName}`);

    // Passo 1: Verificar webhook atual
    const checkRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const checkData = await checkRes.json();
    console.log(`📋 Webhook atual: ${JSON.stringify(checkData)}`);

    // Passo 2: Tentar DELETE do webhook atual
    let deleteResult = null;
    try {
      const delRes = await fetch(`${evolutionUrl}/webhook/delete/${instanceName}`, {
        method: 'DELETE',
        headers: { 'apikey': evolutionKey }
      });
      deleteResult = await delRes.text();
      console.log(`🗑️ DELETE status: ${delRes.status} | ${deleteResult}`);
    } catch (e) {
      console.log(`⚠️ DELETE falhou: ${e.message}`);
    }

    // Passo 3: Criar novo webhook com configuração correta
    const newWebhookBody = {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE']
      }
    };

    const setRes = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(newWebhookBody)
    });
    const setData = await setRes.json();
    console.log(`✅ SET status: ${setRes.status} | ${JSON.stringify(setData)}`);

    // Passo 4: Verificar configuração final
    const finalRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const finalData = await finalRes.json();
    console.log(`📋 Webhook final: ${JSON.stringify(finalData)}`);

    return Response.json({
      ok: setRes.ok,
      url_configurada: webhookUrl,
      webhook_antes: checkData,
      delete_result: deleteResult,
      set_result: setData,
      webhook_depois: finalData,
      base64_desativado: finalData?.webhookBase64 === false
    });

  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Buscar empresa com credenciais
    const empresas = await base44.asServiceRole.entities.Empresa.filter(
      { id: '699696c2c9f5bffc2e67402b' }, null, 1
    );
    const empresa = empresas[0];
    if (!empresa?.whatsapp_access_token || !empresa?.whatsapp_business_account_id) {
      return Response.json({ error: 'Credenciais não configuradas' });
    }

    const token = empresa.whatsapp_access_token;
    const wabaId = empresa.whatsapp_business_account_id; // Business Account ID
    const phoneNumberId = empresa.whatsapp_phone_number_id;

    const resultados = {};

    // 1. Verificar subscriptions do WABA
    const subResp = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps?access_token=${token}`
    );
    const subData = await subResp.json();
    resultados.subscriptions = subData;

    // 2. Assinar app ao WABA (garante recebimento de webhooks)
    const assinarResp = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }
    );
    const assinarData = await assinarResp.json();
    resultados.assinar_resultado = assinarData;

    // 3. Verificar info do phone number
    const phoneResp = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified_name,status,quality_rating&access_token=${token}`
    );
    const phoneData = await phoneResp.json();
    resultados.phone_info = phoneData;

    // 4. Verificar webhooks configurados no App (via app token)
    // Instrução: no painel Meta, o webhook URL deve ser:
    const WEBHOOK_URL = 'https://app--waze-crm.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/webhookMetaPublico';
    resultados.webhook_url_correta = WEBHOOK_URL;
    resultados.verify_token = 'WAZE_CRM_WEBHOOK_2024';
    resultados.phone_number_id = phoneNumberId;
    resultados.waba_id = wabaId;

    return Response.json({
      ok: true,
      resultados,
      instrucoes: [
        '1. Vá em developers.facebook.com → Seu App → WhatsApp → Configuration',
        '2. Em Webhook, verifique se a URL é: ' + WEBHOOK_URL,
        '3. Verifique se o campo "messages" está subscrito (marcado)',
        '4. Se não estiver, clique em "Subscribe" no campo messages',
        '5. O assinar_resultado acima deve ter success:true'
      ]
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
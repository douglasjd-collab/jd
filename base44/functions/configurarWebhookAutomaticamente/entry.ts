import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId && user.perfil === 'super_admin') {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: 'Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🔧 Configurando webhook para ${instanceName}...`);

    // URL do webhook (função que recebe mensagens)
    const webhookUrl = `https://${req.headers.get('host')}/functions/receberMensagensWhatsApp`;

    // 1. Remover webhooks antigos
    console.log(`1️⃣ Removendo webhooks antigos...`);
    const webhooksRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const webhooksData = webhooksRes.ok ? await webhooksRes.json() : { webhooks: [] };
    const webhooks = webhooksData.webhooks || [];

    for (const webhook of webhooks) {
      if (webhook.url && webhook.url.includes('/receberMensagensWhatsApp')) {
        console.log(`Removendo webhook antigo: ${webhook.url}`);
        await fetch(`${evolutionUrl}/webhook/remove/${instanceName}/${webhook.id}`, {
          method: 'DELETE',
          headers: { 'apikey': evolutionKey }
        }).catch(() => {});
      }
    }

    // 2. Criar novo webhook
    console.log(`2️⃣ Criando novo webhook...`);
    const createRes = await fetch(`${evolutionUrl}/webhook/save/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        events: ['QRCODE_UPDATED', 'MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_SET', 'SEND_MESSAGE'],
        all: false
      })
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error(`Erro ao criar webhook: ${createRes.status} - ${errorText}`);
      return Response.json({
        error: `Erro ao configurar webhook: HTTP ${createRes.status}`,
        detalhes: errorText
      }, { status: 400 });
    }

    const createData = await createRes.json();
    console.log(`✅ Webhook criado com sucesso`);

    return Response.json({
      ok: true,
      mensagem: '✅ Webhook configurado com sucesso!',
      webhook: {
        url: webhookUrl,
        eventos: ['QRCODE_UPDATED', 'MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_SET', 'SEND_MESSAGE']
      },
      proximo_passo: 'Aguarde mensagens entrarem agora. O sistema receberá mensagens automaticamente.'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
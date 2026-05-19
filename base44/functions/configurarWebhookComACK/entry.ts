import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reconfigura o webhook da Evolution garantindo que MESSAGES_UPDATE (ACK) está ativo
// com a URL correta do nosso backend
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || user.empresa_id;

    // Buscar todas as empresas ou só a empresa solicitada
    let empresas = [];
    if (empresaId) {
      const emp = await base44.asServiceRole.entities.Empresa.get(empresaId);
      if (emp) empresas = [emp];
    } else if (user.perfil === 'master' || user.perfil === 'super_admin') {
      empresas = await base44.asServiceRole.entities.Empresa.filter({}, null, 100);
    } else {
      return Response.json({ error: 'empresa_id required' }, { status: 400 });
    }

    const APP_ID = Deno.env.get('BASE44_APP_ID') || '6950a9860c8af0e2ff10fc9e';
    const resultados = [];

    const EVENTOS = [
      'MESSAGES_UPSERT',    // Novas mensagens recebidas
      'MESSAGES_UPDATE',    // ACKs: entregue, lida ← ESSENCIAL
      'MESSAGES_DELETE',    // Deletar mensagens
      'SEND_MESSAGE',       // Mensagens enviadas
      'CONNECTION_UPDATE',  // Status de conexão
      'CHATS_UPSERT',
      'CHATS_UPDATE',
      'CONTACTS_UPSERT',
    ];

    for (const empresa of empresas) {
      const evolutionUrl = (empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
      const evolutionKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
      const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

      if (!evolutionUrl || !evolutionKey || !instanceName) {
        resultados.push({ empresa: empresa.nome, erro: 'Credenciais Evolution não configuradas' });
        continue;
      }

      // URL correta do webhook
      const webhookUrl = `https://api.base44.com/apps/${APP_ID}/functions/receberWebhookWhatsApp?instance=${instanceName}`;

      console.log(`🔧 Configurando webhook para ${empresa.nome} | instance: ${instanceName}`);
      console.log(`   URL: ${webhookUrl}`);

      try {
        const res = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhook_by_events: false,
              webhook_base64: false,
              events: EVENTOS
            }
          })
        });

        const resText = await res.text();
        let resData = null;
        try { resData = JSON.parse(resText); } catch (_) { resData = resText; }

        if (res.ok) {
          console.log(`✅ Webhook configurado: ${empresa.nome}`);
          resultados.push({ empresa: empresa.nome, instance: instanceName, ok: true, url: webhookUrl, eventos: EVENTOS });
        } else {
          console.error(`❌ Erro para ${empresa.nome}: ${resText}`);
          resultados.push({ empresa: empresa.nome, instance: instanceName, ok: false, erro: resData });
        }
      } catch (e) {
        resultados.push({ empresa: empresa.nome, instance: instanceName, ok: false, erro: e.message });
      }
    }

    return Response.json({ success: true, resultados });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
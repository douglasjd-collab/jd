import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Carrega credenciais da super conta e configura webhook na Evolution API
 * Chamada por super_admin para sincronizar Evolution
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.perfil !== 'super_admin') {
      return Response.json(
        { error: 'Apenas super_admin pode configurar' },
        { status: 403 }
      );
    }

    // Buscar super conta (empresa principal)
    const empresas = await base44.asServiceRole.entities.Empresa.filter(
      {},
      '-created_date',
      1
    );

    if (!empresas || empresas.length === 0) {
      return Response.json(
        { error: 'Nenhuma empresa super_admin encontrada' },
        { status: 400 }
      );
    }

    const superConta = empresas[0];
    const { evolution_url, evolution_instance_name, evolution_api_key } = superConta;

    if (!evolution_url || !evolution_instance_name || !evolution_api_key) {
      return Response.json({
        ok: false,
        mensagem: 'Evolution não configurada na super conta. Configure em Configuração WhatsApp primeiro.',
        faltando: {
          url: !evolution_url,
          instancia: !evolution_instance_name,
          key: !evolution_api_key
        }
      });
    }

    // Limpar URL e headers
    const baseUrl = evolution_url.replace(/\/manager\/?$/, '').replace(/\/$/, '');
    const headers = {
      'apikey': evolution_api_key,
      'Content-Type': 'application/json'
    };

    // Gerar URL webhook (que será usada em todas as instâncias)
    const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${encodeURIComponent(evolution_instance_name)}`;

    console.log(`🔧 Configurando Evolution para super conta...`);
    console.log(`  URL: ${baseUrl}`);
    console.log(`  Instância: ${evolution_instance_name}`);
    console.log(`  Webhook: ${webhookUrl}`);

    // 1. Verificar status da instância
    const statusResp = await fetch(
      `${baseUrl}/instance/connectionState/${evolution_instance_name}`,
      { headers }
    );

    if (!statusResp.ok) {
      return Response.json({
        ok: false,
        mensagem: `Instância não encontrada ou inacessível`,
        status: statusResp.status,
        erro: await statusResp.text()
      });
    }

    const statusData = await statusResp.json();
    const isConnected = statusData?.instance?.state === 'open' || statusData?.state === 'open';

    // 2. Configurar webhook na Evolution API
    // Primeiro, listar webhooks existentes
    const webhooksResp = await fetch(
      `${baseUrl}/webhook/findByInstanceName/${evolution_instance_name}`,
      { headers, method: 'GET' }
    );

    let existingWebhooks = [];
    if (webhooksResp.ok) {
      const webhooksData = await webhooksResp.json();
      existingWebhooks = Array.isArray(webhooksData?.webhooks) ? webhooksData.webhooks : [];
    }

    console.log(`📋 Webhooks existentes: ${existingWebhooks.length}`);

    // Remover webhooks antigos
    for (const wh of existingWebhooks) {
      if (wh.id) {
        await fetch(`${baseUrl}/webhook/remove/${wh.id}`, {
          method: 'DELETE',
          headers
        }).catch(() => {});
        console.log(`  ❌ Removido webhook antigo: ${wh.id}`);
      }
    }

    // 3. Criar novo webhook
    const createWebhookResp = await fetch(
      `${baseUrl}/webhook/save/${evolution_instance_name}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: webhookUrl,
          events: [
            'MESSAGES_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE',
            'CHATS_UPDATE',
            'CHATS_UPSERT',
            'CONTACTS_UPDATE',
            'CONTACTS_UPSERT',
            'PRESENCE_UPDATE'
          ],
          enabled: true
        })
      }
    );

    const createWebhookData = await createWebhookResp.json();

    if (!createWebhookResp.ok) {
      console.error('❌ Erro ao criar webhook:', createWebhookData);
      return Response.json({
        ok: false,
        mensagem: 'Erro ao criar webhook',
        erro: createWebhookData?.error || createWebhookData?.message
      });
    }

    console.log(`✅ Webhook criado com sucesso`);

    return Response.json({
      ok: true,
      mensagem: '✅ Evolution configurada com sucesso!',
      details: {
        empresa: superConta.nome,
        instancia: evolution_instance_name,
        conectado: isConnected,
        webhookUrl: webhookUrl,
        webhookStatus: 'Configurado'
      }
    });
  } catch (error) {
    console.error('❌ Erro na função:', error);
    return Response.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
});
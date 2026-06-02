import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Suporta chamada via automação (sem usuário) ou via frontend (com usuário admin)
    const user = await base44.auth.me().catch(() => null);
    if (user && user.perfil && !['super_admin', 'master', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    // Usar service role para garantir acesso mesmo sem usuário (automação agendada)
    // Buscar empresa JD PROMOTORA
    let empresas = await base44.asServiceRole.entities.Empresa.filter({ nome: { $regex: 'JD PROMOTORA' } });
    
    if (!empresas || empresas.length === 0) {
      empresas = await base44.asServiceRole.entities.Empresa.filter({ codigo: { $regex: 'JD' } });
    }
    
    if (!empresas || empresas.length === 0) {
      return Response.json({ 
        error: 'Empresa JD PROMOTORA não encontrada',
        searched: ['JD PROMOTORA', 'JD']
      }, { status: 404 });
    }

    const empresa = empresas[0];

    const evolutionUrl = empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionApiKey || !instanceName) {
      return Response.json({ 
        error: 'Missing Evolution credentials for this company',
        details: { 
          evolutionUrl: !!evolutionUrl, 
          evolutionApiKey: !!evolutionApiKey, 
          instanceName: !!instanceName 
        }
      }, { status: 400 });
    }

    // URL base FIXA — formato correto Base44 (URL de produção da API)
    const WEBHOOK_BASE_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';
    const webhookUrl = `${WEBHOOK_BASE_URL}?instance=${encodeURIComponent(instanceName)}`;
    console.log(`🔗 URL do webhook configurada: ${webhookUrl}`);
    
    // Configurar webhook com todos os eventos - formato Evolution V2
    const webhookPayload = {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookBase64: true,
        webhookByEvents: false,
        events: [
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'CALL'
        ]
      }
    };

    // Tentar deletar webhook existente primeiro (para forçar recriação com base64=false)
    try {
      await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
        method: 'DELETE',
        headers: { 'apikey': evolutionApiKey, 'Authorization': `Bearer ${evolutionApiKey}` }
      });
    } catch (e) { /* ignorar erro ao deletar */ }

    // Aguardar 500ms para garantir deleção
    await new Promise(r => setTimeout(r, 500));

    // Configurar webhook na Evolution
    const webhookResponse = await fetch(
      `${evolutionUrl}/webhook/set/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
          'Authorization': `Bearer ${evolutionApiKey}`
        },
        body: JSON.stringify(webhookPayload)
      }
    );

    const webhookResult = await webhookResponse.json();
    console.log(`📋 Webhook set result: ${JSON.stringify(webhookResult)}`);
    
    if (!webhookResponse.ok) {
      return Response.json({
        success: false,
        error: 'Failed to set webhook',
        details: webhookResult,
        webhookUrl
      }, { status: 500 });
    }

    // Validar configuração
    const validateResponse = await fetch(
      `${evolutionUrl}/webhook/find/${instanceName}`,
      {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
          'Authorization': `Bearer ${evolutionApiKey}`
        }
      }
    );

    const validateResult = await validateResponse.json();

    // Verificar status da instância
    const statusResponse = await fetch(
      `${evolutionUrl}/instance/connectionState/${instanceName}`,
      {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
          'Authorization': `Bearer ${evolutionApiKey}`
        }
      }
    );

    const statusResult = await statusResponse.json();

    return Response.json({
      success: true,
      message: 'Webhook JD PROMOTORA reconectado com sucesso',
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        codigo: empresa.codigo
      },
      webhook: {
        url: webhookUrl,
        enabled: validateResult?.enabled,
        events: validateResult?.events?.length || 0
      },
      instancia: {
        name: instanceName,
        status: statusResult?.state?.status || 'desconhecido',
        conectado: statusResult?.state?.status === 'open'
      }
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    console.log('🧪 TESTE DE RECEBIMENTO WEBHOOK');
    console.log('='.repeat(80));

    // 1. Verificar configuração Evolution API
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionApiKey || !evolutionApiUrl || !instanceName) {
      return Response.json({
        success: false,
        error: 'Evolution API não configurada'
      }, { status: 400 });
    }

    console.log('✅ Credenciais OK');
    console.log('URL:', evolutionApiUrl);
    console.log('Instance:', instanceName);

    // 2. Buscar configuração do webhook na Evolution API
    const webhookEndpoint = `${evolutionApiUrl.replace(/\/$/, '')}/webhook/find/${instanceName}`;
    
    console.log('🔍 Buscando webhook em:', webhookEndpoint);
    
    const webhookResponse = await fetch(webhookEndpoint, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey
      }
    });

    const webhookData = await webhookResponse.json();
    console.log('📋 Webhook atual:', JSON.stringify(webhookData, null, 2));

    // 3. Verificar qual é o webhook correto (nosso deployment)
    const baseUrl = new URL(req.url).origin;
    const webhookCorreto = `${baseUrl}/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    
    console.log('🎯 Webhook correto:', webhookCorreto);

    // 4. Buscar últimas mensagens no banco
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    const empresaId = empresas[0]?.id;

    if (!empresaId) {
      return Response.json({
        success: false,
        error: 'Nenhuma empresa ativa encontrada'
      }, { status: 400 });
    }

    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      10
    );

    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-data_ultima_mensagem',
      5
    );

    console.log('💬 Mensagens no banco:', mensagens.length);
    console.log('🗣️ Conversas no banco:', conversas.length);

    // 5. Retornar diagnóstico completo
    return Response.json({
      success: true,
      diagnostico: {
        credenciais: {
          evolution_url: evolutionApiUrl,
          instance_name: instanceName,
          api_key_configurada: !!evolutionApiKey
        },
        webhook_atual: webhookData,
        webhook_correto: webhookCorreto,
        webhook_configurado: webhookData?.url === webhookCorreto,
        deployment_url: baseUrl,
        banco: {
          empresa_id: empresaId,
          total_mensagens: mensagens.length,
          total_conversas: conversas.length,
          ultimas_mensagens: mensagens.slice(0, 3).map(m => ({
            id: m.id,
            remetente: m.remetente,
            tipo: m.tipo_conteudo,
            texto: m.texto?.substring(0, 50),
            created_date: m.created_date
          }))
        }
      },
      recomendacao: webhookData?.url !== webhookCorreto 
        ? `⚠️ WEBHOOK PRECISA SER RECONFIGURADO! Use o botão "Configurar Webhook Automaticamente" na página de Configuração WhatsApp.`
        : `✅ Webhook está correto! Se não está recebendo, verifique se a instância do WhatsApp está conectada.`
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});
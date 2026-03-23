import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.error('='.repeat(80));
  console.error(`[DIAGNÓSTICO] ${timestamp}`);
  console.error('[DIAGNÓSTICO] Método:', req.method);
  console.error('[DIAGNÓSTICO] URL:', req.url);
  
  if (req.method === 'GET') {
    console.error('[DIAGNÓSTICO] GET request - retornando status');
    return Response.json({
      status: 'online',
      timestamp,
      message: 'Webhook está funcionando e pronto para receber eventos'
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar últimas mensagens
    const ultimasMensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      {},
      '-data_envio',
      5
    );

    // Verificar últimas conversas
    const ultimasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      {},
      '-data_ultima_mensagem',
      5
    );

    // Tentar chamar o webhook da Evolution API
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    console.error('[DIAGNÓSTICO] Evolution URL:', evolutionUrl);
    console.error('[DIAGNÓSTICO] Instance:', instanceName);
    console.error('[DIAGNÓSTICO] Key configured:', !!evolutionKey);

    // Verificar status da instância na Evolution
    let evolutionStatus = null;
    if (evolutionUrl && instanceName && evolutionKey) {
      try {
        const statusResponse = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
          headers: {
            'apikey': evolutionKey
          }
        });
        
        if (statusResponse.ok) {
          evolutionStatus = await statusResponse.json();
          console.error('[DIAGNÓSTICO] Status Evolution:', JSON.stringify(evolutionStatus, null, 2));
        }
      } catch (e) {
        console.error('[DIAGNÓSTICO] Erro ao buscar status:', e.message);
      }
    }

    // Verificar webhook configurado
    let webhookConfig = null;
    if (evolutionUrl && instanceName && evolutionKey) {
      try {
        const webhookResponse = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
          headers: {
            'apikey': evolutionKey
          }
        });
        
        if (webhookResponse.ok) {
          webhookConfig = await webhookResponse.json();
          console.error('[DIAGNÓSTICO] Webhook configurado:', JSON.stringify(webhookConfig, null, 2));
        }
      } catch (e) {
        console.error('[DIAGNÓSTICO] Erro ao buscar webhook:', e.message);
      }
    }

    console.error('='.repeat(80));

    return Response.json({
      timestamp,
      database_check: {
        ultimas_mensagens: ultimasMensagens.length,
        ultimas_conversas: ultimasConversas.length,
        mensagens: ultimasMensagens.map(m => ({
          id: m.id,
          remetente: m.remetente,
          texto: m.texto?.substring(0, 50),
          data: m.data_envio
        })),
        conversas: ultimasConversas.map(c => ({
          id: c.id,
          telefone: c.cliente_telefone,
          ultima_msg: c.ultima_mensagem?.substring(0, 50),
          data: c.data_ultima_mensagem
        }))
      },
      evolution_config: {
        url: evolutionUrl || 'NÃO CONFIGURADA',
        instance: instanceName || 'NÃO CONFIGURADA',
        key_exists: !!evolutionKey,
        status: evolutionStatus,
        webhook: webhookConfig
      },
      webhook_url: 'https://windy-sheep-96-y3gedbkzg1xs.deno.dev/functions/receberWebhookWhatsApp?instance=TESTEWAZE'
    });

  } catch (error) {
    console.error('[DIAGNÓSTICO] ❌ Erro:', error.message);
    console.error('[DIAGNÓSTICO] Stack:', error.stack);
    
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});
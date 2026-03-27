import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar colaborador para obter empresa_id
    const colaboradores = await base44.entities.Colaborador.filter({ user_id: user.id });
    if (!colaboradores || colaboradores.length === 0) {
      return Response.json({ error: 'Colaborador não encontrado' }, { status: 404 });
    }

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const INSTANCE_NAME = 'PROMOTORAJD';

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({
        erro: 'Variáveis de ambiente não configuradas'
      }, { status: 500 });
    }

    // URL do webhook que a Evolution API deve chamar
    const WEBHOOK_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=PROMOTORAJD';

    console.log('🔧 Configurando webhook na Evolution API...');
    console.log('URL:', WEBHOOK_URL);
    console.log('Instance:', INSTANCE_NAME);

    // Configurar webhook na Evolution
    // Tentar com header Authorization Bearer primeiro
    const configResponse = await fetch(
      `${EVOLUTION_API_URL}/webhook/set/${INSTANCE_NAME}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EVOLUTION_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE',
            'PRESENCE_UPDATE',
            'CHATS_SET',
            'CHATS_UPSERT',
            'CHATS_UPDATE',
            'CHATS_DELETE'
          ]
        })
      }
    );

    const result = await configResponse.json();

    if (configResponse.status === 200 || configResponse.status === 201) {
      console.log('✅ Webhook configurado com sucesso!');
      return Response.json({
        sucesso: true,
        mensagem: '✅ Webhook foi configurado na Evolution API',
        status_code: configResponse.status,
        webhook_url: WEBHOOK_URL,
        proximo_passo: 'As mensagens de entrada devem começar a chegar. Teste enviando uma mensagem para o número do WhatsApp.',
        resultado: result
      });
    } else {
      console.log('❌ Erro ao configurar webhook:', result);
      return Response.json({
        sucesso: false,
        erro: 'Falha ao configurar webhook',
        status_code: configResponse.status,
        detalhes: result
      }, { status: configResponse.status });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ 
      erro: error.message,
      dica: 'Erro ao configurar webhook na Evolution API'
    }, { status: 500 });
  }
});
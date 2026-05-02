import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const empresaId = user.empresa_id;
    if (!empresaId) {
      return Response.json({ error: 'No company found' }, { status: 400 });
    }

    // Buscar empresa para pegar credenciais
    const empresa = await base44.asServiceRole.entities.Empresa.filter(
      { id: empresaId }, null, 1
    );
    
    if (!empresa || empresa.length === 0) {
      return Response.json({ error: 'Company not found' }, { status: 404 });
    }

    const emp = empresa[0];
    const evolutionUrl = (emp.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = emp.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');
    const webhookUrl = Deno.env.get('WEBHOOK_URL') || `https://base44.app/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ error: 'Evolution not configured' }, { status: 400 });
    }

    console.log(`🔧 Ativando todos os eventos para: ${instanceName}`);

    // Todos os eventos que queremos ativar
    const eventosAtivos = [
      'MESSAGES_UPDATE',        // 🔴 ESSENCIAL para status entregue/lida
      'MESSAGES_UPSERT',        // Novas mensagens
      'MESSAGES_SET',           // Atualizar histórico
      'CHATS_UPSERT',           // Atualizar conversas
      'CHATS_DELETE',           // Deletar conversas
      'CONTACTS_UPSERT',        // Atualizar contatos
      'GROUPS_UPSERT',          // Atualizar grupos
      'CONNECTION_UPDATE',      // Status de conexão
      'PRESENCE_UPDATE',        // Status de presença
      'TYPEBOT_START',          // Typebot
      'TYPEBOT_CHANGE_STATUS',  // Typebot status
      'LABELS_ASSOCIATION',     // Etiquetas
      'LABELS_EDIT',            // Editar etiquetas
      'GROUP_PARTICIPANTS_UPDATE', // Participantes de grupo
      'GROUP_UPDATE'            // Atualizar grupo
    ];

    // Fazer requisição para Evolution configurar webhook
    const configRes = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': evolutionKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: eventosAtivos
      })
    });

    if (!configRes.ok) {
      const erro = await configRes.text();
      console.error('❌ Erro ao configurar webhook:', erro);
      return Response.json({ 
        error: 'Failed to configure webhook',
        details: erro 
      }, { status: configRes.status });
    }

    const result = await configRes.json();
    console.log(`✅ Webhook configurado com ${eventosAtivos.length} eventos`);
    console.log('📋 Eventos ativados:', eventosAtivos.join(', '));

    return Response.json({ 
      success: true,
      message: `✅ ${eventosAtivos.length} eventos ativados`,
      events: eventosAtivos,
      webhookUrl: webhookUrl,
      instance: instanceName
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
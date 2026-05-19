import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || (user.perfil !== 'super_admin' && user.perfil !== 'master' && user.perfil !== 'admin')) {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    // Buscar empresa JD PROMOTORA
    let empresas = await base44.entities.Empresa.filter({ nome: { $regex: 'JD PROMOTORA' } });
    
    if (!empresas || empresas.length === 0) {
      empresas = await base44.entities.Empresa.filter({ codigo: { $regex: 'JD' } });
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

    const results = {
      empresa: { id: empresa.id, nome: empresa.nome, codigo: empresa.codigo },
      instance: null,
      chats: null,
      messages: null,
      webhook: null,
      messagesStored: 0
    };

    // 1. Verificar status da instância
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
    results.instance = await statusResponse.json();

    // 2. Listar chats
    const chatsResponse = await fetch(
      `${evolutionUrl}/chat/findInstances`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
          'Authorization': `Bearer ${evolutionApiKey}`
        },
        body: JSON.stringify({ instanceName })
      }
    );
    results.chats = await chatsResponse.json();

    // 3. Buscar webhook atual
    const webhookResponse = await fetch(
      `${evolutionUrl}/webhook/find/${instanceName}`,
      {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
          'Authorization': `Bearer ${evolutionApiKey}`
        }
      }
    );
    results.webhook = await webhookResponse.json();

    // 4. Forçar sincronização de mensagens recentes (últimas 2 horas)
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    const messagesResponse = await fetch(
      `${evolutionUrl}/message/find/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
          'Authorization': `Bearer ${evolutionApiKey}`
        },
        body: JSON.stringify({
          where: {
            messageTimestamp: { $gte: Math.floor(twoHoursAgo.getTime() / 1000) }
          },
          limit: 100
        })
      }
    );
    results.messages = await messagesResponse.json();

    // 5. Se houver mensagens na Evolution, salvar no banco
    if (results.messages && Array.isArray(results.messages.messages) && results.messages.messages.length > 0) {
      const mensagensParaSalvar = results.messages.messages
        .filter(msg => msg.messageType === 'conversation' || msg.messageType === 'extendedTextMessage')
        .map(msg => ({
          conversa_id: 'auto-create', // Será criado automaticamente
          empresa_id: empresa.id,
          remetente: msg.key.fromMe ? 'vendedor' : 'cliente',
          tipo_conteudo: 'texto',
          texto: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
          whatsapp_message_id: msg.key.id,
          data_envio: new Date(msg.messageTimestamp * 1000).toISOString(),
          status: msg.key.fromMe ? 'enviada' : 'pendente',
          remetente_nome: msg.pushName || null
        }));

      // Salvar mensagens (o webhook handler normal vai processar)
      for (const msg of mensagensParaSalvar) {
        try {
          await base44.entities.MensagemWhatsapp.create(msg);
          results.messagesStored++;
        } catch (e) {
          console.error('Erro ao salvar mensagem:', e.message);
        }
      }
    }

    return Response.json({
      success: true,
      message: 'Diagnóstico completo realizado',
      ...results,
      summary: {
        instanceStatus: results.instance?.state?.status,
        webhookEnabled: results.webhook?.enabled,
        webhookEvents: results.webhook?.events?.length || 0,
        chatsFound: Array.isArray(results.chats) ? results.chats.length : 0,
        messagesFound: Array.isArray(results.messages?.messages) ? results.messages.messages.length : 0,
        messagesStored: results.messagesStored
      }
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});
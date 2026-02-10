import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversa_id, mensagem_id, telefone } = await req.json();

    // Buscar mensagem
    const mensagem = await base44.entities.MensagemWhatsapp.list().then(
      msgs => msgs.find(m => m.id === mensagem_id)
    );

    if (!mensagem) {
      return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    // Configurações da Evolution API
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionApiKey || !evolutionApiUrl || !instanceName) {
      return Response.json({ 
        error: 'Evolution API não configurada' 
      }, { status: 400 });
    }

    // Preparar payload para Evolution API
    let endpoint, payload;

    if (mensagem.tipo_conteudo === 'texto') {
      endpoint = `${evolutionApiUrl.replace(/\/$/, '')}/message/sendText`;
      payload = {
        number: telefone.replace(/\D/g, ''),
        text: mensagem.texto,
        instance: instanceName
      };
    } else {
      endpoint = `${evolutionApiUrl.replace(/\/$/, '')}/message/sendMedia`;
      payload = {
        number: telefone.replace(/\D/g, ''),
        mediaUrl: mensagem.arquivo_url,
        mediaType: mensagem.tipo_conteudo,
        instance: instanceName
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Evolution API error:', error);
      return Response.json({ 
        error: 'Erro ao enviar via WhatsApp',
        details: error 
      }, { status: 500 });
    }

    const result = await response.json();

    // Atualizar status da mensagem
    await base44.entities.MensagemWhatsapp.update(mensagem_id, {
      status: 'enviada',
      whatsapp_message_id: result.messageId || result.id
    });

    return Response.json({ 
      success: true, 
      messageId: result.messageId || result.id 
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
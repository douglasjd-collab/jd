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

    // Formatar número: garantir que tenha o formato correto (5587981404421)
    const numeroFormatado = telefone.replace(/\D/g, '');
    
    console.log('📤 Enviando mensagem:', {
      tipo: mensagem.tipo_conteudo,
      telefone: numeroFormatado,
      texto: mensagem.texto?.substring(0, 50)
    });

    if (mensagem.tipo_conteudo === 'texto') {
      endpoint = `${evolutionApiUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`;
      payload = {
        number: numeroFormatado,
        text: mensagem.texto
      };
    } else {
      endpoint = `${evolutionApiUrl.replace(/\/$/, '')}/message/sendMedia/${instanceName}`;
      payload = {
        number: numeroFormatado,
        mediaUrl: mensagem.arquivo_url,
        mediaType: mensagem.tipo_conteudo,
        fileName: mensagem.arquivo_nome || 'file'
      };
    }

    console.log('🔗 Endpoint:', endpoint);
    console.log('📦 Payload:', payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('📥 Response status:', response.status);
    console.log('📥 Response body:', responseText);

    if (!response.ok) {
      console.error('❌ Evolution API error:', responseText);
      return Response.json({ 
        error: 'Erro ao enviar via WhatsApp',
        details: responseText,
        status: response.status
      }, { status: 500 });
    }

    const result = JSON.parse(responseText);

    // Atualizar status da mensagem
    await base44.entities.MensagemWhatsapp.update(mensagem_id, {
      status: 'enviada',
      whatsapp_message_id: result.key?.id || result.messageId || result.id
    });

    console.log('✅ Mensagem enviada com sucesso!');

    return Response.json({ 
      success: true, 
      messageId: result.key?.id || result.messageId || result.id 
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
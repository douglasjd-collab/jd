import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // Validar método
  if (req.method === 'GET') {
    // Challenge para validação de webhook
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge');
    if (challenge) {
      return new Response(challenge);
    }
    return new Response('OK');
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const url = new URL(req.url);
    const instance = url.searchParams.get('instance');

    console.log('Webhook recebido:', { instance, data: body });

    // Validar chave (você pode adicionar validação extra)
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

    // Processar mensagens recebidas
    if (body.data?.message) {
      const message = body.data.message;
      const base44 = createClientFromRequest(req);

      // Extrair informações
      const telefone = message.from || body.from;
      const tipo = message.type; // text, image, audio, video, document
      const conteudo = message.text || message.caption;

      // Buscar conversa existente
      const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        cliente_telefone: telefone.replace(/\D/g, '')
      });

      let conversa;
      if (conversas.length === 0) {
        // Criar nova conversa
        conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
          empresa_id: body.empresa_id || conversas[0]?.empresa_id,
          cliente_id: '',
          cliente_nome: message.from_name || 'Cliente',
          cliente_telefone: telefone,
          whatsapp_id: message.id,
          status: 'ativa',
          ultima_mensagem: conteudo || tipo,
          data_ultima_mensagem: new Date().toISOString()
        });
      } else {
        conversa = conversas[0];
        // Atualizar última mensagem
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
          ultima_mensagem: conteudo || tipo,
          data_ultima_mensagem: new Date().toISOString()
        });
      }

      // Criar registro de mensagem
      let tipo_conteudo = 'texto';
      if (tipo === 'image') tipo_conteudo = 'imagem';
      if (tipo === 'audio') tipo_conteudo = 'audio';
      if (tipo === 'video') tipo_conteudo = 'video';
      if (tipo === 'document') tipo_conteudo = 'pdf';

      const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa.id,
        empresa_id: conversa.empresa_id,
        remetente: 'cliente',
        tipo_conteudo,
        texto: conteudo || '',
        arquivo_url: message.media?.url || '',
        arquivo_nome: message.media?.name || '',
        arquivo_tamanho: message.media?.size || 0,
        whatsapp_message_id: message.id,
        data_envio: new Date().toISOString(),
        status: 'entregue'
      });

      console.log('Mensagem processada:', novaMensagem.id);
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Erro no webhook:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});
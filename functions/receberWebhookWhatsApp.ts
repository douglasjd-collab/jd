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

    console.log('🔔 Webhook recebido:', { event: body.event, instance, timestamp: new Date().toISOString() });
    console.log('📋 Body completo:', JSON.stringify(body).substring(0, 300));

    // Ignorar eventos de atualização de status (não são mensagens novas)
    if (body.event === 'messages.update') {
      console.log('⏭️ Ignorado: Evento messages.update (apenas atualização de status)');
      return Response.json({ success: true, skipped: 'status_update' });
    }

    // Ignorar mensagens enviadas pelo bot (fromMe: true) - apenas para messages.upsert
    if (body.event === 'messages.upsert' && body.data?.key?.fromMe === true) {
      console.log('⏭️ Ignorado: Mensagem enviada pelo bot, não pelo cliente');
      return Response.json({ success: true, skipped: 'from_bot' });
    }

    // Validar chave (você pode adicionar validação extra)
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

    // Processar diferentes formatos de webhook
    let message = null;
    let telefone = null;
    let tipo = null;
    let conteudo = null;

    // Formato 1: body.data.message (novo formato Evolution messages.upsert)
    if (body.event === 'messages.upsert' && body.data?.message) {
      message = body.data.message;
      // Para messages.upsert, o telefone está em body.data.key.remoteJid
      telefone = body.data.key?.remoteJid || message.from;
      tipo = message.type;
      conteudo = message.conversation || message.text || message.caption;
      console.log('✓ Formato 1 detectado (messages.upsert)');
    }
    // Formato 2: body.messages (webhook direto)
    else if (body.messages && body.messages.length > 0) {
      message = body.messages[0];
      telefone = message.from || message.sender;
      tipo = message.type;
      conteudo = message.body || message.text;
      console.log('✓ Formato 2 detectado (body.messages)');
    }
    // Formato 3: propriedades diretas
    else if (body.from && body.type) {
      message = body;
      telefone = body.from;
      tipo = body.type;
      conteudo = body.body || body.text;
      console.log('✓ Formato 3 detectado (propriedades diretas)');
    }

    if (!message) {
      console.warn('⚠️ Nenhum formato de mensagem reconhecido. Event:', body.event, 'Body:', JSON.stringify(body).substring(0, 300));
      return Response.json({ success: true, skipped: 'unknown_format' });
    }

    if (message && telefone && tipo !== undefined) {
      const base44 = createClientFromRequest(req);

      // Extrair apenas números do telefone
      const telefoneLimpo = String(telefone).replace(/\D/g, '');
      console.log('📱 Telefone extraído:', telefoneLimpo);

      // Buscar conversa existente
      const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        cliente_telefone: telefoneLimpo
      });
      console.log('🔍 Conversas encontradas:', conversas.length);

      let conversa;
      if (conversas.length === 0) {
        // Obter empresa padrão ou usar super_admin
        let empresaId = body.empresa_id;
        if (!empresaId) {
          const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
          empresaId = empresas[0]?.id || 'default';
          console.log('🏢 Empresa selecionada:', empresaId);
        }

        // Criar nova conversa
        conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: '',
          cliente_nome: message.pushName || message.from_name || 'Cliente',
          cliente_telefone: telefoneLimpo,
          whatsapp_id: message.id || Date.now().toString(),
          status: 'ativa',
          ultima_mensagem: conteudo || tipo,
          data_ultima_mensagem: new Date().toISOString()
        });
        console.log('✨ Nova conversa criada:', conversa.id);
      } else {
        conversa = conversas[0];
        // Atualizar última mensagem
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
          ultima_mensagem: conteudo || tipo,
          data_ultima_mensagem: new Date().toISOString()
        });
        console.log('🔄 Conversa atualizada:', conversa.id);
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

      console.log('✅ Mensagem salva:', { id: novaMensagem.id, tipo: tipo_conteudo });
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIMEOUT_PADRAO = 8000;

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ erro: 'Apenas POST permitido' }, { status: 405 });
    }

    const payload = await req.json();
    const base44 = createClientFromRequest(req);

    console.log('📨 WEBHOOK RECEBIDO', JSON.stringify(payload).substring(0, 500));

    let event, data, instance;
    
    if (payload.event) {
      event = payload.event;
      data = payload.data;
      instance = payload.instance;
    } else if (payload.messages) {
      event = 'messages.upsert';
      data = { messages: payload.messages };
      instance = payload.instance;
    } else {
      console.warn('⚠️ Formato desconhecido');
      return Response.json({ status: 'invalid_format' });
    }

    if (!event?.includes('message') && event !== 'messages.upsert') {
      console.log(`⏭️ Ignorando evento: ${event}`);
      return Response.json({ status: 'ignored' });
    }

    let messageData = null;
    if (data?.message) {
      messageData = data.message;
    } else if (data?.messages?.length > 0) {
      messageData = data.messages[0];
    }

    if (!messageData) {
      console.warn('⚠️ Nenhuma mensagem');
      return Response.json({ status: 'no_message' });
    }

    const key = messageData.key || data?.key || {};
    const message = messageData.message || messageData || {};

    const messageId = key?.id || messageData?.id || `msg_${Date.now()}`;
    const fromMe = key?.fromMe === false ? false : (key?.fromMe || false);
    const remoteJid = key?.remoteJid || message?.remoteJid || data?.remoteJid || '';
    const pushName = data?.pushName || messageData?.pushName || 'Contato';
    const timestamp = messageData?.messageTimestamp || Math.floor(Date.now() / 1000);

    console.log(`📱 Mensagem: ${messageId} | De: ${!fromMe ? 'CLIENTE' : 'VENDEDOR'}`);

    let conteudo = '';
    let tipo = 'texto';

    if (message?.conversation) {
      conteudo = message.conversation;
    } else if (message?.text) {
      conteudo = message.text;
    } else if (message?.caption) {
      conteudo = message.caption;
      tipo = 'midia';
    } else if (message?.imageMessage) {
      tipo = 'imagem';
      conteudo = '[Imagem]';
    } else if (message?.videoMessage) {
      tipo = 'video';
      conteudo = '[Vídeo]';
    } else if (message?.audioMessage) {
      tipo = 'audio';
      conteudo = '[Áudio]';
    } else if (message?.documentMessage) {
      tipo = 'documento';
      conteudo = `[Documento]`;
    } else {
      console.log('⚠️ Tipo desconhecido');
      return Response.json({ status: 'unknown_type' });
    }

    let telefoneLimpo = remoteJid?.replace('@s.whatsapp.net', '')?.replace('@g.us', '') || '';
    
    if (!telefoneLimpo) {
      console.error('❌ Telefone inválido');
      return Response.json({ erro: 'Telefone inválido' }, { status: 400 });
    }

    console.log(`📞 Telefone: ${telefoneLimpo}`);

    // ENCONTRAR EMPRESA
    let empresaId = null;
    const instanceFinal = instance || 'DEFAULT';

    try {
      const todasEmpresas = await Promise.race([
        base44.asServiceRole.entities.Empresa.list('-created_date', 100),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_PADRAO))
      ]);
      
      let emp = todasEmpresas?.find(e => e.evolution_instance_name === instanceFinal);
      if (!emp && instanceFinal === 'DEFAULT') {
        emp = todasEmpresas?.find(e => e.whatsapp_conectado);
      }
      
      if (emp) {
        empresaId = emp.id;
        console.log(`✅ Empresa: ${emp.nome}`);
      } else {
        console.error(`❌ Empresa não encontrada`);
        return Response.json({ erro: 'Empresa não encontrada' }, { status: 400 });
      }
    } catch (err) {
      console.error(`❌ Erro ao buscar empresa: ${err.message}`);
      return Response.json({ erro: 'Erro ao buscar empresa' }, { status: 400 });
    }

    // BUSCAR CLIENTE
    let clienteId = '';
    try {
      const clientes = await Promise.race([
        base44.asServiceRole.entities.Cliente.filter({
          empresa_id: empresaId,
          celular: telefoneLimpo
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_PADRAO))
      ]);

      if (clientes?.length > 0) {
        clienteId = clientes[0].id;
        console.log(`✅ Cliente encontrado`);
      }
    } catch (err) {
      console.log(`⚠️ Erro ao buscar cliente: ${err.message}`);
    }

    // BUSCAR/CRIAR CONTATO
    let contato = null;
    try {
      let contatos = [];
      try {
        contatos = await Promise.race([
          base44.asServiceRole.entities.ContatoWhatsapp.filter({
            empresa_id: empresaId,
            telefone: telefoneLimpo
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_PADRAO))
        ]);
      } catch (err) {
        console.log(`⚠️ Erro ao buscar contatos`);
      }

      if (contatos?.length > 0) {
        contato = contatos[0];
        console.log(`✅ Contato encontrado`);
      } else {
        contato = await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: clienteId || '',
          telefone: telefoneLimpo,
          nome: pushName || 'Contato',
          ultima_atualizacao: new Date().toISOString()
        });
        console.log(`✅ Contato criado`);
      }
    } catch (err) {
      console.error(`❌ Erro contato: ${err.message}`);
    }

    // BUSCAR/CRIAR CONVERSA
    let conversas = [];
    try {
      conversas = await Promise.race([
        base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: empresaId,
          cliente_telefone: telefoneLimpo
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_PADRAO))
      ]);
    } catch (err) {
      console.log(`⚠️ Erro buscar conversas`);
    }

    let conversa = null;
    try {
      if (conversas?.length > 0) {
        conversa = conversas[0];
        try {
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
            ultima_mensagem: conteudo.substring(0, 200),
            data_ultima_mensagem: new Date().toISOString(),
            status: 'ativa',
            cliente_id: clienteId || conversa.cliente_id || '',
            instancia: instanceFinal
          });
        } catch (err) {
          console.log(`⚠️ Erro ao atualizar conversa`);
        }
      } else {
        conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: clienteId || '',
          cliente_nome: pushName,
          cliente_telefone: telefoneLimpo,
          whatsapp_id: messageId,
          status: 'ativa',
          ultima_mensagem: conteudo.substring(0, 200),
          data_ultima_mensagem: new Date().toISOString(),
          instancia: instanceFinal
        });
        console.log(`✅ Conversa criada`);
      }
    } catch (err) {
      console.error(`❌ Erro conversa: ${err.message}`);
      return Response.json({ erro: 'Falha ao processar conversa' }, { status: 400 });
    }

    if (!conversa?.id) {
      console.error('❌ Conversa sem ID');
      return Response.json({ erro: 'Conversa inválida' }, { status: 400 });
    }

    // CRIAR MENSAGEM
    let mensagemId = '';
    try {
      const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa.id,
        empresa_id: empresaId,
        remetente: fromMe ? 'vendedor' : 'cliente',
        tipo_conteudo: tipo,
        texto: conteudo,
        whatsapp_message_id: messageId,
        data_envio: new Date(timestamp * 1000).toISOString(),
        status: fromMe ? 'enviada' : 'entregue'
      });
      mensagemId = novaMensagem.id;
      console.log(`✅ Mensagem criada: ${mensagemId}`);
    } catch (err) {
      console.error(`❌ Erro ao criar mensagem: ${err.message}`);
      return Response.json({ erro: 'Falha ao criar mensagem' }, { status: 400 });
    }

    // REGISTRAR LOG
    try {
      await Promise.race([
        base44.asServiceRole.entities.LogRecebimentoWebhook.create({
          empresa_id: empresaId,
          tipo_evento: 'mensagem_recebida',
          telefone: telefoneLimpo,
          conteudo: conteudo.substring(0, 500),
          status: 'sucesso',
          mensagem_id: mensagemId,
          conversa_id: conversa.id,
          instancia: instanceFinal,
          timestamp: new Date().toISOString()
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_PADRAO))
      ]);
    } catch (err) {
      console.log(`⚠️ Erro log`);
    }

    console.log(`✅ WEBHOOK OK`);

    return Response.json({
      success: true,
      message_id: mensagemId,
      conversation_id: conversa.id,
      empresa_id: empresaId
    });
  } catch (err) {
    console.error(`❌ ERRO CRÍTICO`, err.message);
    return Response.json({ erro: err.message }, { status: 500 });
  }
});
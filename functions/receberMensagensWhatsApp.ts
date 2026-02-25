import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const JD_ID = 'JD_DEFAULT_ID'; // Padrão se não encontrar empresa

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ erro: 'Apenas POST permitido' }, { status: 405 });
    }

    const payload = await req.json();
    const base44 = createClientFromRequest(req);

    // ──────────────────────────────────────────────────────────────────
    // 1. EXTRAIR DADOS DO WEBHOOK
    // ──────────────────────────────────────────────────────────────────
    console.log('📨 WEBHOOK RECEBIDO', JSON.stringify(payload).substring(0, 500));

    const { event, data, instance } = payload;

    // Ignorar eventos que não são mensagens
    if (!event?.includes('message') && event !== 'messages.upsert') {
      console.log(`⏭️ Ignorando evento: ${event}`);
      return Response.json({ status: 'ignored' });
    }

    // Extrair informações da mensagem
    let messageData = data?.message;
    if (!messageData && data?.messages?.length > 0) {
      messageData = data.messages[0];
    }

    if (!messageData) {
      console.warn('⚠️ Nenhuma mensagem encontrada no payload');
      return Response.json({ status: 'no_message' });
    }

    const key = messageData.key || data?.key;
    const message = messageData.message || messageData;

    const messageId = key?.id || messageData.id;
    const fromMe = key?.fromMe || message?.fromMe || false;
    const remoteJid = key?.remoteJid || message?.remoteJid || data?.remoteJid;
    const pushName = data?.pushName || 'Contato';
    const timestamp = messageData.messageTimestamp || Math.floor(Date.now() / 1000);

    console.log(`📱 Mensagem: ${messageId} | De: ${!fromMe ? 'CLIENTE' : 'VENDEDOR'} | JID: ${remoteJid}`);

    // Extrair conteúdo da mensagem
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
      conteudo = `[Documento: ${message.documentMessage?.fileName || 'sem nome'}]`;
    } else {
      console.log('⚠️ Tipo de mensagem desconhecido');
      return Response.json({ status: 'unknown_type' });
    }

    console.log(`💬 Conteúdo: "${conteudo.substring(0, 100)}"`);

    // ──────────────────────────────────────────────────────────────────
    // 2. VALIDAR E LIMPAR TELEFONE
    // ──────────────────────────────────────────────────────────────────
    let telefoneLimpo = remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '');
    if (!telefoneLimpo) {
      console.error('❌ Telefone não encontrado');
      return Response.json({ erro: 'Telefone inválido' }, { status: 400 });
    }

    console.log(`📞 Telefone: ${telefoneLimpo}`);

    // ──────────────────────────────────────────────────────────────────
    // 3. ENCONTRAR EMPRESA
    // ──────────────────────────────────────────────────────────────────
    let empresaId = JD_ID;
    const instanceFinal = instance || 'DEFAULT';

    if (instanceFinal && instanceFinal !== 'DEFAULT') {
      try {
        const empresas = await Promise.race([
          base44.asServiceRole.entities.Empresa.filter({
            evolution_instance_name: instanceFinal
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
        ]);

        if (empresas?.length > 0) {
          empresaId = empresas[0].id;
          console.log(`✅ Empresa encontrada: ${empresas[0].nome}`);
        } else {
          console.log(`⚠️ Instância "${instanceFinal}" não encontrada, usando padrão`);
        }
      } catch (err) {
        console.log(`⚠️ Erro ao buscar empresa: ${err.message}`);
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // 4. BUSCAR OU CRIAR CLIENTE
    // ──────────────────────────────────────────────────────────────────
    let clienteId = '';
    try {
      const clientes = await Promise.race([
        base44.asServiceRole.entities.Cliente.filter({
          empresa_id: empresaId,
          celular: telefoneLimpo
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);

      if (clientes?.length > 0) {
        clienteId = clientes[0].id;
        console.log(`✅ Cliente encontrado: ${clienteId}`);
      }
    } catch (err) {
      console.log(`⚠️ Erro ao buscar cliente: ${err.message}`);
    }

    // ──────────────────────────────────────────────────────────────────
    // 5. BUSCAR OU CRIAR CONTATO WHATSAPP
    // ──────────────────────────────────────────────────────────────────
    let contato = null;
    try {
      let contatos = [];
      try {
        contatos = await Promise.race([
          base44.asServiceRole.entities.ContatoWhatsapp.filter({
            empresa_id: empresaId,
            telefone: telefoneLimpo
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
        ]);
      } catch (err) {
        console.log(`⚠️ Erro ao buscar contatos: ${err.message}`);
      }

      if (contatos?.length > 0) {
        contato = contatos[0];
        console.log(`✅ Contato encontrado: ${contato.id}`);
      } else {
        contato = await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: clienteId || '',
          telefone: telefoneLimpo,
          nome: pushName || 'Contato WhatsApp',
          ultima_atualizacao: new Date().toISOString()
        });
        console.log(`✅ Contato criado: ${contato.id}`);
      }
    } catch (err) {
      console.error(`❌ Erro ao processar contato: ${err.message}`);
    }

    // ──────────────────────────────────────────────────────────────────
    // 6. BUSCAR OU CRIAR CONVERSA
    // ──────────────────────────────────────────────────────────────────
    let conversas = [];
    try {
      conversas = await Promise.race([
        base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: empresaId,
          cliente_telefone: telefoneLimpo
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);
      console.log(`✅ Conversas encontradas: ${conversas?.length || 0}`);
    } catch (err) {
      console.log(`⚠️ Erro ao buscar conversas: ${err.message}`);
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
          console.log(`✅ Conversa atualizada: ${conversa.id}`);
        } catch (err) {
          console.log(`⚠️ Erro ao atualizar conversa: ${err.message}`);
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
        console.log(`✅ Conversa criada: ${conversa.id}`);
      }
    } catch (err) {
      console.error(`❌ Erro ao processar conversa: ${err.message}`);
      return Response.json({ erro: 'Falha ao criar/atualizar conversa' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────────
    // 7. CRIAR MENSAGEM
    // ──────────────────────────────────────────────────────────────────
    if (!conversa?.id) {
      console.error('❌ Conversa sem ID válido');
      return Response.json({ erro: 'Conversa inválida' }, { status: 400 });
    }

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

    // ──────────────────────────────────────────────────────────────────
    // 8. REGISTRAR LOG
    // ──────────────────────────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
        empresa_id: empresaId,
        tipo_evento: 'mensagem_recebida',
        telefone: telefoneLimpo,
        conteudo: conteudo.substring(0, 500),
        status: 'sucesso',
        mensagem_id: mensagemId,
        conversa_id: conversa.id,
        instancia: instanceFinal,
        timestamp: new Date().toISOString()
      });
      console.log(`✅ Log registrado`);
    } catch (err) {
      console.log(`⚠️ Erro ao registrar log: ${err.message}`);
    }

    console.log(`\n✅✅✅ WEBHOOK PROCESSADO COM SUCESSO ✅✅✅\n`);

    return Response.json({
      success: true,
      message_id: mensagemId,
      conversation_id: conversa.id,
      status: 'processado'
    });
  } catch (err) {
    console.error(`\n❌❌❌ ERRO CRÍTICO ❌❌❌`, err);
    return Response.json(
      { erro: err.message, type: 'critical' },
      { status: 500 }
    );
  }
});
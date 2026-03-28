import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const timestamp = new Date().toISOString();
    let bodyText = '';
    let body = null;

    try {
      bodyText = await req.clone().text();
      if (bodyText) body = JSON.parse(bodyText);
    } catch (e) {
      body = { raw: bodyText };
    }

    // ════════════════════════════════════════════════════════════════════
    // LOGAR TUDO - SEM FILTROS
    // ════════════════════════════════════════════════════════════════════
    console.log(`\n${'='.repeat(100)}`);
    console.log(`🪝 WEBHOOK AGRESSIVO RECEBIDO: ${timestamp}`);
    console.log(`${'='.repeat(100)}`);
    console.log('RAW BODY:', JSON.stringify(body, null, 2).slice(0, 500));
    console.log(`${'='.repeat(100)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // EXTRAIR DADOS COM MÁXIMA FLEXIBILIDADE
    // ════════════════════════════════════════════════════════════════════
    let telefone = null;
    let mensagemTexto = null;
    let messageId = null;
    let remetente = 'cliente';

    // Estratégia 1: Evolution API formato padrão
    if (body?.data?.message) {
      const msg = body.data.message;
      telefone = (msg.from || msg.sender || msg.phone || '').replace(/\D/g, '');
      mensagemTexto = msg.body || msg.text || msg.message || '';
      messageId = msg.id || msg.key?.id || msg.messageId;
      remetente = (msg.fromMe || msg.from_me || msg.me) ? 'vendedor' : 'cliente';
    }

    // Estratégia 2: Baileys/WhatsApp Web
    if (!telefone && body?.event === 'messages.upsert' && body.data?.messages) {
      const msg = body.data.messages[0];
      telefone = (msg.key?.remoteJid || msg.from || '').split('@')[0].replace(/\D/g, '');
      mensagemTexto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      messageId = msg.key?.id;
      remetente = msg.key?.fromMe ? 'vendedor' : 'cliente';
    }

    // Estratégia 3: Formato genérico
    if (!telefone && body?.data) {
      telefone = (body.data.from || body.data.sender || body.data.phone || body.data.jid || '').replace(/\D/g, '');
      mensagemTexto = body.data.body || body.data.text || body.data.message || body.data.content || '';
      messageId = body.data.id || body.data.messageId || body.data.message_id;
      remetente = (body.data.fromMe || body.data.from_me || body.data.sent) ? 'vendedor' : 'cliente';
    }

    // Estratégia 4: Procurar em qualquer lugar do body
    if (!telefone) {
      const bodyStr = JSON.stringify(body);
      const matches = bodyStr.match(/[0-9]{10,15}/g);
      if (matches) {
        telefone = matches[0].replace(/\D/g, '').slice(-11); // Pegar últimos 11 dígitos
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // SE ENCONTROU TELEFONE, SALVAR SEM QUESTIONAMENTOS
    // ════════════════════════════════════════════════════════════════════
    if (telefone && telefone.length >= 10) {
      console.log(`\n✅ DADOS EXTRAÍDOS:`);
      console.log(`   Telefone: ${telefone}`);
      console.log(`   Mensagem: "${(mensagemTexto || '').slice(0, 50)}..."`);
      console.log(`   ID: ${messageId || 'SEM ID'}`);
      console.log(`   Remetente: ${remetente}\n`);

      try {
        // Buscar ou criar TUDO
        const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
        let empresaId = empresas[0]?.id;

        if (!empresaId) {
          const novaEmp = await base44.asServiceRole.entities.Empresa.create({
            nome: 'JD Promotora',
            status: 'ativa',
          });
          empresaId = novaEmp.id;
          console.log(`[EMPRESA] Criada: ${empresaId}`);
        } else {
          console.log(`[EMPRESA] ${empresaId}`);
        }

        // ════════════════════════════════════════════════════════════════════
        // CLIENTE - Criar se não existir
        // ════════════════════════════════════════════════════════════════════
        let clientes = await base44.asServiceRole.entities.Cliente.filter({
          empresa_id: empresaId,
          celular: telefone,
        }, null, 1);

        let clienteId = clientes[0]?.id;
        if (!clienteId) {
          const novoCliente = await base44.asServiceRole.entities.Cliente.create({
            empresa_id: empresaId,
            tipo_pessoa: 'Física',
            nome_completo: `Contato ${telefone}`,
            celular: telefone,
            status: 'ativo',
          });
          clienteId = novoCliente.id;
          console.log(`[CLIENTE] Criado: ${clienteId}`);
        } else {
          console.log(`[CLIENTE] ${clienteId}`);
        }

        // ════════════════════════════════════════════════════════════════════
        // CONVERSA - Criar se não existir
        // ════════════════════════════════════════════════════════════════════
        let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: empresaId,
          cliente_telefone: telefone,
        }, null, 1);

        let conversaId = conversas[0]?.id;
        if (!conversaId) {
          const novaConversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: empresaId,
            cliente_id: clienteId,
            cliente_nome: `Contato ${telefone}`,
            cliente_telefone: telefone,
            whatsapp_id: `${telefone}@s.whatsapp.net`,
            status: 'ativa',
            tipo_conexao: 'empresa',
          });
          conversaId = novaConversa.id;
          console.log(`[CONVERSA] Criada: ${conversaId}`);
        } else {
          console.log(`[CONVERSA] ${conversaId}`);
        }

        // ════════════════════════════════════════════════════════════════════
        // MENSAGEM - Salvar SEM VERIFICAÇÃO DE DUPLICATA
        // ════════════════════════════════════════════════════════════════════
        const novaMsg = await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: conversaId,
          empresa_id: empresaId,
          remetente: remetente,
          tipo_conteudo: 'texto',
          texto: (mensagemTexto || '[Sem conteúdo]').slice(0, 2000),
          whatsapp_message_id: messageId || `webhook_${timestamp}`,
          data_envio: new Date().toISOString(),
          status: 'entregue',
        });

        console.log(`[MSG] Salva agressivamente: ${novaMsg.id}`);

        // Atualizar conversa
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaId, {
          ultima_mensagem: (mensagemTexto || '[Sem conteúdo]').slice(0, 100),
          data_ultima_mensagem: new Date().toISOString(),
        });

        console.log(`${'='.repeat(100)}`);
        console.log('✅ WEBHOOK PROCESSADO AGRESSIVAMENTE COM SUCESSO');
        console.log(`${'='.repeat(100)}\n`);

        return Response.json({ success: true, conversaId, mensagemId: novaMsg.id });

      } catch (err) {
        console.error(`[ERRO] ${err.message}`);
        console.error(err.stack);
        return Response.json({ error: err.message }, { status: 500 });
      }

    } else {
      console.log('⚠️ Não foi possível extrair telefone do webhook');
      console.log(`Body recebido: ${JSON.stringify(body).slice(0, 200)}`);
      return Response.json({ success: true, message: 'Webhook recebido mas sem telefone' });
    }

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
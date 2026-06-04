import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    // ════════════════════════════════════════════════════════════════════
    // RECEBER WEBHOOK DA EVOLUTION API
    // Esta função processa mensagens recebidas do WhatsApp via Evolution
    // ════════════════════════════════════════════════════════════════════

    const timestamp = new Date().toISOString();
    const method = req.method;
    let body = null;
    let bodyText = '';

    try {
      bodyText = await req.clone().text();
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          body = { raw: bodyText };
        }
      }
    } catch (e) {
      console.error('[ERRO] Falha ao ler body:', e.message);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${timestamp}] 🪝 WEBHOOK RECEBIDO`);
    console.log(`METHOD: ${method}`);
    console.log(`EVENT: ${body?.event || body?.type || 'unknown'}`);
    console.log(`${'='.repeat(80)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [1] Autenticar com Base44
    // ════════════════════════════════════════════════════════════════════
    let base44 = null;
    try {
      base44 = createClientFromRequest(req);
      // Não precisa de user para processar webhook
    } catch (e) {
      console.warn('[WARN] Falha ao criar cliente Base44:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // [2] Detectar tipo de evento e extrair dados
    // ════════════════════════════════════════════════════════════════════
    let eventType = null;
    let telefone = null;
    let mensagemTexto = null;
    let instancia = null;
    let empresaId = null;
    let clienteNome = null;
    let messageId = null;

    let remetente = 'cliente'; // Padrão: mensagem recebida
    
    if (body?.data?.message) {
      // Formato: Evolution API webhook padrão
      eventType = 'message';
      const msg = body.data.message;
      
      // Detectar se é mensagem ENVIADA (fromMe) ou RECEBIDA
      if (msg.fromMe || msg.from_me || msg.me) {
        remetente = 'vendedor';
        telefone = (msg.to || msg.recipient || '').replace(/\D/g, '');
      } else {
        remetente = 'cliente';
        telefone = (msg.from || msg.sender || '').replace(/\D/g, '');
      }
      
      mensagemTexto = msg.body || msg.text || '';
      instancia = body.instance?.name || 'JDPROMOTORA';
      messageId = msg.id || msg.key?.id;
      clienteNome = msg.contact?.name || `Contato ${telefone}`;
    } else if (body?.event === 'messages.upsert') {
      // Formato: Baileys/WhatsApp Web
      eventType = 'message';
      if (body.data?.messages && body.data.messages.length > 0) {
        const msg = body.data.messages[0];
        
        // Detectar se é mensagem ENVIADA (fromMe) ou RECEBIDA
        if (msg.key?.fromMe) {
          remetente = 'vendedor';
          telefone = (msg.key?.remoteJid || '').split('@')[0].replace(/\D/g, '');
        } else {
          remetente = 'cliente';
          telefone = (msg.key?.remoteJid || msg.from || '').split('@')[0].replace(/\D/g, '');
        }
        
        mensagemTexto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        messageId = msg.key?.id || msg.id;
        instancia = body.instance || 'JDPROMOTORA';
      }
    } else if (body?.data?.status) {
      // Status de mensagem
      eventType = 'status';
      console.log(`[STATUS] Mensagem: ${body.data.status.id} → ${body.data.status.status}`);
    } else if (body?.data) {
      // Qualquer outro formato
      eventType = 'other';
      telefone = (body.data.from || body.data.sender || body.data.phone || '').replace(/\D/g, '');
      mensagemTexto = body.data.body || body.data.text || body.data.message || '';
      messageId = body.data.id || body.data.messageId || body.data.message_id;
      console.log(`[INFO] Webhook genérico processado`);
    }

    // Ser MENOS rigoroso: aceitar mesmo se faltar dados
    if (!telefone) {
      console.log('[WARN] Telefone não extraído do webhook');
      return Response.json({ success: true, message: 'Webhook recebido mas sem telefone' });
    }

    // Se mensagem estiver vazia, usar placeholder
    if (!mensagemTexto) {
      mensagemTexto = '[Mensagem sem conteúdo]';
    }

    console.log(`[DATA] Telefone: ${telefone}`);
    console.log(`[DATA] Mensagem: "${mensagemTexto.slice(0, 50)}..."`);
    console.log(`[DATA] ID: ${messageId}`);
    console.log(`[DATA] Remetente: ${remetente}`);

    // ════════════════════════════════════════════════════════════════════
    // [3] Determinar empresa
    // ════════════════════════════════════════════════════════════════════
    if (base44) {
      try {
        const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
        if (empresas.length > 0) {
          empresaId = empresas[0].id;
          console.log(`[EMPRESA] ${empresaId}`);
        }
      } catch (e) {
        console.warn('[WARN] Falha ao buscar empresa:', e.message);
      }
    }

    if (!empresaId) {
      console.warn('[WARN] Empresa não encontrada - criando padrão');
      // Criar empresa padrão se não existir
      try {
        const novaEmpresa = await base44.asServiceRole.entities.Empresa.create({
          nome: 'JD Promotora',
          status: 'ativa',
        });
        empresaId = novaEmpresa.id;
        console.log(`[EMPRESA] Criada: ${empresaId}`);
      } catch (e) {
        console.error('Erro ao criar empresa:', e.message);
        return Response.json({ error: 'Sem empresa' }, { status: 500 });
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // [4] Buscar ou criar Cliente
    // ════════════════════════════════════════════════════════════════════
    let clienteId = null;
    try {
      const clientesExistentes = await base44.asServiceRole.entities.Cliente.filter({
        empresa_id: empresaId,
        celular: telefone,
      }, null, 10);

      if (clientesExistentes.length > 0) {
        clienteId = clientesExistentes[0].id;
        clienteNome = clientesExistentes[0].nome_completo || clienteNome;
        console.log(`[CLIENTE] Encontrado: ${clienteId}`);
      } else {
        // Criar novo cliente
        const novoCliente = await base44.asServiceRole.entities.Cliente.create({
          empresa_id: empresaId,
          tipo_pessoa: 'Física',
          nome_completo: clienteNome || `Contato ${telefone}`,
          celular: telefone,
          status: 'ativo',
        });
        clienteId = novoCliente.id;
        console.log(`[CLIENTE] Criado: ${clienteId}`);
      }
    } catch (err) {
      console.warn('[WARN] Erro ao processar cliente:', err.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // [5] Buscar ou criar Conversa
    // ════════════════════════════════════════════════════════════════════
    let conversaId = null;
    try {
      const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        empresa_id: empresaId,
        cliente_telefone: telefone,
      }, null, 10);

      if (conversasExistentes.length > 0) {
        const conv = conversasExistentes[0];
        conversaId = conv.id;
        console.log(`[CONVERSA] Encontrada: ${conversaId}`);
        // Não sobrescrever conversa Meta Oficial com tipo_conexao de Evolution
        if (conv.tipo_conexao !== 'meta_oficial' && conv.instancia !== 'META_OFICIAL') {
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaId, {
            ultima_mensagem: mensagemTexto.slice(0, 100),
            data_ultima_mensagem: new Date().toISOString(),
          });
        }
      } else {
        // Criar nova conversa
        const novaConversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: clienteId,
          cliente_nome: clienteNome || `Contato ${telefone}`,
          cliente_telefone: telefone,
          whatsapp_id: `${telefone}@s.whatsapp.net`,
          status: 'ativa',
          ultima_mensagem: mensagemTexto.slice(0, 100),
          data_ultima_mensagem: new Date().toISOString(),
          tipo_conexao: 'empresa',
          instancia: instancia || 'JDPROMOTORA',
        });
        conversaId = novaConversa.id;
        console.log(`[CONVERSA] Criada: ${conversaId}`);
      }
    } catch (err) {
      console.error('[ERRO] Falha ao processar conversa:', err.message);
      return Response.json({ error: 'Falha ao processar conversa' }, { status: 500 });
    }

    // ════════════════════════════════════════════════════════════════════
    // [6] Salvar Mensagem (verificar duplicata primeiro)
    // ════════════════════════════════════════════════════════════════════
    let mensagemId = null;
    try {
      // Verificar se já existe (MAS não bloquear se messageId for vazio)
      if (messageId) {
        const msgExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
          conversa_id: conversaId,
          whatsapp_message_id: messageId,
        }, null, 1);

        if (msgExistentes.length > 0) {
          console.log(`[MSG] Duplicata detectada com ID ${messageId}, pulando`);
          return Response.json({ success: true, message: 'Duplicata ignorada' });
        }
      } else {
        console.log(`[WARN] Sem messageId, salvando mesmo assim`);
      }

      // Criar mensagem
      const novaMsg = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversaId,
        empresa_id: empresaId,
        remetente: remetente,
        tipo_conteudo: 'texto',
        texto: mensagemTexto,
        whatsapp_message_id: messageId || null,
        data_envio: new Date().toISOString(),
        status: 'entregue',
      });
      mensagemId = novaMsg.id;
      console.log(`[MSG] Criada: ${mensagemId}`);

      // Atualizar última mensagem da conversa
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaId, {
        ultima_mensagem: mensagemTexto.slice(0, 100),
        data_ultima_mensagem: new Date().toISOString(),
      });
      console.log(`[CONVERSA] Atualizada com última mensagem`);

    } catch (err) {
      console.error('[ERRO] Falha ao salvar mensagem:', err.message);
      console.log('[RETRY] Tentando novamente com dados minimalistas...');
      
      try {
        // Tentar novamente com dados minimalistas
        const novaMsg = await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: conversaId,
          empresa_id: empresaId,
          remetente: remetente || 'cliente',
          tipo_conteudo: 'texto',
          texto: (mensagemTexto || '').slice(0, 500),
          data_envio: new Date().toISOString(),
          status: 'entregue',
        });
        mensagemId = novaMsg.id;
        console.log(`[MSG-RETRY] Criada com sucesso: ${mensagemId}`);

        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaId, {
          ultima_mensagem: (mensagemTexto || '').slice(0, 100),
          data_ultima_mensagem: new Date().toISOString(),
        });
      } catch (retryErr) {
        console.error('[ERRO-RETRY] Falha novamente:', retryErr.message);
        return Response.json({ error: 'Falha ao salvar mensagem' }, { status: 500 });
      }
    }

    console.log(`${'='.repeat(80)}`);
    console.log('✅ WEBHOOK PROCESSADO COM SUCESSO');
    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      conversaId,
      mensagemId,
      clienteId,
      telefone,
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    console.log('\n' + '='.repeat(80));
    console.log('📨 WEBHOOK RECEBIDO - DUAL API (Oficial + Evolution)');
    console.log('='.repeat(80));

    // ════════════════════════════════════════════════════════════════════
    // [1] DETECTAR QUAL API ENVIOU
    // ════════════════════════════════════════════════════════════════════
    let tipoAPI = null;
    let telefone = null;
    let texto = null;
    let msgId = null;
    let timestamp = null;
    let fromMe = false;

    // API Oficial (WhatsApp Business API)
    if (body.entry && Array.isArray(body.entry)) {
      tipoAPI = 'OFICIAL';
      console.log('✅ Detectada: API OFICIAL (WhatsApp Business)');

      const entry = body.entry[0];
      const change = entry.changes[0];
      const message = change.value.messages?.[0];
      const contact = change.value.contacts?.[0];

      if (message) {
        telefone = message.from;
        msgId = message.id;
        timestamp = message.timestamp;
        texto = message.text?.body || message.image?.caption || '[Mídia]';
      }
    }
    // API Evolution
    else if (body.data?.message || body.message) {
      tipoAPI = 'EVOLUTION';
      console.log('✅ Detectada: API EVOLUTION');

      const msg = body.data?.message || body.message;
      telefone = msg.from || msg.sender;
      msgId = msg.id || msg.key?.id;
      timestamp = msg.messageTimestamp || msg.timestamp;
      texto = msg.body || msg.message?.conversation || '[Mídia]';
      fromMe = msg.key?.fromMe || false;
    }

    if (!tipoAPI || !telefone || !texto) {
      console.log('❌ Payload inválido ou não reconhecido');
      return Response.json({ error: 'Payload inválido' }, { status: 400 });
    }

    const telefoneLimpo = String(telefone).replace(/\D/g, '');
    console.log(`📱 Telefone: ${telefoneLimpo}`);
    console.log(`💬 Mensagem: ${texto.slice(0, 50)}...`);
    console.log(`🔑 ID: ${msgId}`);

    // ════════════════════════════════════════════════════════════════════
    // [2] GARANTIR EMPRESA
    // ════════════════════════════════════════════════════════════════════
    let empresas = await base44.asServiceRole.entities.Empresa.filter(
      { status: 'ativa' },
      null,
      1
    );
    if (empresas.length === 0) {
      return Response.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
    }

    const empresaId = empresas[0].id;
    console.log(`✅ Empresa: ${empresaId}`);

    // ════════════════════════════════════════════════════════════════════
    // [3] GARANTIR CLIENTE
    // ════════════════════════════════════════════════════════════════════
    let clientes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefoneLimpo,
    }, null, 1);

    let cliente;
    if (clientes.length === 0) {
      cliente = await base44.asServiceRole.entities.Cliente.create({
        empresa_id: empresaId,
        tipo_pessoa: 'Física',
        celular: telefoneLimpo,
        email: `${telefoneLimpo}@whatsapp.local`,
        nome_completo: `Contato ${telefoneLimpo}`,
        status: 'ativo',
      });
      console.log(`✨ Cliente criado: ${cliente.id}`);
    } else {
      cliente = clientes[0];
      console.log(`✅ Cliente: ${cliente.id}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [4] GARANTIR CONVERSA
    // ════════════════════════════════════════════════════════════════════
    let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_id: cliente.id,
      cliente_telefone: telefoneLimpo,
    }, null, 1);

    let conversa;
    if (conversas.length === 0) {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: cliente.id,
        cliente_nome: cliente.nome_completo,
        cliente_telefone: telefoneLimpo,
        whatsapp_id: telefoneLimpo,
        status: 'ativa',
        tipo_conexao: 'empresa',
        instancia: tipoAPI,
      });
      console.log(`✨ Conversa criada: ${conversa.id}`);
    } else {
      conversa = conversas[0];
      console.log(`✅ Conversa: ${conversa.id}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [5] VERIFICAR DUPLICATA
    // ════════════════════════════════════════════════════════════════════
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
      whatsapp_message_id: String(msgId),
    }, null, 1);

    if (existentes.length > 0) {
      console.log('⏭️  Mensagem duplicada, pulando...');
      return Response.json({ sucesso: true, duplicata: true });
    }

    // ════════════════════════════════════════════════════════════════════
    // [6] INSERIR MENSAGEM
    // ════════════════════════════════════════════════════════════════════
    const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: fromMe ? 'vendedor' : 'cliente',
      usuario_id: null,
      usuario_nome: null,
      tipo_conteudo: 'texto',
      texto: String(texto).slice(0, 5000),
      arquivo_url: null,
      arquivo_nome: null,
      arquivo_tamanho: 0,
      whatsapp_message_id: String(msgId),
      data_envio: new Date(timestamp * 1000).toISOString(),
      status: 'entregue',
    });

    console.log(`✅ Mensagem inserida: ${mensagem.id}`);

    // ════════════════════════════════════════════════════════════════════
    // [7] ATUALIZAR CONVERSA
    // ════════════════════════════════════════════════════════════════════
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: texto.slice(0, 100),
      data_ultima_mensagem: new Date().toISOString(),
      instancia: tipoAPI,
    });

    console.log('='.repeat(80));
    console.log('✅ SUCESSO');
    console.log('='.repeat(80) + '\n');

    return Response.json({
      sucesso: true,
      tipoAPI,
      telefone: telefoneLimpo,
      cliente_id: cliente.id,
      conversa_id: conversa.id,
      mensagem_id: mensagem.id,
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
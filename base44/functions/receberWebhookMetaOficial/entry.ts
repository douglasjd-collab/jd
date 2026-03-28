import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    // ════════════════════════════════════════════════════════════════════
    // [1] VERIFICAÇÃO INICIAL (GET request para validar webhook)
    // ════════════════════════════════════════════════════════════════════
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // ⚠️ IMPORTANTE: Use exatamente o token que você configurou na Meta
      const VERIFY_TOKEN_ESPERADO = 'nxk3Ee0eWjuwI9VKdQCGpHEFZbxNlK9t';

      console.log('🔍 Validação de webhook recebida');
      console.log(`   mode=${mode}, token=${token?.substring(0,8)}..., challenge=${challenge?.substring(0,8)}...`);

      // Resposta simples e direta para Meta - EXATAMENTE como Meta espera
      if (mode === 'subscribe' && token === VERIFY_TOKEN_ESPERADO && challenge) {
        console.log('✅ WEBHOOK VALIDADO - Retornando challenge:', challenge);
        return new Response(challenge);
      }

      console.log('❌ Validação falhou');
      console.log(`   Modo correto: ${mode === 'subscribe'}`);
      console.log(`   Token match: ${token === VERIFY_TOKEN_ESPERADO}`);
      console.log(`   Challenge presente: ${!!challenge}`);
      return new Response('', { status: 403 });
    }

    // ════════════════════════════════════════════════════════════════════
    // [2] PROCESSAR WEBHOOK POST (mensagens reais)
    // ════════════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const body = await req.json();

      console.log('\n' + '='.repeat(80));
      console.log('📨 WEBHOOK POST - API OFICIAL WHATSAPP (META)');
      console.log('='.repeat(80));

      // Validar estrutura da Meta
      if (!body.entry || !Array.isArray(body.entry)) {
        console.log('⚠️  Payload da Meta inválido');
        return Response.json({ ok: true }); // Meta espera 200 mesmo em erro
      }

      const entry = body.entry[0];
      if (!entry.changes || entry.changes.length === 0) {
        return Response.json({ ok: true });
      }

      const change = entry.changes[0];
      if (!change || !change.value) {
        return Response.json({ ok: true });
      }
      const value = change.value;

      // Pode ser uma mensagem ou uma confirmação de status
      if (!value.messages && !value.statuses) {
        console.log('✅ Notificação sem mensagem ou status - OK');
        return Response.json({ ok: true });
      }

      // ══════════════════════════════════════════════════════════════════
      // [3] EXTRAIR DADOS DA MENSAGEM
      // ══════════════════════════════════════════════════════════════════
      const message = value.messages?.[0];
      if (!message) {
        console.log('ℹ️  Apenas status (sem mensagem) - ignorando');
        return Response.json({ ok: true });
      }

      const telefone = String(message.from).replace(/\D/g, '');
      const msgId = message.id;
      const timestamp = message.timestamp;
      const texto = message.text?.body || '[Mídia]';

      console.log(`📱 Telefone: ${telefone}`);
      console.log(`💬 Mensagem: ${texto.slice(0, 50)}...`);
      console.log(`🔑 ID: ${msgId}`);

      // ══════════════════════════════════════════════════════════════════
      // [4] GARANTIR EMPRESA
      // ══════════════════════════════════════════════════════════════════
      const base44 = createClientFromRequest(req);
      let empresas = await base44.asServiceRole.entities.Empresa.filter(
        { status: 'ativa' },
        null,
        1
      );
      if (empresas.length === 0) {
        console.log('❌ Nenhuma empresa ativa');
        return Response.json({ ok: true });
      }

      const empresaId = empresas[0].id;
      console.log(`✅ Empresa: ${empresaId}`);

      // ══════════════════════════════════════════════════════════════════
      // [5] GARANTIR CLIENTE
      // ══════════════════════════════════════════════════════════════════
      let clientes = await base44.asServiceRole.entities.Cliente.filter({
        empresa_id: empresaId,
        celular: telefone,
      }, null, 1);

      let cliente;
      if (clientes.length === 0) {
        cliente = await base44.asServiceRole.entities.Cliente.create({
          empresa_id: empresaId,
          tipo_pessoa: 'Física',
          celular: telefone,
          email: `${telefone}@whatsapp.local`,
          nome_completo: `Contato ${telefone}`,
          status: 'ativo',
        });
        console.log(`✨ Cliente criado: ${cliente.id}`);
      } else {
        cliente = clientes[0];
        console.log(`✅ Cliente: ${cliente.id}`);
      }

      // ══════════════════════════════════════════════════════════════════
      // [6] GARANTIR CONVERSA
      // ══════════════════════════════════════════════════════════════════
      let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        empresa_id: empresaId,
        cliente_id: cliente.id,
        cliente_telefone: telefone,
      }, null, 1);

      let conversa;
      if (conversas.length === 0) {
        conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: cliente.id,
          cliente_nome: cliente.nome_completo,
          cliente_telefone: telefone,
          whatsapp_id: telefone,
          status: 'ativa',
          tipo_conexao: 'empresa',
          instancia: 'OFICIAL',
        });
        console.log(`✨ Conversa criada: ${conversa.id}`);
      } else {
        conversa = conversas[0];
        console.log(`✅ Conversa: ${conversa.id}`);
      }

      // ══════════════════════════════════════════════════════════════════
      // [7] VERIFICAR DUPLICATA
      // ══════════════════════════════════════════════════════════════════
      const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        conversa_id: conversa.id,
        whatsapp_message_id: String(msgId),
      }, null, 1);

      if (existentes.length > 0) {
        console.log('⏭️  Mensagem duplicada - ignorando');
        return Response.json({ ok: true });
      }

      // ══════════════════════════════════════════════════════════════════
      // [8] INSERIR MENSAGEM
      // ══════════════════════════════════════════════════════════════════
      const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa.id,
        empresa_id: empresaId,
        remetente: 'cliente',
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

      // ══════════════════════════════════════════════════════════════════
      // [9] ATUALIZAR CONVERSA
      // ══════════════════════════════════════════════════════════════════
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: texto.slice(0, 100),
        data_ultima_mensagem: new Date().toISOString(),
        instancia: 'OFICIAL',
      });

      console.log('='.repeat(80));
      console.log('✅ SUCESSO - Mensagem processada');
      console.log('='.repeat(80) + '\n');

      return Response.json({ ok: true });
    }

    return Response.json({ ok: false }, { status: 405 });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ ok: false }, { status: 200 }); // Meta aceita 200 mesmo em erro
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.log('\n\n');
  console.log('█'.repeat(100));
  console.log(`✅ WEBHOOK CHAMADO - ${timestamp}`);
  console.log('█'.repeat(100));
  
  if (req.method !== 'POST') {
    console.log('❌ Método não POST:', req.method);
    return new Response('OK', { status: 200 });
  }

  try {
    const bodyText = await req.text();
    console.log('📥 Body recebido (length):', bodyText.length);
    
    let body = JSON.parse(bodyText);
    console.log('✅ JSON parseado');
    console.log('Event:', body.event);
    console.log('Instance:', body.instance);
    
    // Ignorar eventos não relevantes
    if (body.event === 'messages.update' || body.event === 'MESSAGE_UPDATE') {
      console.log('⏭️ Ignorado: message status update');
      return new Response('OK', { status: 200 });
    }

    if (body.data?.key?.fromMe === true) {
      console.log('⏭️ Ignorado: mensagem enviada pelo bot');
      return new Response('OK', { status: 200 });
    }

    // Extrair dados
    const message = body.data?.message;
    const key = body.data?.key;
    const pushName = body.data?.pushName || 'Cliente';
    
    if (!message || !key) {
      console.log('❌ Dados inválidos');
      console.log('   message:', !!message);
      console.log('   key:', !!key);
      return new Response('INVALID', { status: 400 });
    }

    const telefone = key.remoteJid;
    const telefoneLimpo = String(telefone).replace(/\D/g, '');
    const messageId = key.id;
    
    console.log('📞 Telefone:', telefone);
    console.log('📞 Telefone limpo:', telefoneLimpo);
    console.log('🆔 Message ID:', messageId);
    console.log('👤 Nome:', pushName);

    // Extrair conteúdo
    let tipo = 'texto';
    let conteudo = '';

    if (message.conversation) {
      conteudo = message.conversation;
    } else if (message.text) {
      conteudo = message.text;
    } else if (message.extendedTextMessage?.text) {
      conteudo = message.extendedTextMessage.text;
    } else {
      console.log('⚠️ Tipo de mensagem desconhecido');
      conteudo = JSON.stringify(message).substring(0, 100);
    }

    console.log('📝 Tipo:', tipo);
    console.log('📝 Conteúdo:', conteudo.substring(0, 100));

    // Inicializar SDK
    const base44 = createClientFromRequest(req);
    
    // Obter instance do secret
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');
    console.log('🔑 Instance do secret:', instanceName);

    // Buscar empresa
    console.log('🏢 Buscando empresa com instance:', instanceName);
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ 
      evolution_instance_name: instanceName,
      status: 'ativa'
    });

    if (!empresas || empresas.length === 0) {
      console.error('❌ Nenhuma empresa encontrada!');
      const todasEmpresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      console.log('📋 Todas as instâncias cadastradas:');
      todasEmpresas.forEach(e => {
        console.log(`   - ${e.nome}: "${e.evolution_instance_name}"`);
      });
      return new Response('NO_COMPANY', { status: 400 });
    }

    const empresa = empresas[0];
    const empresaId = empresa.id;
    
    console.log('✅ Empresa encontrada:', empresa.nome);
    console.log('   ID:', empresaId);
    console.log('   Instance:', empresa.evolution_instance_name);

    // Buscar ou criar conversa
    console.log('💬 Procurando conversa...');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefoneLimpo
    });

    let conversa;
    if (!conversas || conversas.length === 0) {
      console.log('➕ Criando nova conversa');
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_nome: pushName,
        cliente_telefone: telefoneLimpo,
        status: 'ativa',
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: timestamp
      });
      console.log('✅ Conversa criada:', conversa.id);
    } else {
      conversa = conversas[0];
      console.log('✅ Conversa existente:', conversa.id);
      
      // Atualizar
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: timestamp
      });
    }

    // Criar mensagem
    console.log('💾 Criando mensagem...');
    const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'cliente',
      tipo_conteudo: tipo,
      texto: conteudo,
      whatsapp_message_id: messageId,
      data_envio: timestamp,
      status: 'entregue'
    });

    console.log('✅ Mensagem criada:', novaMensagem.id);
    console.log('═'.repeat(100));
    console.log('✅✅✅ SUCESSO! Mensagem salva no CRM');
    console.log('═'.repeat(100));

    return new Response(JSON.stringify({
      success: true,
      message_id: novaMensagem.id,
      conversa_id: conversa.id
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
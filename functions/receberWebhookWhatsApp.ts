import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.log('\n\n');
  console.log('█'.repeat(100));
  console.log(`🔔🔔🔔 WEBHOOK CHAMADO - ${timestamp}`);
  console.log('█'.repeat(100));
  console.log(`📍 Método: ${req.method}`);
  console.log(`📍 URL: ${req.url}`);
  console.log(`📍 Headers:`, Object.fromEntries(req.headers));
  
  // Suporte a GET (verificação/challenge)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge');
    console.log('✅ GET request - Challenge:', challenge);
    return new Response(challenge || 'OK', { status: 200 });
  }

  // Só aceitar POST
  if (req.method !== 'POST') {
    console.log('❌ Método não permitido:', req.method);
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Ler body
    const bodyText = await req.text();
    console.log('📥 Body recebido (length):', bodyText.length);
    console.log('📥 Body raw completo:', bodyText);
    
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      console.log('❌ Erro ao parsear JSON:', e.message);
      console.log('📥 Body texto:', bodyText);
      return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }
    
    console.log('✅ JSON parseado');
    console.log('📋 Event type:', body.event);
    console.log('📋 Instance:', body.instance);
    console.log('📋 Dados:', JSON.stringify(body.data, null, 2).substring(0, 500));

    // Ignorar eventos não relevantes
    if (body.event === 'messages.update' || body.event === 'MESSAGE_UPDATE') {
      console.log('⏭️ Ignorado: messages.update/MESSAGE_UPDATE (status)');
      return Response.json({ success: true, skipped: 'status_update' });
    }

    // Aceitar tanto 'messages.upsert' quanto 'MESSAGES_UPSERT'
    const isMessageUpsert = body.event === 'messages.upsert' || body.event === 'MESSAGES_UPSERT' || body.event === 'messages';
    
    if (isMessageUpsert && body.data?.key?.fromMe === true) {
      console.log('⏭️ Ignorado: Mensagem enviada pelo bot (fromMe === true)');
      return Response.json({ success: true, skipped: 'from_bot' });
    }

    if (!isMessageUpsert) {
      console.log('⚠️ Evento não suportado:', body.event, '- Aceitando mesmo assim');
      // Deixar continuar mesmo se não for reconhecido - pode ser outro formato
    }

    // Processar mensagem
    console.log('💬 Processando mensagem...');
    console.log('📋 Body completo:', JSON.stringify(body, null, 2).substring(0, 1000));
    
    const message = body.data?.message;
    const key = body.data?.key;
    const pushName = body.data?.pushName || body.data?.senderName || 'Cliente';
    
    console.log('📨 Message:', message ? 'OK' : 'FALTANDO');
    console.log('🔑 Key:', key ? 'OK' : 'FALTANDO');
    console.log('👤 PushName:', pushName);
    
    if (!message || !key) {
      console.log('❌ Dados inválidos - message:', !!message, 'key:', !!key);
      console.log('📋 Body.data:', body.data);
      return Response.json({ success: false, error: 'Invalid data', recebido: { message: !!message, key: !!key } }, { status: 400 });
    }

    const telefone = key.remoteJid;
    const messageId = key.id;
    
    console.log('📞 Telefone:', telefone);
    console.log('🆔 Message ID:', messageId);
    console.log('👤 Nome:', pushName);

    // Determinar tipo e conteúdo
    let tipo = 'texto';
    let conteudo = '';

    console.log('📋 Estrutura da mensagem:', JSON.stringify(message, null, 2).substring(0, 1000));

    // Tentar encontrar conteúdo em diferentes estruturas
    if (message.conversation) {
      conteudo = message.conversation;
    } else if (message.text) {
      conteudo = message.text;
    } else if (message.extendedTextMessage?.text) {
      conteudo = message.extendedTextMessage.text;
    } else if (message.imageMessage) {
      tipo = 'imagem';
      conteudo = message.imageMessage.caption || 'Imagem';
    } else if (message.audioMessage) {
      tipo = 'audio';
      conteudo = 'Áudio';
    } else if (message.videoMessage) {
      tipo = 'video';
      conteudo = message.videoMessage.caption || 'Vídeo';
    } else if (message.documentMessage) {
      tipo = 'pdf';
      conteudo = message.documentMessage.title || 'Documento';
    } else {
      console.log('⚠️ Estrutura desconhecida, salvando como texto');
      tipo = 'texto';
      conteudo = JSON.stringify(message).substring(0, 200);
    }

    console.log('📝 Tipo:', tipo);
    console.log('📝 Conteúdo:', conteudo);

    // Limpar telefone
    const telefoneLimpo = String(telefone).replace(/\D/g, '');
    console.log('📱 Telefone limpo:', telefoneLimpo);

    // SDK
    const base44 = createClientFromRequest(req);

    // Extrair instance do URL
    const url = new URL(req.url);
    const instanceFromUrl = url.searchParams.get('instance');
    console.log('🔍 Instance do URL:', instanceFromUrl);

    // Buscar TODAS as empresas ativas
    console.log('🏢 Buscando empresas...');
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    console.log('🏢 Empresas encontradas:', empresas.length);

    if (!empresas || empresas.length === 0) {
      console.log('❌ Nenhuma empresa ativa');
      return Response.json({ success: false, error: 'No company' }, { status: 400 });
    }

    // REGRA CRÍTICA: Identificar empresa pela instância
    let empresaId = null;

    console.log('🔍 Identificando empresa...');
    console.log('📍 Instance do URL:', instanceFromUrl);
    console.log('📊 Empresas disponíveis:', empresas.map(e => ({
      id: e.id,
      nome: e.nome,
      instance: e.evolution_instance_name
    })));

    if (instanceFromUrl === 'TESTE') {
      // TESTE → JD PROMOTORA (buscar de forma mais flexível)
      const jd = empresas.find(e => 
        e.nome?.toUpperCase().includes('JD') || 
        e.codigo === 'EMP001' ||
        e.id === '6956c66acff52e4405313375'
      );
      
      if (jd) {
        empresaId = jd.id;
        console.log('✅ INSTÂNCIA TESTE → Empresa:', jd.nome, '(ID:', empresaId, ')');
      } else {
        console.error('❌ JD Promotora NÃO ENCONTRADA!');
        console.log('📋 Empresas existentes:', empresas.map(e => e.nome).join(', '));
        // Usar primeira empresa como fallback
        empresaId = empresas[0].id;
        console.log('⚠️ USANDO PRIMEIRA EMPRESA:', empresas[0].nome);
      }
    } else if (instanceFromUrl) {
      // Para outras instâncias, procurar pela instance EXATAMENTE
      const empresaPorInstance = empresas.find(e => e.evolution_instance_name === instanceFromUrl);
      if (empresaPorInstance) {
        empresaId = empresaPorInstance.id;
        console.log('✅ Empresa encontrada pela instance:', empresaPorInstance.nome, instanceFromUrl);
      } else {
        console.error('❌ EMPRESA NÃO ENCONTRADA PARA INSTANCE:', instanceFromUrl);
        console.log('📋 Instances configuradas:', empresas.filter(e => e.evolution_instance_name).map(e => ({
          nome: e.nome,
          instance: e.evolution_instance_name
        })));
      }
    }

    // Se ainda não identificou, tentar user ou primeira empresa
    if (!empresaId) {
      try {
        const me = await base44.auth.me();
        if (me?.empresa_id && empresas.find(e => e.id === me.empresa_id)) {
          empresaId = me.empresa_id;
          console.log('✅ Usando empresa do usuário:', empresaId);
        }
      } catch (e) {
        console.log('⚠️ Não conseguiu obter user');
      }
    }

    // Último fallback
    if (!empresaId) {
      empresaId = empresas[0].id;
      console.log('⚠️ Usando primeira empresa:', empresaId);
    }

    console.log('='.repeat(80));
    console.log('✅✅✅ EMPRESA ID FINAL:', empresaId);
    
    // Buscar dados da empresa para confirmar
    try {
      const empresaFinal = empresas.find(e => e.id === empresaId);
      if (empresaFinal) {
        console.log('📋 EMPRESA SELECIONADA:');
        console.log('   Nome:', empresaFinal.nome);
        console.log('   Código:', empresaFinal.codigo);
        console.log('   ID:', empresaFinal.id);
        console.log('   Instance configurada:', empresaFinal.evolution_instance_name);
      }
    } catch (e) {
      console.log('⚠️ Não conseguiu buscar dados da empresa');
    }
    console.log('='.repeat(80));

    // Verificar se JÁ EXISTE esta mensagem (evitar duplicatas)
    console.log('🔍 Verificando duplicatas...');
    const mensagensExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      whatsapp_message_id: messageId
    });
    
    if (mensagensExistentes.length > 0) {
      console.log('⏭️ Mensagem já existe, ignorando duplicata');
      return Response.json({ success: true, skipped: 'duplicate' });
    }

    // Buscar ou criar conversa - REGRA RIGOROSA
      console.log('💬 Buscando/criando conversa...');

      // Tentar encontrar por telefone
      let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        empresa_id: empresaId,
        cliente_telefone: telefoneLimpo
      });

      let conversa;
      if (!conversas || conversas.length === 0) {
        // Criar OBRIGATORIAMENTE
        console.log('➕ CRIANDO NOVA CONVERSA (não existia)');
        try {
          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: empresaId,
            cliente_id: '',
            cliente_nome: pushName || 'Cliente',
            cliente_telefone: telefoneLimpo,
            whatsapp_id: messageId,
            status: 'ativa',
            ultima_mensagem: conteudo.substring(0, 200),
            data_ultima_mensagem: new Date().toISOString()
          });
          console.log('✅ CONVERSA CRIADA COM SUCESSO:', conversa.id);
        } catch (createErr) {
          console.error('❌ ERRO AO CRIAR CONVERSA:', createErr.message);
          // Se falhar, tentar buscar novamente (pode ter sido criada por outro request)
          conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
            empresa_id: empresaId,
            cliente_telefone: telefoneLimpo
          });
          if (conversas && conversas.length > 0) {
            conversa = conversas[0];
            console.log('⚠️ CONVERSA ENCONTRADA NA RETENTATIVA:', conversa.id);
          } else {
            throw createErr;
          }
        }
      } else {
        // Usar existente
        conversa = conversas[0];
        console.log('✅ CONVERSA EXISTENTE ENCONTRADA:', conversa.id);

        // SEMPRE atualizar última mensagem
        try {
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
            ultima_mensagem: conteudo.substring(0, 200),
            data_ultima_mensagem: new Date().toISOString(),
            status: 'ativa'
          });
          console.log('✅ CONVERSA ATUALIZADA');
        } catch (updateErr) {
          console.warn('⚠️ Erro ao atualizar conversa (não crítico):', updateErr.message);
        }
      }

      if (!conversa || !conversa.id) {
        throw new Error('FALHA CRÍTICA: Conversa não tem ID válido');
      }

    // CRIAR MENSAGEM - REGRA RIGOROSA
    console.log('💾 CRIANDO MENSAGEM OBRIGATORIAMENTE...');

    // Validação final
    if (!conversa.id) {
      throw new Error('ERRO CRÍTICO: conversa.id está vazio ou undefined');
    }
    if (!tipo || !conteudo) {
      throw new Error('ERRO CRÍTICO: tipo ou conteudo está vazio');
    }
    if (!messageId) {
      throw new Error('ERRO CRÍTICO: messageId está vazio');
    }

    let novaMensagem;
    try {
      novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa.id,
        empresa_id: empresaId,
        remetente: 'cliente',
        tipo_conteudo: tipo,
        texto: conteudo || '',
        whatsapp_message_id: messageId,
        data_envio: new Date().toISOString(),
        status: 'entregue'
      });

      if (!novaMensagem || !novaMensagem.id) {
        throw new Error('Mensagem criada mas sem ID válido');
      }
    } catch (createMsgErr) {
      console.error('❌ ERRO AO CRIAR MENSAGEM:', createMsgErr.message);
      throw createMsgErr;
    }

    console.log('='.repeat(100));
    console.log('✅✅✅ MENSAGEM SALVA COM SUCESSO!');
    console.log('ID Mensagem:', novaMensagem.id);
    console.log('Conversa ID:', novaMensagem.conversa_id);
    console.log('🏢 EMPRESA ID:', novaMensagem.empresa_id, '⭐ CRÍTICO');
    console.log('Remetente:', novaMensagem.remetente);
    console.log('Tipo:', novaMensagem.tipo_conteudo);
    console.log('Conteudo:', novaMensagem.texto?.substring(0, 100));
    console.log('WhatsApp Message ID:', novaMensagem.whatsapp_message_id);
    
    // VERIFICAÇÃO FINAL: Tentar buscar a mensagem que acabamos de criar
    try {
      const verificacao = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        id: novaMensagem.id
      });
      if (verificacao.length > 0) {
        console.log('✅ VERIFICAÇÃO: Mensagem encontrada no banco!');
        console.log('   Empresa ID confirmado:', verificacao[0].empresa_id);
      } else {
        console.log('❌ VERIFICAÇÃO: Mensagem NÃO encontrada no banco!');
      }
    } catch (e) {
      console.log('⚠️ Erro na verificação:', e.message);
    }
    console.log('='.repeat(100));

    console.log('✅ RETORNANDO SUCESSO AO WEBHOOK');
    return Response.json({
      success: true,
      message_id: novaMensagem.id,
      conversa_id: conversa.id,
      telefone: telefoneLimpo,
      tipo_conteudo: novaMensagem.tipo_conteudo,
      timestamp: timestamp,
      debug: {
        conversa_criada_agora: conversas.length === 0,
        total_conversas: conversas.length,
        telefone_limpo: telefoneLimpo
      }
    });

  } catch (error) {
    console.log('█'.repeat(100));
    console.log('❌❌❌ ERRO CRÍTICO NO WEBHOOK');
    console.log('Mensagem:', error.message);
    console.log('Stack:', error.stack);
    console.log('█'.repeat(100));
    
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

console.log('✅✅✅ WEBHOOK PRONTO PARA RECEBER MENSAGENS');
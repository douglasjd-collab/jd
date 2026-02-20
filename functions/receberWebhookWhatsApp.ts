import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função auxiliar para registrar eventos
async function registrarEvento(base44, empresaId, tipoEvento, dados) {
  try {
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: empresaId || '',
      tipo_evento: tipoEvento,
      telefone: dados.telefone || '',
      conteudo: dados.conteudo || '',
      status: dados.status || 'sucesso',
      mensagem_erro: dados.erro || '',
      mensagem_id: dados.mensagem_id || '',
      conversa_id: dados.conversa_id || '',
      instancia: dados.instancia || '',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('⚠️ Erro ao registrar evento:', e.message);
  }
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  // ⚠️ TESTE RÁPIDO - Logar TUDO que chega
  console.log('\n\n');
  console.log('█'.repeat(100));
  console.log(`✅✅✅ WEBHOOK CHAMADO - ${timestamp}`);
  console.log(`🔗 URL COMPLETA: ${req.url}`);
  console.log(`📍 Método: ${req.method}`);
  console.log('█'.repeat(100));
  
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
    
    // Não ignorar mais fromMe=true - mensagens enviadas pelo celular também devem aparecer no CRM
    // Apenas ignorar se for do próprio servidor/bot (verificar via tipo de JID)
    const fromMe = body.data?.key?.fromMe === true;
    console.log('📱 fromMe:', fromMe, '(mensagens do celular serão salvas como "vendedor")');

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

    // ID fixo da empresa JD Promotora (super admin)
    const JD_PROMOTORA_ID = '699696c2c9f5bffc2e67402b';
    
    // Tentar encontrar empresa pela instância do payload ou pelo URL param
    const url = new URL(req.url);
    const instanceParam = url.searchParams.get('instance');
    const instancePayload = body.instance;
    const instanceFinal = instanceParam || instancePayload || '';
    
    console.log('🔍 Instance do payload:', instancePayload);
    console.log('🔍 Instance do param URL:', instanceParam);
    console.log('🔍 Instance final:', instanceFinal);

    let empresaId = JD_PROMOTORA_ID; // Padrão: JD Promotora
    let empresaPorInstance = null;

    // Tentar buscar por instance name se disponível
    if (instanceFinal) {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ 
        evolution_instance_name: instanceFinal
      });
      if (empresas && empresas.length > 0) {
        empresaPorInstance = empresas[0];
        empresaId = empresaPorInstance.id;
        console.log('✅ Empresa encontrada por instance:', empresaPorInstance.nome);
      } else {
        console.warn('⚠️ Empresa não encontrada por instance, usando JD Promotora como padrão');
        const jdEmpresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_PROMOTORA_ID });
        empresaPorInstance = jdEmpresas[0];
      }
    } else {
      // Sem instance: usar JD Promotora direto pelo ID
      console.log('🏢 Sem instance no payload - usando JD Promotora (ID fixo)');
      const jdEmpresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_PROMOTORA_ID });
      empresaPorInstance = jdEmpresas && jdEmpresas.length > 0 ? jdEmpresas[0] : null;
      if (!empresaPorInstance) {
        console.error('❌ JD Promotora não encontrada pelo ID!');
        return Response.json({ success: false, error: 'Empresa JD Promotora não encontrada' }, { status: 400 });
      }
      empresaId = empresaPorInstance.id;
    }
    console.log('✅ Empresa encontrada:');
    console.log('   Nome:', empresaPorInstance.nome);
    console.log('   ID:', empresaId);
    console.log('   Instance:', empresaPorInstance.evolution_instance_name);

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
    if (!messageId) {
      throw new Error('ERRO CRÍTICO: messageId está vazio');
    }
    // Garantir valores padrão se vazios
    if (!tipo) tipo = 'texto';
    if (!conteudo) conteudo = '';

    // Determinar remetente: se fromMe=true, é mensagem enviada pelo celular (vendedor)
    const remetente = fromMe ? 'vendedor' : 'cliente';
    console.log('👤 Remetente determinado:', remetente);

    let novaMensagem;
    try {
      novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa.id,
        empresa_id: empresaId,
        remetente: remetente,
        tipo_conteudo: tipo,
        texto: conteudo || '',
        whatsapp_message_id: messageId,
        data_envio: new Date().toISOString(),
        status: remetente === 'vendedor' ? 'enviada' : 'entregue'
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

    // Registrar evento de sucesso
    await registrarEvento(base44, empresaId, 'mensagem_recebida', {
      telefone: telefoneLimpo,
      conteudo: conteudo.substring(0, 100),
      status: 'sucesso',
      mensagem_id: novaMensagem.id,
      conversa_id: conversa.id,
      instancia: instanceFinal
    });

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
    
    // Tentar registrar erro
    try {
      const base44 = createClientFromRequest(req);
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) {
        await registrarEvento(base44, empresas[0].id, 'erro', {
          status: 'erro',
          erro: error.message
        });
      }
    } catch (logErr) {
      console.error('⚠️ Erro ao registrar erro:', logErr.message);
    }
    
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

console.log('✅✅✅ WEBHOOK PRONTO PARA RECEBER MENSAGENS');
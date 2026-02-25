import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
  console.log('='.repeat(100));
  console.log(`📥 WEBHOOK WHATSAPP RECEBIDO - ${timestamp}`);
  console.log('URL:', req.url);
  console.log('Método:', req.method);
  console.log('Headers:', Object.fromEntries(req.headers));

  // Evolution às vezes manda GET para teste
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge =
      url.searchParams.get('challenge') ||
      url.searchParams.get('hub.challenge') ||
      'OK';
    console.log('✅ GET de teste recebido. Challenge:', challenge);
    
    const base44 = createClientFromRequest(req);
    try {
      await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
        empresa_id: '699696c2c9f5bffc2e67402b',
        tipo_evento: 'get_teste_webhook',
        status: 'sucesso',
        instancia: new URL(req.url).searchParams.get('instance') || 'desconhecida',
        timestamp
      });
    } catch (e) {
      console.log('Erro ao registrar GET:', e.message);
    }
    
    return new Response(challenge, { status: 200 });
  }

  if (req.method !== 'POST') {
    console.log('❌ Método não suportado:', req.method);
    return Response.json({ error: 'Método não suportado' }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const instanceFromQuery = url.searchParams.get('instance') || undefined;
    
    console.log('🔍 Query params:', {
      instance: instanceFromQuery,
      allParams: Object.fromEntries(url.searchParams)
    });

    const rawBody = await req.text();
    console.log('📦 RAW BODY tamanho:', rawBody.length, 'bytes');
    console.log('📦 RAW BODY:', rawBody.substring(0, 500));

    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (_) {
      // Tentar Base64 puro
      try {
        const decoded = atob(rawBody.trim());
        const bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
        payload = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        console.log('✅ Parseado como Base64 puro (UTF-8)');
      } catch (e2) {
        console.error('❌ Não foi possível parsear body:', e2.message);
        return Response.json({ error: 'JSON inválido' }, { status: 400 });
      }
    }

    // A Evolution com webhookBase64=true envia: { event, instance, data: "<base64>" }
    if (payload && typeof payload.data === 'string') {
      try {
        const decodedData = atob(payload.data);
        const bytesData = new Uint8Array(decodedData.split('').map(c => c.charCodeAt(0)));
        payload.data = JSON.parse(new TextDecoder('utf-8').decode(bytesData));
        console.log('✅ Campo data decodificado de Base64 (UTF-8)');
      } catch (_) {
        // data já é string normal (não Base64), deixar como está
      }
    }

    // Formato alternativo: wrapper { data: { event, instance, data: {...} } }
    if (payload && !payload.event && payload.data?.event) {
      payload = payload.data;
      console.log('🔄 Unwrapped do formato wrapper');
    }

    console.log(`📋 Event: ${payload.event} | Instance: ${payload.instance}`);
    console.log(`📋 Data keys: ${Object.keys(payload.data || {}).join(', ')}`);

    // ── Filtrar eventos ───────────────────────────────────────────────────────
    const event = (payload.event || '').toLowerCase();

    // ── Tratar ACK / status de mensagens enviadas ─────────────────────────────
    if (event === 'messages.update' || event === 'message_update' || event === 'message.ack' || event === 'messages.ack') {
      const base44 = createClientFromRequest(req);
      const data = payload.data || {};

      // A Evolution pode mandar array ou objeto único
      const updates = Array.isArray(data) ? data : [data];

      for (const upd of updates) {
        const remoteId = upd.key?.id || upd.id || upd.messageId;
        const rawStatus = (upd.status || upd.ack || '').toString().toUpperCase();

        // Evolution usa: PENDING=0, SENT=1, DELIVERED=2, READ=3, PLAYED=4
        let novoStatus = null;
        if (rawStatus === 'SENT' || rawStatus === '1') novoStatus = 'enviada';
        else if (rawStatus === 'DELIVERED' || rawStatus === '2') novoStatus = 'entregue';
        else if (rawStatus === 'READ' || rawStatus === '3' || rawStatus === 'PLAYED' || rawStatus === '4') novoStatus = 'lida';

        console.log(`📡 ACK recebido: remoteId=${remoteId} rawStatus=${rawStatus} → ${novoStatus}`);

        if (remoteId && novoStatus) {
          const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
            { whatsapp_message_id: remoteId }, '-created_date', 1
          );
          if (mensagens?.length > 0) {
            await base44.asServiceRole.entities.MensagemWhatsapp.update(mensagens[0].id, { status: novoStatus });
            console.log(`✅ Status atualizado para "${novoStatus}" na mensagem ${mensagens[0].id}`);
          } else {
            console.warn(`⚠️ Nenhuma mensagem com whatsapp_message_id=${remoteId}`);
          }
        }
      }

      return Response.json({ success: true, handled: 'ack' });
    }

    const isUpsert = event === 'messages.upsert' || event === 'messages_upsert' || event === 'messages';
    if (!isUpsert) {
      console.log(`⏭️ Evento ignorado: ${payload.event}`);
      
      // Registrar eventos ignorados para diagnóstico
      try {
        const b = createClientFromRequest(req);
        const url = new URL(req.url);
        const instancia = url.searchParams.get('instance') || 'desconhecida';
        
        await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
          empresa_id: '699696c2c9f5bffc2e67402b',
          tipo_evento: `ignorado_${payload.event}`,
          status: 'sucesso',
          conteudo: `Evento ${payload.event} recebido mas ignorado`,
          instancia: instancia,
          timestamp: new Date().toISOString()
        });
      } catch (_) {
        console.log('⚠️ Erro ao registrar evento ignorado');
      }
      
      return Response.json({ success: true, skipped: `event_${payload.event}` });
    }

    // ── Extrair dados da mensagem ─────────────────────────────────────────────
    const data = payload.data || {};
    const key = data.key || {};
    const message = data.message || {};
    const pushName = data.pushName || data.senderName || 'Cliente';
    const fromMe = key.fromMe === true;
    const remoteJidRaw = key.remoteJid || '';
    const remoteJidAlt = key.remoteJidAlt || '';
    const telefone = (remoteJidRaw.includes('@lid') && remoteJidAlt) ? remoteJidAlt : remoteJidRaw;
    const messageId = key.id || `gen_${Date.now()}`;
    console.log(`🔍 remoteJid: ${remoteJidRaw} | remoteJidAlt: ${remoteJidAlt} | telefone usado: ${telefone}`);
    console.log(`📞 Telefone: ${telefone} | fromMe: ${fromMe} | MsgID: ${messageId}`);

    if (!telefone || !messageId) {
      console.error('❌ Dados insuficientes - telefone ou messageId faltando');
      return Response.json({ success: false, error: 'Missing key data' }, { status: 400 });
    }

    // Ignorar mensagens de grupos
    if (telefone.includes('@g.us')) {
      console.log('⏭️ Mensagem de grupo ignorada');
      return Response.json({ success: true, skipped: 'group_message' });
    }

    // ── Extrair conteúdo ──────────────────────────────────────────────────────
    let tipo = 'texto';
    let conteudo = '';

    if (message.conversation) {
      conteudo = message.conversation;
    } else if (message.extendedTextMessage?.text) {
      conteudo = message.extendedTextMessage.text;
    } else if (message.imageMessage) {
      tipo = 'imagem';
      conteudo = message.imageMessage.caption || 'Imagem';
    } else if (message.audioMessage || message.pttMessage) {
      tipo = 'audio';
      conteudo = 'Áudio';
    } else if (message.videoMessage) {
      tipo = 'video';
      conteudo = message.videoMessage.caption || 'Vídeo';
    } else if (message.documentMessage) {
      tipo = 'pdf';
      conteudo = message.documentMessage.title || 'Documento';
    } else if (message.stickerMessage) {
      tipo = 'imagem';
      conteudo = 'Sticker';
    } else {
      conteudo = JSON.stringify(message).substring(0, 200);
    }

    console.log(`📝 Tipo: ${tipo} | Conteúdo: ${conteudo.substring(0, 100)}`);

    const telefoneLimpo = telefone.replace(/\D/g, '');

    // ── Identificar empresa e colaborador ─────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const instancePayload = payload.instance || '';
    const instanceFinal = instanceFromQuery || instancePayload || '';
    
    console.log('🏷️ Identificando empresa...');
    console.log('   instanceFromQuery:', instanceFromQuery);
    console.log('   instancePayload:', instancePayload);
    console.log('   instanceFinal:', instanceFinal);

    const JD_ID = '699696c2c9f5bffc2e67402b';
    let empresaId = JD_ID;
    let colaboradorId = null;
    let tipoConexao = 'empresa';

    if (instanceFinal) {
      console.log(`🔎 Buscando instância "${instanceFinal}"...`);
      
      // Com timeout para não travar
      let instanciaEncontrada = false;
      
      try {
        // 1) Tentar achar colaborador
        const controller1 = new AbortController();
        const timeout1 = setTimeout(() => controller1.abort(), 5000);
        
        const colaboradores = await Promise.race([
          base44.asServiceRole.entities.Colaborador.filter({
            evolution_instance_name: instanceFinal
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
        ]);
        
        clearTimeout(timeout1);
        console.log(`   Colaboradores encontrados: ${colaboradores?.length || 0}`);
        
        if (colaboradores?.length > 0) {
          const colab = colaboradores[0];
          tipoConexao = 'usuario';
          colaboradorId = colab.id;
          empresaId = colab.empresa_id || JD_ID;
          console.log(`✅ Instância de COLABORADOR: ${colab.nome} (empresa: ${empresaId})`);
          instanciaEncontrada = true;
        }
      } catch (err) {
        console.log(`⚠️ Erro ao buscar colaborador: ${err.message}`);
      }
      
      // 2) Se não achou, tentar empresa
      if (!instanciaEncontrada) {
        try {
          const controller2 = new AbortController();
          const timeout2 = setTimeout(() => controller2.abort(), 5000);
          
          const empresas = await Promise.race([
            base44.asServiceRole.entities.Empresa.filter({
              evolution_instance_name: instanceFinal
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
          ]);
          
          clearTimeout(timeout2);
          console.log(`   Empresas encontradas: ${empresas?.length || 0}`);
          
          if (empresas?.length > 0) {
            empresaId = empresas[0].id;
            console.log(`✅ Instância de EMPRESA: ${empresas[0].nome} (${empresaId})`);
            instanciaEncontrada = true;
          }
        } catch (err2) {
          console.error(`⚠️ Erro ao buscar empresa: ${err2.message}`);
        }
      }
      
      if (!instanciaEncontrada) {
        console.warn(`⚠️ Instância "${instanceFinal}" não encontrada, usando JD Promotora padrão`);
      }
    } else {
      console.log('⚠️ Nenhuma instância informada, usando JD Promotora padrão');
    }

    // ── Verificar duplicata ───────────────────────────────────────────────────
    console.log(`🔎 Verificando duplicata para messageId: ${messageId}`);
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      whatsapp_message_id: messageId
    });
    console.log(`   Duplicatas encontradas: ${existentes?.length || 0}`);
    
    if (existentes.length > 0) {
      console.log('⏭️ Duplicata ignorada');
      return Response.json({ success: true, skipped: 'duplicate' });
    }

    // ── Buscar/criar conversa ─────────────────────────────────────────────────
    let conversas = [];
    let clienteId = '';
    
    try {
      conversas = await Promise.race([
        base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: empresaId,
          cliente_telefone: telefoneLimpo
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);
      console.log(`✅ Conversas encontradas: ${conversas?.length || 0}`);
    } catch (e) {
      console.log(`⚠️ Erro ao buscar conversas: ${e.message}`);
      conversas = [];
    }

    // Tentar encontrar cliente pelo telefone
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
    } catch (e) {
      console.log(`⚠️ Erro ao buscar cliente: ${e.message}`);
    }

    // ── Buscar/criar contato WhatsApp ──────────────────────────────────────────
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
      } catch (e) {
        console.log(`⚠️ Erro ao buscar contatos: ${e.message}`);
      }

      if (contatos?.length > 0) {
        contato = contatos[0];
      } else {
        contato = await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: clienteId || '',
          telefone: telefoneLimpo,
          nome: pushName || 'Contato WhatsApp',
          ultima_atualizacao: new Date().toISOString()
        });
        console.log(`✅ Contato WhatsApp criado: ${contato.id}`);
      }

      // Extrair foto do payload (sem timeout)
      const possiblePhotoUrl = 
        data.profilePicUrl ||
        data.profilePic ||
        data.profilePicThumb ||
        data.profilePicThumbObj?.eurl ||
        data.avatarUrl;

      if (contato && possiblePhotoUrl && possiblePhotoUrl !== contato.foto_url) {
        try {
          contato = await base44.asServiceRole.entities.ContatoWhatsapp.update(contato.id, {
            foto_url: possiblePhotoUrl,
            ultima_atualizacao: new Date().toISOString()
          });
          console.log(`🖼️ Foto do contato atualizada`);
        } catch (e) {
          console.log(`⚠️ Erro ao atualizar foto: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`⚠️ Erro crítico ao processar contato WhatsApp: ${e.message}`);
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
            tipo_conexao: tipoConexao,
            colaborador_id: colaboradorId || conversa.colaborador_id || '',
            cliente_id: clienteId || conversa.cliente_id || '',
            instancia: instanceFinal
          });
          console.log(`✅ Conversa existente atualizada: ${conversa.id}`);
        } catch (e) {
          console.log(`⚠️ Erro ao atualizar conversa: ${e.message}`);
        }
      } else {
        conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: clienteId,
          cliente_nome: pushName,
          cliente_telefone: telefoneLimpo,
          whatsapp_id: messageId,
          status: 'ativa',
          ultima_mensagem: conteudo.substring(0, 200),
          data_ultima_mensagem: new Date().toISOString(),
          tipo_conexao: tipoConexao,
          colaborador_id: colaboradorId || '',
          instancia: instanceFinal
        });
        console.log(`✅ Conversa criada: ${conversa.id}`);
      }
    } catch (e) {
      console.error(`❌ ERRO ao criar/atualizar conversa: ${e.message}`);
      throw e;
    }

    // ── Criar mensagem ────────────────────────────────────────────────────────
    if (!conversa || !conversa.id) {
      console.error('❌ ERRO: Conversa sem ID válido');
      return Response.json({ success: false, error: 'Conversa inválida' }, { status: 400 });
    }

    const remetente = fromMe ? 'vendedor' : 'cliente';
    let novaMensagem;
    try {
      novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa.id,
        empresa_id: empresaId,
        remetente,
        tipo_conteudo: tipo,
        texto: conteudo,
        whatsapp_message_id: messageId,
        data_envio: new Date().toISOString(),
        status: remetente === 'vendedor' ? 'enviada' : 'entregue'
      });
    } catch (e) {
      console.error(`❌ ERRO ao criar mensagem: ${e.message}`);
      throw e;
    }

    console.log(`✅ Mensagem salva: ${novaMensagem.id} | Empresa: ${empresaId} | Remetente: ${remetente}`);

    // Registrar evento com erro handling robusto
    try {
      await registrarEvento(base44, empresaId, 'mensagem_recebida', {
        telefone: telefoneLimpo,
        conteudo: conteudo.substring(0, 100),
        status: 'sucesso',
        mensagem_id: novaMensagem.id,
        conversa_id: conversa.id,
        instancia: instanceFinal
      });
      console.log('✅ Evento registrado com sucesso');
    } catch (errReg) {
      console.error('⚠️ Erro ao registrar evento, mas mensagem foi salva:', errReg.message);
    }

    return Response.json({ success: true, message_id: novaMensagem.id, conversa_id: conversa.id });

  } catch (error) {
    console.error('❌ ERRO CRÍTICO:', error.message);
    console.error('❌ STACK:', error.stack);
    
    // Tentar registrar erro mesmo em caso de falha
    let tentativas = 0;
    while (tentativas < 3) {
      try {
        const b = createClientFromRequest(req);
        const url = new URL(req.url);
        const instancia = url.searchParams.get('instance') || 'desconhecida';
        
        await registrarEvento(b, '699696c2c9f5bffc2e67402b', 'erro_webhook', {
          status: 'erro',
          erro: error.message.substring(0, 500),
          instancia: instancia,
          stack: error.stack?.substring(0, 200)
        });
        
        console.log('✅ Erro registrado no LogRecebimentoWebhook');
        break;
      } catch (err) {
        tentativas++;
        console.error(`❌ Erro ao registrar (tentativa ${tentativas}):`, err.message);
        if (tentativas >= 3) {
          console.error('❌ Não foi possível registrar o erro após 3 tentativas');
        }
      }
    }
    
    return Response.json({ success: false, error: error.message, stack: error.stack?.substring(0, 200) }, { status: 500 });
  }
});
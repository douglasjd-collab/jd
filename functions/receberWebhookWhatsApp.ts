import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function registrarLog(base44, empresaId, tipoEvento, dados) {
  try {
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: empresaId || '699696c2c9f5bffc2e67402b',
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
    console.error('⚠️ Erro ao registrar log:', e.message);
  }
}

function tentarDecodificarBase64(str) {
  try {
    const decoded = atob(str.trim());
    const bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  console.log('='.repeat(80));
  console.log(`📥 WEBHOOK RECEBIDO - ${timestamp}`);
  console.log('Método:', req.method, '| URL:', req.url);

  // GET de verificação/teste
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge') || 'OK';
    console.log('✅ GET de verificação. Challenge:', challenge);
    return new Response(challenge, { status: 200 });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não suportado' }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const instanceFromQuery = url.searchParams.get('instance') || '';

    const rawBody = await req.text();
    console.log('📦 Body tamanho:', rawBody.length, 'bytes');
    console.log('📦 Body (primeiros 300 chars):', rawBody.substring(0, 300));

    // ─── Parsear o payload ───────────────────────────────────────────────────
    let payload = null;

    // 1) Tentar JSON direto
    try {
      payload = JSON.parse(rawBody);
      console.log('✅ Parseado como JSON direto');
    } catch (_) {}

    // 2) Tentar body inteiro como base64
    if (!payload) {
      const decoded = tentarDecodificarBase64(rawBody);
      if (decoded) {
        payload = decoded;
        console.log('✅ Body inteiro decodificado como base64');
      }
    }

    if (!payload) {
      console.error('❌ Não foi possível parsear o body');
      return Response.json({ error: 'Body inválido' }, { status: 400 });
    }

    // ─── Unwrap de wrappers comuns ───────────────────────────────────────────
    // Formato: { data: { event, instance, data: ... } }
    if (!payload.event && payload.data?.event) {
      payload = payload.data;
      console.log('🔄 Unwrapped wrapper externo');
    }

    // ─── Se payload.data for string base64, decodificar ─────────────────────
    if (payload && typeof payload.data === 'string' && payload.data.length > 0) {
      const decoded = tentarDecodificarBase64(payload.data);
      if (decoded) {
        payload.data = decoded;
        console.log('✅ payload.data decodificado de base64');
      }
    }

    const event = (payload.event || '').toLowerCase();
    const instancePayload = payload.instance || '';
    const instanceFinal = instanceFromQuery || instancePayload || '';

    console.log(`📋 Event: "${event}" | Instance: "${instanceFinal}"`);
    console.log(`📋 Data keys: ${Object.keys(payload.data || {}).join(', ')}`);

    // ─── ACK / status update ─────────────────────────────────────────────────
    if (['messages.update', 'messages_update', 'message.ack', 'messages.ack'].includes(event)) {
      const base44 = createClientFromRequest(req);
      const updates = Array.isArray(payload.data) ? payload.data : [payload.data || {}];
      for (const upd of updates) {
        const remoteId = upd.key?.id || upd.id || upd.messageId;
        const rawStatus = (upd.status || upd.ack || '').toString().toUpperCase();
        let novoStatus = null;
        if (rawStatus === 'SENT' || rawStatus === '1') novoStatus = 'enviada';
        else if (rawStatus === 'DELIVERED' || rawStatus === '2') novoStatus = 'entregue';
        else if (['READ', '3', 'PLAYED', '4'].includes(rawStatus)) novoStatus = 'lida';

        if (remoteId && novoStatus) {
          const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
            { whatsapp_message_id: remoteId }, '-created_date', 1
          );
          if (msgs?.length > 0) {
            await base44.asServiceRole.entities.MensagemWhatsapp.update(msgs[0].id, { status: novoStatus });
            console.log(`✅ ACK: status="${novoStatus}" para msg ${msgs[0].id}`);
          }
        }
      }
      return Response.json({ success: true, handled: 'ack' });
    }

    // ─── Somente messages.upsert ─────────────────────────────────────────────
    const isUpsert = ['messages.upsert', 'messages_upsert', 'messages'].includes(event);
    if (!isUpsert) {
      console.log(`⏭️ Evento ignorado: "${event}"`);
      return Response.json({ success: true, skipped: event });
    }

    // ─── Extrair dados da mensagem ────────────────────────────────────────────
    const data = payload.data || {};
    const key = data.key || {};
    const message = data.message || {};
    const pushName = data.pushName || data.senderName || 'Cliente';
    const fromMe = key.fromMe === true;
    const remoteJidRaw = key.remoteJid || '';
    const remoteJidAlt = data.remoteJidAlt || '';
    const telefone = (remoteJidRaw.includes('@lid') && remoteJidAlt) ? remoteJidAlt : remoteJidRaw;
    const messageId = key.id || `gen_${Date.now()}`;

    console.log(`📞 JID: ${remoteJidRaw} | fromMe: ${fromMe} | msgId: ${messageId}`);

    if (!telefone || !messageId) {
      console.error('❌ Dados insuficientes');
      return Response.json({ success: false, error: 'Missing key data' }, { status: 400 });
    }

    // Ignorar grupos
    if (telefone.includes('@g.us')) {
      console.log('⏭️ Grupo ignorado');
      return Response.json({ success: true, skipped: 'group' });
    }

    // ─── Extrair conteúdo ─────────────────────────────────────────────────────
    let tipo = 'texto';
    let conteudo = '';
    if (message.conversation) conteudo = message.conversation;
    else if (message.extendedTextMessage?.text) conteudo = message.extendedTextMessage.text;
    else if (message.imageMessage) { tipo = 'imagem'; conteudo = message.imageMessage.caption || 'Imagem'; }
    else if (message.audioMessage || message.pttMessage) { tipo = 'audio'; conteudo = 'Áudio'; }
    else if (message.videoMessage) { tipo = 'video'; conteudo = message.videoMessage.caption || 'Vídeo'; }
    else if (message.documentMessage) { tipo = 'pdf'; conteudo = message.documentMessage.title || 'Documento'; }
    else if (message.stickerMessage) { tipo = 'imagem'; conteudo = 'Sticker'; }
    else conteudo = JSON.stringify(message).substring(0, 200);

    console.log(`📝 Tipo: ${tipo} | Conteúdo: ${conteudo.substring(0, 100)}`);

    const telefoneLimpo = telefone.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');

    // Gerar variações do telefone para busca (com e sem o 9º dígito BR)
    const telefonesVariacoes = [telefoneLimpo];
    // Brasil: 55 + DDD(2) + número(8 ou 9 dígitos)
    if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
      // Tem 12 dígitos (sem o 9) → adicionar variação com o 9
      const comNove = telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4);
      telefonesVariacoes.push(comNove);
    } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
      // Tem 13 dígitos (com o 9) → adicionar variação sem o 9
      const semNove = telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5);
      telefonesVariacoes.push(semNove);
    }
    console.log(`📞 Telefone limpo: ${telefoneLimpo} | Variações: ${telefonesVariacoes.join(', ')}`);

    // ─── Identificar empresa ──────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';
    let empresaId = JD_ID;
    let colaboradorId = null;
    let tipoConexao = 'empresa';

    if (instanceFinal) {
      console.log(`🔎 Buscando instância "${instanceFinal}"...`);
      
      // Buscar colaborador
      try {
        const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
          { evolution_instance_name: instanceFinal }
        );
        if (colaboradores?.length > 0) {
          const colab = colaboradores[0];
          tipoConexao = 'usuario';
          colaboradorId = colab.id;
          empresaId = colab.empresa_id || JD_ID;
          console.log(`✅ Instância de colaborador: ${colab.nome} (empresa: ${empresaId})`);
        } else {
          // Buscar empresa
          const empresas = await base44.asServiceRole.entities.Empresa.filter(
            { evolution_instance_name: instanceFinal }
          );
          if (empresas?.length > 0) {
            empresaId = empresas[0].id;
            console.log(`✅ Instância de empresa: ${empresas[0].nome} (${empresaId})`);
          } else {
            console.warn(`⚠️ Instância "${instanceFinal}" não encontrada no banco, usando JD padrão`);
          }
        }
      } catch (err) {
        console.error(`⚠️ Erro ao identificar instância: ${err.message}`);
      }
    }

    // ─── Verificar duplicata ──────────────────────────────────────────────────
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { whatsapp_message_id: messageId }
    );
    if (existentes.length > 0) {
      console.log('⏭️ Duplicata ignorada:', messageId);
      return Response.json({ success: true, skipped: 'duplicate' });
    }

    // ─── Buscar/criar contato ─────────────────────────────────────────────────
    let contato = null;
    try {
      const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
        { empresa_id: empresaId, telefone: telefoneLimpo }
      );
      if (contatos?.length > 0) {
        contato = contatos[0];
      } else {
        contato = await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: '',
          telefone: telefoneLimpo,
          nome: pushName || 'Cliente WhatsApp',
          ultima_atualizacao: new Date().toISOString()
        });
        console.log(`✅ Contato criado: ${contato.id}`);
      }
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar/criar contato: ${e.message}`);
    }

    // ─── Buscar cliente pelo telefone ─────────────────────────────────────────
    let clienteId = '';
    try {
      const clientes = await base44.asServiceRole.entities.Cliente.filter(
        { empresa_id: empresaId, celular: telefoneLimpo }
      );
      if (clientes?.length > 0) {
        clienteId = clientes[0].id;
        console.log(`✅ Cliente encontrado: ${clienteId}`);
      }
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar cliente: ${e.message}`);
    }

    // ─── Buscar/criar conversa ────────────────────────────────────────────────
    let conversa = null;
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId, cliente_telefone: telefoneLimpo }
    );

    if (conversas?.length > 0) {
      conversa = conversas[0];
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        status: 'ativa',
        tipo_conexao: tipoConexao,
        colaborador_id: colaboradorId || conversa.colaborador_id || '',
        cliente_id: clienteId || conversa.cliente_id || '',
        instancia: instanceFinal,
        cliente_nome: conversa.cliente_nome || pushName
      });
      console.log(`✅ Conversa atualizada: ${conversa.id}`);
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

    // ─── Salvar mensagem ──────────────────────────────────────────────────────
    const remetente = fromMe ? 'vendedor' : 'cliente';
    const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente,
      tipo_conteudo: tipo,
      texto: conteudo,
      whatsapp_message_id: messageId,
      data_envio: new Date().toISOString(),
      status: remetente === 'vendedor' ? 'enviada' : 'entregue'
    });

    console.log(`✅ Mensagem salva: ${novaMensagem.id} | empresa: ${empresaId} | de: ${remetente}`);

    await registrarLog(base44, empresaId, 'mensagem_recebida', {
      telefone: telefoneLimpo,
      conteudo: conteudo.substring(0, 100),
      status: 'sucesso',
      mensagem_id: novaMensagem.id,
      conversa_id: conversa.id,
      instancia: instanceFinal
    });

    return Response.json({ success: true, message_id: novaMensagem.id, conversa_id: conversa.id });

  } catch (error) {
    console.error('❌ ERRO CRÍTICO:', error.message);
    console.error('❌ STACK:', error.stack);

    try {
      const b = createClientFromRequest(req);
      const instancia = new URL(req.url).searchParams.get('instance') || 'desconhecida';
      await registrarLog(b, '699696c2c9f5bffc2e67402b', 'erro_webhook', {
        status: 'erro',
        erro: error.message.substring(0, 500),
        instancia
      });
    } catch (_) {}

    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
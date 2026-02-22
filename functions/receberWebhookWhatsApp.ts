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

  console.log('\n' + '='.repeat(80));
  console.log(`📩 WEBHOOK RECEBIDO - ${timestamp}`);
  console.log(`📍 Método: ${req.method} | URL: ${req.url}`);

  // GET: verificação/challenge
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge');
    return new Response(challenge || 'OK', { status: 200 });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const bodyText = await req.text();
    console.log(`📥 Body length: ${bodyText.length}`);
    console.log(`📥 Primeiros 500 chars: ${bodyText.substring(0, 500)}`);

    // ── Parsear body ──────────────────────────────────────────────────────────
    let body;
    try {
      body = JSON.parse(bodyText);
      console.log('✅ Parseado como JSON');
    } catch (_) {
      // Tentar Base64 puro
      try {
        const decoded = atob(bodyText.trim());
            const bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
            body = JSON.parse(new TextDecoder('utf-8').decode(bytes));
            console.log('✅ Parseado como Base64 puro (UTF-8)');
      } catch (e2) {
        console.error('❌ Não foi possível parsear body:', e2.message);
        return Response.json({ success: false, error: 'Invalid body' }, { status: 400 });
      }
    }

    // A Evolution com webhookBase64=true envia: { event, instance, data: "<base64>" }
    if (body && typeof body.data === 'string') {
      try {
        const decodedData = atob(body.data);
            const bytesData = new Uint8Array(decodedData.split('').map(c => c.charCodeAt(0)));
            body.data = JSON.parse(new TextDecoder('utf-8').decode(bytesData));
            console.log('✅ Campo data decodificado de Base64 (UTF-8)');
      } catch (_) {
        // data já é string normal (não Base64), deixar como está
      }
    }

    // Formato alternativo: wrapper { data: { event, instance, data: {...} } }
    if (body && !body.event && body.data?.event) {
      body = body.data;
      console.log('🔄 Unwrapped do formato wrapper');
    }

    console.log(`📋 Event: ${body.event} | Instance: ${body.instance}`);
    console.log(`📋 Data keys: ${Object.keys(body.data || {}).join(', ')}`);

    // ── Filtrar eventos ───────────────────────────────────────────────────────
    const event = (body.event || '').toLowerCase();

    // Ignorar atualizações de status
    if (event === 'messages.update' || event === 'message_update') {
      return Response.json({ success: true, skipped: 'status_update' });
    }

    // Só processar messages.upsert / MESSAGES_UPSERT
    const isUpsert = event === 'messages.upsert' || event === 'messages_upsert' || event === 'messages';
    if (!isUpsert) {
      console.log(`⏭️ Evento ignorado: ${body.event}`);
      return Response.json({ success: true, skipped: `event_${body.event}` });
    }

    // ── Extrair dados da mensagem ─────────────────────────────────────────────
    const data    = body.data || {};
    const key     = data.key || {};
    const message = data.message || {};
    const pushName = data.pushName || data.senderName || 'Cliente';
    const fromMe  = key.fromMe === true;
    // Evolution pode usar LID (@lid) - usar remoteJidAlt se disponível (contém o número real @s.whatsapp.net)
    const remoteJidRaw = key.remoteJid || '';
    const remoteJidAlt = key.remoteJidAlt || '';
    const telefone = (remoteJidRaw.includes('@lid') && remoteJidAlt) ? remoteJidAlt : remoteJidRaw;
    const messageId = key.id || `gen_${Date.now()}`;
    console.log(`🔍 remoteJid: ${remoteJidRaw} | remoteJidAlt: ${remoteJidAlt} | telefone usado: ${telefone}`);

    console.log(`📞 Telefone: ${telefone} | fromMe: ${fromMe} | MsgID: ${messageId}`);
    console.log(`📋 Message keys: ${Object.keys(message).join(', ')}`);

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
    const urlParams = new URL(req.url).searchParams;
    const instanceUrl = urlParams.get('instance') || '';
    const instancePayload = body.instance || '';
    const instanceFinal = instanceUrl || instancePayload || '';

    const JD_ID = '699696c2c9f5bffc2e67402b';
    let empresaId = JD_ID;
    let colaboradorId = null;
    let tipoConexao = 'empresa';

    if (instanceFinal) {
      // 1) Tentar achar colaborador com essa instância pessoal
      const colaboradores = await base44.asServiceRole.entities.Colaborador.filter({
        evolution_instance_name: instanceFinal
      });
      if (colaboradores?.length > 0) {
        const colab = colaboradores[0];
        tipoConexao = 'usuario';
        colaboradorId = colab.id;
        empresaId = colab.empresa_id || JD_ID;
        console.log(`✅ Instância de COLABORADOR: ${colab.nome} (empresa: ${empresaId})`);
      } else {
        // 2) Tentar achar empresa com essa instância
        const empresas = await base44.asServiceRole.entities.Empresa.filter({
          evolution_instance_name: instanceFinal
        });
        if (empresas?.length > 0) {
          empresaId = empresas[0].id;
          console.log(`✅ Instância de EMPRESA: ${empresas[0].nome} (${empresaId})`);
        } else {
          console.warn(`⚠️ Instância "${instanceFinal}" não encontrada, usando JD Promotora`);
        }
      }
    }

    // ── Verificar duplicata ───────────────────────────────────────────────────
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      whatsapp_message_id: messageId
    });
    if (existentes.length > 0) {
      console.log('⏭️ Duplicata ignorada');
      return Response.json({ success: true, skipped: 'duplicate' });
    }

    // ── Buscar/criar conversa ─────────────────────────────────────────────────
    let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefoneLimpo
    });

    let conversa;
    if (conversas?.length > 0) {
      conversa = conversas[0];
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        status: 'ativa'
      });
      console.log(`✅ Conversa existente: ${conversa.id}`);
    } else {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: '',
        cliente_nome: pushName,
        cliente_telefone: telefoneLimpo,
        whatsapp_id: messageId,
        status: 'ativa',
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString()
      });
      console.log(`✅ Conversa criada: ${conversa.id}`);
    }

    // ── Criar mensagem ────────────────────────────────────────────────────────
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

    console.log(`✅ Mensagem salva: ${novaMensagem.id} | Empresa: ${empresaId} | Remetente: ${remetente}`);

    await registrarEvento(base44, empresaId, 'mensagem_recebida', {
      telefone: telefoneLimpo,
      conteudo: conteudo.substring(0, 100),
      status: 'sucesso',
      mensagem_id: novaMensagem.id,
      conversa_id: conversa.id,
      instancia: instanceFinal
    });

    return Response.json({ success: true, message_id: novaMensagem.id, conversa_id: conversa.id });

  } catch (error) {
    console.error('❌ ERRO CRÍTICO:', error.message, error.stack);
    try {
      const b = createClientFromRequest(req);
      await registrarEvento(b, '699696c2c9f5bffc2e67402b', 'erro', {
        status: 'erro',
        erro: error.message.substring(0, 500)
      });
    } catch (_) {}
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
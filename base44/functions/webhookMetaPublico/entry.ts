import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VERIFY_TOKEN = 'WAZE_CRM_WEBHOOK_2024';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    console.log('🔎 Verificação Meta GET:', { mode, token, challenge });
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      console.log('✅ Webhook VALIDADO! challenge:', challenge);
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    console.log('❌ Verificação falhou — token recebido:', token, '| esperado:', VERIFY_TOKEN);
    return new Response('Token verification failed', { status: 403 });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (_) {
      return new Response('EVENT_RECEIVED', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    console.log('📨 Webhook Meta POST recebido. Entries:', body?.entry?.length || 0);
    const base44 = createClientFromRequest(req);

    try {
      await processarMensagemMeta(body, base44);
    } catch (err) {
      console.error('❌ Erro ao processar:', err.message, err.stack);
    }

    return new Response('EVENT_RECEIVED', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processarMensagemMeta(body, base44) {
  console.log('🔄 Processando... object:', body?.object);

  if (!body.entry || !Array.isArray(body.entry)) {
    console.log('⚠️ Payload sem entry, ignorando');
    return;
  }

  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      const igAccountId = String(entry.id || '');
      for (const messaging of (entry.messaging || [])) {
        await salvarMensagemInstagram(base44, igAccountId, messaging);
      }
    }
    return;
  }

  // WhatsApp Business
  for (const entry of body.entry) {
    for (const change of (entry.changes || [])) {
      const value = change.value;
      for (const message of (value.messages || [])) {
        await salvarMensagemMeta(base44, value, message);
      }
      for (const status of (value.statuses || [])) {
        await atualizarStatusMensagem(base44, status);
      }
    }
  }
}

// ── Download de mídia da Meta ─────────────────────────────────────────────────
async function baixarMidiaMeta(base44, mediaId, accessToken, nomeArquivoPadrao = 'arquivo') {
  if (!mediaId || !accessToken) {
    return { arquivo_url: null, arquivo_nome: null, mime_type: null, erro: 'mediaId ou accessToken ausente' };
  }
  try {
    console.log(`📎 [META-DOWNLOAD] Buscando mídia id=${mediaId}`);

    const infoResp = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const infoText = await infoResp.text();
    console.log(`📎 [META-DOWNLOAD] Info status=${infoResp.status} | ${infoText.substring(0, 300)}`);

    if (!infoResp.ok) {
      return { arquivo_url: null, arquivo_nome: null, mime_type: null, erro: `Erro info mídia: ${infoText}` };
    }

    const metaInfo = JSON.parse(infoText);
    const mediaUrl = metaInfo.url;
    const mimeType = metaInfo.mime_type || 'application/octet-stream';

    if (!mediaUrl) {
      return { arquivo_url: null, arquivo_nome: null, mime_type: mimeType, erro: 'URL da mídia não retornada' };
    }

    console.log(`📥 [META-DOWNLOAD] Baixando de ${mediaUrl.substring(0, 80)}... mime=${mimeType}`);
    const arquivoResp = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!arquivoResp.ok) {
      const erroDownload = await arquivoResp.text().catch(() => '');
      return { arquivo_url: null, arquivo_nome: null, mime_type: mimeType, erro: `Erro download: ${erroDownload}` };
    }

    const arrayBuffer = await arquivoResp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: mimeType });

    let extensao = 'bin';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extensao = 'jpg';
    else if (mimeType.includes('png')) extensao = 'png';
    else if (mimeType.includes('webp')) extensao = 'webp';
    else if (mimeType.includes('ogg')) extensao = 'ogg';
    else if (mimeType.includes('mpeg')) extensao = 'mp3';
    else if (mimeType.includes('mp4')) extensao = 'mp4';
    else if (mimeType.includes('aac')) extensao = 'aac';
    else if (mimeType.includes('pdf')) extensao = 'pdf';

    const nomeGerado = `${nomeArquivoPadrao}_${Date.now()}.${extensao}`;
    const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new File([blob], nomeGerado, { type: mimeType })
    });

    console.log(`✅ [META-DOWNLOAD] Upload OK: ${uploadRes?.file_url}`);
    return { arquivo_url: uploadRes?.file_url || null, arquivo_nome: nomeGerado, mime_type: mimeType, erro: null };
  } catch (e) {
    console.error(`❌ [META-DOWNLOAD] Erro: ${e.message}`);
    return { arquivo_url: null, arquivo_nome: null, mime_type: null, erro: e.message };
  }
}

async function salvarMensagemMeta(base44, value, message) {
  const telefoneLimpo = String(message.from || '').replace(/\D/g, '');
  const msgId = message.id;
  const timestamp = message.timestamp;
  const phoneNumberId = String(value.metadata?.phone_number_id || '').trim();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📱 [META] De: ${telefoneLimpo} | tipo: ${message.type} | msgId: ${msgId}`);
  console.log(`🏷️ [META] phone_number_id: ${phoneNumberId}`);

  // Buscar empresa pelo phone_number_id
  const todasEmpresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 50);
  let empresa = todasEmpresas.find(e => String(e.whatsapp_phone_number_id || '').trim() === phoneNumberId);
  if (!empresa) {
    const comToken = todasEmpresas.filter(e => e.whatsapp_access_token && e.whatsapp_phone_number_id);
    empresa = comToken[0] || todasEmpresas[0];
    console.log(`⚠️ [META] Empresa não encontrada por phone_number_id=${phoneNumberId}, usando fallback: ${empresa?.nome}`);
  } else {
    console.log(`✅ [META] Empresa: ${empresa.nome} (${empresa.id})`);
  }

  if (!empresa) { console.log('❌ [META] Nenhuma empresa encontrada'); return; }

  const empresaId = empresa.id;
  const accessToken = empresa.whatsapp_access_token;

  // Processar tipo de mensagem e baixar mídia se necessário
  let tipoConteudo = 'texto';
  let texto = null;
  let arquivoUrl = null;
  let arquivoNome = null;
  let mimeType = null;
  let mediaId = null;
  let downloadStatus = 'nao_aplicavel';

  if (message.type === 'text') {
    texto = message.text?.body || '';
  } else if (message.type === 'image') {
    tipoConteudo = 'imagem';
    texto = message.image?.caption || '[Imagem]';
    mediaId = message.image?.id;
    mimeType = message.image?.mime_type || 'image/jpeg';
    if (mediaId && accessToken) {
      console.log(`📸 [META] Baixando imagem media_id=${mediaId}`);
      const res = await baixarMidiaMeta(base44, mediaId, accessToken, `img_${telefoneLimpo}`);
      arquivoUrl = res.arquivo_url;
      arquivoNome = res.arquivo_nome;
      mimeType = res.mime_type || mimeType;
      downloadStatus = arquivoUrl ? 'baixado' : 'erro';
      if (res.erro) console.warn(`⚠️ [META] Erro download imagem: ${res.erro}`);
    }
  } else if (message.type === 'audio' || message.type === 'voice') {
    tipoConteudo = 'audio';
    texto = '[Áudio]';
    mediaId = message.audio?.id || message.voice?.id;
    mimeType = message.audio?.mime_type || message.voice?.mime_type || 'audio/ogg';
    if (mediaId && accessToken) {
      console.log(`🎵 [META] Baixando áudio media_id=${mediaId} mime=${mimeType}`);
      const res = await baixarMidiaMeta(base44, mediaId, accessToken, `audio_${telefoneLimpo}`);
      arquivoUrl = res.arquivo_url;
      arquivoNome = res.arquivo_nome;
      mimeType = res.mime_type || mimeType;
      downloadStatus = arquivoUrl ? 'baixado' : 'erro';
      if (res.erro) console.warn(`⚠️ [META] Erro download áudio: ${res.erro}`);
      console.log(`🎵 [META] Áudio: status=${downloadStatus} | url=${arquivoUrl?.substring(0, 60)}`);
    } else {
      downloadStatus = 'pendente';
      console.warn(`⚠️ [META] Áudio sem mediaId ou accessToken — marcado como pendente`);
    }
  } else if (message.type === 'video') {
    tipoConteudo = 'video';
    texto = message.video?.caption || '[Vídeo]';
    mediaId = message.video?.id;
    mimeType = message.video?.mime_type || 'video/mp4';
    if (mediaId && accessToken) {
      const res = await baixarMidiaMeta(base44, mediaId, accessToken, `video_${telefoneLimpo}`);
      arquivoUrl = res.arquivo_url;
      arquivoNome = res.arquivo_nome;
      downloadStatus = arquivoUrl ? 'baixado' : 'erro';
    }
  } else if (message.type === 'document') {
    tipoConteudo = 'documento';
    texto = message.document?.caption || message.document?.filename || '[Documento]';
    mediaId = message.document?.id;
    mimeType = message.document?.mime_type || 'application/octet-stream';
    arquivoNome = message.document?.filename;
    if (mediaId && accessToken) {
      const res = await baixarMidiaMeta(base44, mediaId, accessToken, `doc_${telefoneLimpo}`);
      arquivoUrl = res.arquivo_url;
      if (!arquivoNome) arquivoNome = res.arquivo_nome;
      downloadStatus = arquivoUrl ? 'baixado' : 'erro';
    }
  } else if (message.type === 'button') {
    texto = message.button?.text || message.button?.payload || '[Botão]';
  } else if (message.type === 'interactive') {
    texto = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[Interativo]';
  } else {
    texto = `[${message.type || 'Mensagem'}]`;
  }

  const nomePerfil = value.contacts?.[0]?.profile?.name || null;

  // Buscar/criar ContatoWhatsapp
  const contatosExistentes = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
    { empresa_id: empresaId, telefone: telefoneLimpo }, null, 1
  );
  if (contatosExistentes.length > 0) {
    const upd = { ultima_atualizacao: new Date().toISOString() };
    if (!contatosExistentes[0].nome_fixo && nomePerfil && !contatosExistentes[0].nome) upd.nome = nomePerfil;
    await base44.asServiceRole.entities.ContatoWhatsapp.update(contatosExistentes[0].id, upd).catch(() => {});
  } else if (telefoneLimpo) {
    await base44.asServiceRole.entities.ContatoWhatsapp.create({
      empresa_id: empresaId, telefone: telefoneLimpo,
      nome: nomePerfil || telefoneLimpo, ultima_atualizacao: new Date().toISOString()
    }).catch(() => {});
  }

  // ── REGRA PRINCIPAL: conversa é identificada por (empresa + telefone + phone_number_id_meta) ──
  // Nunca misturar conversas de canais diferentes do mesmo contato.
  const tel12 = telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13 ? telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5) : null;
  const tel13 = telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12 ? telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4) : null;
  const variacoes = [telefoneLimpo, tel12, tel13].filter(Boolean);

  // Buscar todas as conversas da empresa para filtrar
  const todasConvs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
    { empresa_id: empresaId }, '-data_ultima_mensagem', 500
  );

  // Todas as conversas deste número (qualquer canal)
  const conversasDoNumero = todasConvs.filter(c => {
    const t = String(c.cliente_telefone || '').replace(/\D/g, '');
    return variacoes.includes(t);
  });

  // 1ª prioridade: conversa já marcada como Meta com este phone_number_id
  let conversa = conversasDoNumero.find(c => c.phone_number_id_meta === phoneNumberId);

  // 2ª prioridade: qualquer conversa Meta deste número (sem phone_number_id ou com outro)
  if (!conversa) {
    conversa = conversasDoNumero.find(c =>
      c.canal_origem === 'meta' || c.provider === 'whatsapp_meta' || c.tipo_conexao === 'meta_oficial'
    );
  }

  // 3ª prioridade: qualquer conversa existente deste número (Evolution ou outra) — converter para Meta
  // Isso garante que a conversa já aberta com o cliente seja migrada para Meta em vez de criar uma duplicata
  if (!conversa && conversasDoNumero.length > 0) {
    conversa = conversasDoNumero[0]; // mais recente (ordenado por -data_ultima_mensagem)
    console.log(`🔄 [META] Conversa Evolution encontrada — convertendo para Meta: ${conversa.id}`);
  }

  console.log(`🔍 [META] Busca conversa | phone_number_id=${phoneNumberId} | variacoes=${variacoes.join(',')} | total conversas número=${conversasDoNumero.length} | conversa encontrada=${conversa?.id || 'NENHUMA'}`);

  let conversa_id_final = null;

  if (conversa) {
    // Conversa Meta já existe — atualizar mantendo canal fixo
    const updateData = {
      ultima_mensagem: String(texto || '').slice(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      ultimo_remetente: 'cliente',
      status: 'ativa',
      phone_number_id_meta: phoneNumberId,
      last_inbound_provider: 'whatsapp_meta',
      // Reforçar campos Meta sempre (nunca deixar vazio)
      canal_origem: 'meta',
      provider: 'whatsapp_meta',
      locked_provider: true,
      tipo_conexao: 'meta_oficial',
      instancia: 'META_OFICIAL',
      canal_atendimento: 'meta_oficial',
      canal_preferencial: 'meta_oficial',
    };
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, updateData);
    conversa_id_final = conversa.id;
    console.log(`💬 [META] Conversa Meta atualizada: ${conversa.id}`);
  } else {
    // Não existe conversa Meta para este phone_number_id + telefone — criar nova
    // NUNCA reusar uma conversa Evolution existente para responder via Meta
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId,
      cliente_nome: nomePerfil || telefoneLimpo,
      cliente_telefone: telefoneLimpo,
      whatsapp_id: telefoneLimpo,
      status: 'ativa',
      tipo_conexao: 'meta_oficial',
      instancia: 'META_OFICIAL',
      canal_origem: 'meta',
      provider: 'whatsapp_meta',
      locked_provider: true,
      phone_number_id_meta: phoneNumberId,
      canal_atendimento: 'meta_oficial',
      canal_preferencial: 'meta_oficial',
      last_inbound_provider: 'whatsapp_meta',
      ultima_mensagem: String(texto || '').slice(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      ultimo_remetente: 'cliente',
    });
    conversa_id_final = conversa.id;
    console.log(`✨ [META] Nova conversa Meta criada (phone_number_id=${phoneNumberId}): ${conversa.id}`);
  }

  // Verificar duplicata
  const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
    { conversa_id: conversa.id, whatsapp_message_id: String(msgId) }, null, 1
  );
  if (existentes.length > 0) {
    console.log(`⏭️ [META] Duplicata ignorada: ${msgId}`);
    return;
  }

  // Salvar mensagem
  const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
    conversa_id: conversa.id,
    empresa_id: empresaId,
    remetente: 'cliente',
    tipo_conteudo: tipoConteudo,
    texto: String(texto || '').slice(0, 5000),
    arquivo_url: arquivoUrl,
    arquivo_nome: arquivoNome,
    arquivo_tamanho: 0,
    provider: 'whatsapp_meta',
    media_id: mediaId || null,
    mime_type: mimeType || null,
    download_status: downloadStatus,
    whatsapp_message_id: String(msgId),
    data_envio: new Date(Number(timestamp) * 1000).toISOString(),
    status: 'entregue',
  });

  console.log(`✅ [META] Mensagem salva: ${mensagem.id} | tipo=${tipoConteudo} | download=${downloadStatus}`);
}

async function salvarMensagemInstagram(base44, igAccountId, messaging) {
  if (messaging.message?.is_echo) return;

  const senderId = String(messaging.sender?.id || '');
  const recipientId = String(messaging.recipient?.id || '');
  const msg = messaging.message;
  if (!msg || !senderId) return;

  const msgId = msg.mid || '';
  console.log(`📸 [IG] De ${senderId} → conta ${recipientId}`);

  let tipoConteudo = 'texto';
  let texto = msg.text || null;
  let arquivoUrl = null;

  if (msg.attachments?.length > 0) {
    const att = msg.attachments[0];
    if (att.type === 'image') { tipoConteudo = 'imagem'; texto = texto || '[Imagem]'; arquivoUrl = att.payload?.url || null; }
    else if (att.type === 'video') { tipoConteudo = 'video'; texto = texto || '[Vídeo]'; arquivoUrl = att.payload?.url || null; }
    else if (att.type === 'audio') { tipoConteudo = 'audio'; texto = texto || '[Áudio]'; arquivoUrl = att.payload?.url || null; }
    else { texto = texto || `[${att.type}]`; }
  }
  if (!texto) texto = '[Mensagem]';

  const todasEmpresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 50);
  let empresa = todasEmpresas.find(e => String(e.instagram_user_id || '').trim() === recipientId);
  if (!empresa) empresa = todasEmpresas.find(e => String(e.meta_business_id || '').trim() === recipientId);
  if (!empresa) empresa = todasEmpresas.find(e => e.instagram_access_token);
  if (!empresa) { console.log('❌ [IG] Nenhuma empresa encontrada para account:', recipientId); return; }

  const empresaId = empresa.id;
  const igContactId = `ig_${senderId}`;

  let igNome = null, igFoto = null, igUsername = null;
  try {
    const igToken = empresa.instagram_access_token;
    if (igToken) {
      const profileResp = await fetch(`https://graph.facebook.com/v21.0/${senderId}?fields=name,profile_pic,username&access_token=${igToken}`);
      if (profileResp.ok) {
        const profileData = await profileResp.json();
        igNome = profileData.name; igFoto = profileData.profile_pic; igUsername = profileData.username;
      }
    }
  } catch (_) {}
  if (!igNome) igNome = `Instagram ${senderId}`;

  // Buscar/criar conversa Instagram
  const todasConvs = await base44.asServiceRole.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, 'created_date', 500);
  let conversa = todasConvs.find(c => String(c.cliente_telefone || '') === igContactId);

  if (!conversa) {
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId,
      cliente_nome: igNome,
      cliente_telefone: igContactId,
      whatsapp_id: igContactId,
      foto_url: igFoto,
      status: 'ativa',
      tipo_conexao: 'instagram',
      instancia: 'INSTAGRAM',
      canal_origem: 'instagram',
      provider: 'instagram',
      locked_provider: true,
    });
  } else {
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
      status: 'ativa',
      tipo_conexao: 'instagram',
      instancia: 'INSTAGRAM',
      cliente_nome: igNome,
      ...(igFoto ? { foto_url: igFoto } : {}),
    });
  }

  if (msgId) {
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { conversa_id: conversa.id, whatsapp_message_id: msgId }, null, 1
    );
    if (existentes.length > 0) { console.log('⏭️ [IG] Duplicata ignorada:', msgId); return; }
  }

  const timestamp = messaging.timestamp || Math.floor(Date.now() / 1000);
  const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
    conversa_id: conversa.id, empresa_id: empresaId,
    remetente: 'cliente', tipo_conteudo: tipoConteudo,
    texto: String(texto).slice(0, 5000),
    arquivo_url: arquivoUrl,
    provider: 'instagram',
    download_status: 'nao_aplicavel',
    whatsapp_message_id: msgId,
    data_envio: new Date(Number(timestamp) * 1000).toISOString(),
    status: 'entregue',
  });

  await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
    ultima_mensagem: String(texto).slice(0, 100),
    data_ultima_mensagem: new Date().toISOString(),
    ultimo_remetente: 'cliente',
  });

  console.log(`✅ [IG] Mensagem salva: ${mensagem.id}`);
}

async function atualizarStatusMensagem(base44, status) {
  const msgId = status.id;
  if (!msgId) return;
  const statusMap = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'erro' };
  const novoStatus = statusMap[status.status];
  if (!novoStatus) return;
  const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
    { whatsapp_message_id: String(msgId) }, null, 1
  );
  if (msgs.length > 0) {
    await base44.asServiceRole.entities.MensagemWhatsapp.update(msgs[0].id, { status: novoStatus });
    console.log(`📬 [META] Status: ${msgId} → ${novoStatus}`);
  }
}
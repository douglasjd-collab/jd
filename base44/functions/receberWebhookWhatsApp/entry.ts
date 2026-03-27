import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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

function decodeBase64JSON(str) {
  try {
    if (!str || typeof str !== 'string') return null;
    const clean = str.trim();
    if (clean.length < 4) return null;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(clean)) return null;
    const binaryStr = atob(clean.replace(/\s/g, ''));
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const jsonStr = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(jsonStr);
  } catch (_) {
    return null;
  }
}

function normalizarPayload(rawBody) {
  let parsed = null;
  try { parsed = JSON.parse(rawBody); } catch (_) {}
  if (!parsed) {
    parsed = decodeBase64JSON(rawBody);
    if (parsed && typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (_) { return null; }
    }
  }
  if (!parsed) return null;

  if (parsed.event && typeof parsed.data === 'string' && parsed.data.length > 0) {
    const decodedData = decodeBase64JSON(parsed.data);
    if (decodedData) parsed.data = decodedData;
    else { try { parsed.data = JSON.parse(parsed.data); } catch (_) {} }
  }

  if (!parsed.event && parsed.data && parsed.data.event) {
    parsed = parsed.data;
    if (parsed.event && typeof parsed.data === 'string' && parsed.data.length > 0) {
      const decodedData = decodeBase64JSON(parsed.data);
      if (decodedData) parsed.data = decodedData;
    }
  }

  return parsed;
}

function extrairTelefoneValido(jid) {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.includes('@g.us') || jid.includes('@broadcast')) return null;
  if (jid.includes('@lid')) return null;
  // Aceitar tanto @s.whatsapp.net quanto @c.us
  const numeros = jid.replace(/@s\.whatsapp\.net|@c\.us|@s\.whatsapp\.net:\d+/g, '').replace(/\D/g, '');
  return numeros || null;
}

async function resolverLidParaTelefone(lid, evolutionUrl, evolutionKey, instanceName) {
  const lidNumerico = lid.replace(/@lid/g, '').replace(/\D/g, '');

  // Método 1: fetchProfile
  try {
    const res = await fetch(`${evolutionUrl}/contact/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: lidNumerico })
    });
    if (res.ok) {
      const data = await res.json();
      const jid = data?.jid || data?.wuid || data?.id || '';
      if (jid.includes('@s.whatsapp.net') || jid.includes('@c.us')) {
        const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
        if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
      }
    }
  } catch (e) { console.warn('⚠️ fetchProfile falhou:', e.message); }

  // Método 2: buscar nas mensagens por remoteJidAlt (mais confiável)
  try {
    const res2 = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { remoteJid: lid } }, limit: 5 })
    });
    if (res2.ok) {
      const data2 = await res2.json();
      const msgs = Array.isArray(data2) ? data2 : (data2.messages?.records || data2.messages || []);
      for (const m of msgs) {
        const alt = m.key?.remoteJidAlt || m.key?.participant || '';
        const tel = alt.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
        if (tel && tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
          console.log(`✅ LID resolvido via mensagem_alt: ${lid} → ${tel}`);
          return tel;
        }
      }
    }
  } catch (e) { console.warn('⚠️ findMessages lid falhou:', e.message); }

  return null;
}

function validarTelefone(num) {
  if (!num) return false;
  if (num.startsWith('lid_')) return false;
  if (num.length < 10 || num.length > 15) return false;
  if (/^(\d)\1{9,}$/.test(num)) return false;
  return true;
}

function normalizarParaBR(num) {
  // Se o número tem 11 ou 10 dígitos sem DDI, adiciona 55
  if (!num.startsWith('55') && (num.length === 10 || num.length === 11)) {
    return '55' + num;
  }
  // Se tem 9 dígitos começa com 9 (celular sem DDD), não é válido — retorna como está
  return num;
}

// Processamento principal em background (não bloqueia resposta HTTP)
async function processarWebhook(req, rawBody) {
  const url = new URL(req.url);
  const instanceFromQuery = url.searchParams.get('instance') || '';

  const payload = normalizarPayload(rawBody);
  if (!payload) {
    console.error('❌ Body inválido');
    return;
  }

  const event = (payload.event || '').toLowerCase().replace(/\./g, '_');
  const instancePayload = payload.instance || '';
  const instanceFinal = instanceFromQuery || instancePayload || '';

  console.log(`📋 Event: "${event}" | Instance: "${instanceFinal}"`);

  const data = payload.data || {};
  const base44 = createClientFromRequest(req);

  // ─── ACK / status update ──────────────────────────────────────────────────
  if (['messages_update', 'message_ack', 'messages_ack'].includes(event)) {
    const updates = Array.isArray(data) ? data : [data];
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
    return;
  }

  const isUpsert = ['messages_upsert', 'messages'].includes(event);
  if (!isUpsert) {
    console.log(`⏭️ Evento ignorado: "${event}"`);
    return;
  }

  const msgData = Array.isArray(data) ? data[0] : data;
  const key = msgData.key || {};
  const message = msgData.message || {};
  const pushName = msgData.pushName || msgData.senderName || 'Cliente';
  const fromMe = key.fromMe === true;
  const remoteJidOriginal = key.remoteJid || '';
  const messageId = key.id || `gen_${Date.now()}`;

  console.log(`📨 Mensagem ${fromMe ? '(ENVIADA)' : '(RECEBIDA)'} | remoteJid: ${remoteJidOriginal} | msgId: ${messageId}`);

  if (remoteJidOriginal.includes('@g.us')) {
    console.log('⏭️ Grupo ignorado');
    return;
  }

  // Empresa padrão — usar a empresa JD
  let empresaId = '699696c2c9f5bffc2e67402b';
  let clienteId = null;
  let colaboradorId = null;
  let tipoConexao = 'empresa';

  // Tentar extrair telefone diretamente (quando não é @lid)
  let telefoneLimpo = extrairTelefoneValido(remoteJidOriginal);
  if (telefoneLimpo) telefoneLimpo = normalizarParaBR(telefoneLimpo);

  // Se o JID é @lid, tentar resolver SEMPRE (banco → Evolution API → remoteJidAlt)
  if (remoteJidOriginal.includes('@lid')) {
    const lidNumerico = remoteJidOriginal.replace(/@lid/g, '').replace(/\D/g, '');
    console.log(`🔍 @lid detectado: "${lidNumerico}" (${pushName})`);

    // 1. Verificar cache no banco (ContatoWhatsapp)
    const contatosLid = await base44.asServiceRole.entities.ContatoWhatsapp.filter({
      empresa_id: empresaId, lid_jid: lidNumerico
    });

    if (contatosLid.length > 0 && contatosLid[0].telefone && !contatosLid[0].telefone.includes('@')) {
      telefoneLimpo = contatosLid[0].telefone;
      console.log(`✅ @lid resolvido via cache: ${telefoneLimpo}`);
    } else {
      // 2. Tentar via remoteJidAlt (vem no payload em alguns casos)
      if (key.remoteJidAlt && !key.remoteJidAlt.includes('@lid')) {
        const altTel = extrairTelefoneValido(key.remoteJidAlt);
        if (altTel) {
          telefoneLimpo = normalizarParaBR(altTel);
          console.log(`✅ @lid resolvido via remoteJidAlt: ${telefoneLimpo}`);
        }
      }

      // 3. Tentar via Evolution API (fetchProfile + histórico de mensagens)
      if (!telefoneLimpo) {
        const empresaData = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
        if (empresaData?.[0]?.evolution_url) {
          const emp = empresaData[0];
          telefoneLimpo = await resolverLidParaTelefone(
            remoteJidOriginal,
            emp.evolution_url.replace(/\/$/, ''),
            emp.evolution_api_key,
            emp.evolution_instance_name
          );
        }
      }

      // 4. Salvar no cache para próximas mensagens
      if (telefoneLimpo) {
        base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId, telefone: telefoneLimpo,
          nome: pushName || telefoneLimpo, lid_jid: lidNumerico,
          ultima_atualizacao: new Date().toISOString()
        }).catch(() => {});
        console.log(`✅ @lid resolvido e salvo no cache: ${remoteJidOriginal} → ${telefoneLimpo}`);
      } else {
        console.warn(`⚠️ @lid não resolvido: "${remoteJidOriginal}" (${pushName}) — mensagem ignorada`);
        return;
      }
    }
  }

  if (!telefoneLimpo || !validarTelefone(telefoneLimpo)) {
    console.warn(`⚠️ Número inválido: remoteJid="${remoteJidOriginal}" | tel="${telefoneLimpo}" | pushName="${pushName}" — ignorado`);
    return;
  }

  console.log(`📞 Tel: ${telefoneLimpo} | msgId: ${messageId}`);

  // Variações do telefone
  const telefonesVariacoes = [telefoneLimpo];
  if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
    telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
  } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
    telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5));
  }

  // Extrair conteúdo e URL de arquivo
  let tipo = 'texto';
  let conteudo = '';
  let arquivo_url = '';
  let arquivo_nome = '';
  let arquivo_tamanho = 0;

  if (message.conversation) conteudo = message.conversation;
  else if (message.extendedTextMessage?.text) conteudo = message.extendedTextMessage.text;
  else if (message.imageMessage) { 
    tipo = 'imagem'; 
    conteudo = message.imageMessage.caption || 'Imagem';
    arquivo_url = message.imageMessage.url || '';
  }
  else if (message.audioMessage || message.pttMessage) { 
    tipo = 'audio'; 
    conteudo = 'Áudio';
    arquivo_url = message.audioMessage?.url || message.pttMessage?.url || '';
    const fla = message.audioMessage?.fileLength || message.pttMessage?.fileLength || 0;
    arquivo_tamanho = (typeof fla === 'object' && fla !== null && 'low' in fla) ? (fla.low + fla.high * 4294967296) : Number(fla) || 0;
  }
  else if (message.videoMessage) { 
    tipo = 'video'; 
    conteudo = message.videoMessage.caption || 'Vídeo';
    arquivo_url = message.videoMessage.url || '';
    const flv = message.videoMessage.fileLength || 0;
    arquivo_tamanho = (typeof flv === 'object' && flv !== null && 'low' in flv) ? (flv.low + flv.high * 4294967296) : Number(flv) || 0;
  }
  else if (message.documentMessage) { 
    tipo = 'pdf'; 
    conteudo = message.documentMessage.title || 'Documento';
    arquivo_url = message.documentMessage.url || '';
    arquivo_nome = message.documentMessage.fileName || 'Documento';
    const fld = message.documentMessage.fileLength || 0;
    arquivo_tamanho = (typeof fld === 'object' && fld !== null && 'low' in fld) ? (fld.low + fld.high * 4294967296) : Number(fld) || 0;
  }
  else if (message.stickerMessage) { 
    tipo = 'imagem'; 
    conteudo = 'Sticker';
    arquivo_url = message.stickerMessage.url || '';
  }
  else conteudo = JSON.stringify(message).substring(0, 200);

  console.log(`📝 Tipo: ${tipo} | Conteúdo: "${conteudo.substring(0, 100)}" | URL: ${arquivo_url ? '✓' : '✗'}`);

  // Verificar duplicata
  const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ 
    whatsapp_message_id: messageId 
  });
  
  if (existentes.length > 0) {
    console.log('⏭️ Duplicata ignorada:', messageId);
    return;
  }

  console.log(`✅ EmpresaId: ${empresaId}`);

  // Buscar conversa
  let conversa = null;
  const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
    empresa_id: empresaId,
    cliente_telefone: telefoneLimpo
  }, '-data_ultima_mensagem', 1);

  if (conversas.length > 0) {
    conversa = conversas[0];
  }

  if (conversa) {
    // Atualizar conversa existente — SEMPRE com número correto
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: conteudo.substring(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      status: 'ativa',
      tipo_conexao: tipoConexao,
      colaborador_id: colaboradorId || conversa.colaborador_id || '',
      cliente_id: clienteId || conversa.cliente_id || '',
      instancia: instanceFinal,
      cliente_nome: conversa.cliente_nome || pushName || telefoneLimpo,
      cliente_telefone: telefoneLimpo, // Garantir número correto (nunca @lid)
      whatsapp_id: `${telefoneLimpo}@s.whatsapp.net` // Sempre número correto
    });
  } else {
    // Criar conversa APENAS com número correto (NUNCA @lid)
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId, cliente_id: clienteId,
      cliente_nome: pushName || telefoneLimpo, 
      cliente_telefone: telefoneLimpo, // GARANTIDO correto (validado acima)
      whatsapp_id: `${telefoneLimpo}@s.whatsapp.net`, // Padrão WhatsApp
      status: 'ativa',
      ultima_mensagem: conteudo.substring(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      tipo_conexao: tipoConexao, 
      colaborador_id: colaboradorId || '',
      instancia: instanceFinal
    });
    console.log(`✅ Conversa criada: ${conversa.id} | Tel: ${telefoneLimpo}`);
  }

  // Salvar mensagem
  const remetente = fromMe ? 'vendedor' : 'cliente';
  const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
    conversa_id: conversa.id, empresa_id: empresaId,
    remetente, tipo_conteudo: tipo, texto: conteudo,
    arquivo_url: arquivo_url || null,
    arquivo_nome: arquivo_nome || null,
    arquivo_tamanho: arquivo_tamanho || 0,
    whatsapp_message_id: messageId,
    data_envio: new Date().toISOString(),
    status: remetente === 'vendedor' ? 'enviada' : 'entregue'
  });

  console.log(`✅ Mensagem salva: ${novaMensagem.id} | remetente: ${remetente}`);

  // Log em background
  base44.asServiceRole.entities.LogRecebimentoWebhook.create({
    empresa_id: empresaId,
    tipo_evento: 'mensagem_recebida',
    telefone: telefoneLimpo,
    conteudo: conteudo.substring(0, 100),
    status: 'sucesso',
    mensagem_id: novaMensagem.id,
    conversa_id: conversa.id,
    instancia: instanceFinal,
    timestamp: new Date().toISOString()
  }).catch(() => {});
}

Deno.serve(async (req) => {
  console.log(`📥 WEBHOOK | ${req.method} | ${new Date().toISOString()}`);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge') || 'OK';
    return new Response(challenge, { status: 200 });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não suportado' }, { status: 405 });
  }

  // Ler body ANTES de responder
  const rawBody = await req.text();
  console.log(`📦 Body: ${rawBody.length} bytes`);

  // Processar IMEDIATAMENTE (não em background)
  await processarWebhook(req, rawBody).catch((error) => {
    console.error('❌ Erro ao processar:', error.message);
    console.error('❌ STACK:', error.stack);
  });

  // ⚡ Responder 200 após processar
  return Response.json({ success: true, received: true });
});
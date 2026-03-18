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
  if (!parsed) parsed = decodeBase64JSON(rawBody);
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
  if (!jid.includes('@s.whatsapp.net') && !jid.includes('@c.us')) return null;
  const numeros = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
  return numeros || null;
}

async function resolverLidParaTelefone(lid, evolutionUrl, evolutionKey, instanceName) {
  const lidNumerico = lid.replace(/@lid/g, '').replace(/\D/g, '');

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

  return null;
}

const BLOCKLIST = new Set(['lid_15578500694049', 'lid_131829726244871', 'lid_49328018215052']);

function validarTelefone(num) {
  if (!num) return false;
  if (BLOCKLIST.has(num)) return false;
  if (num.startsWith('lid_')) return false;
  if (!num.startsWith('55')) return false;
  if (num.length !== 12 && num.length !== 13) return false;
  if (/^(\d)\1{9,}$/.test(num)) return false;
  return true;
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
  const remoteJidRaw = (key.remoteJid || '').includes('@lid') && key.remoteJidAlt
    ? key.remoteJidAlt
    : (key.remoteJid || '');
  const remoteJidOriginal = key.remoteJid || '';
  const messageId = key.id || `gen_${Date.now()}`;

  if (remoteJidRaw.includes('@g.us')) {
    console.log('⏭️ Grupo ignorado');
    return;
  }

  const JD_ID = '699696c2c9f5bffc2e67402b';
  let empresaId = JD_ID;
  let colaboradorId = null;
  let tipoConexao = 'empresa';

  // Bloqueio @lid sem resolução
  if (remoteJidOriginal.includes('@lid') || remoteJidOriginal.startsWith('lid_')) {
    if (!remoteJidRaw.includes('@s.whatsapp.net') && !remoteJidRaw.includes('@c.us')) {
      console.warn(`⚠️ JID lid_ sem resolução: "${remoteJidOriginal}" — ignorado`);
      return;
    }
  }

  let telefoneLimpo = extrairTelefoneValido(remoteJidRaw);

  if (!telefoneLimpo && remoteJidRaw.includes('@lid')) {
    const lidNumerico = remoteJidRaw.replace(/@lid/g, '').replace(/\D/g, '');
    // Tentar resolver via ContatoWhatsapp e Evolution em paralelo
    const [contatosLid, empresaData] = await Promise.all([
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id: empresaId, lid_jid: lidNumerico }),
      base44.asServiceRole.entities.Empresa.filter({ id: JD_ID })
    ]);

    if (contatosLid.length > 0) {
      telefoneLimpo = contatosLid[0].telefone;
    } else if (empresaData?.[0]?.evolution_url) {
      const emp = empresaData[0];
      telefoneLimpo = await resolverLidParaTelefone(
        remoteJidRaw, emp.evolution_url.replace(/\/$/, ''), emp.evolution_api_key, emp.evolution_instance_name
      );
      if (telefoneLimpo) {
        base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId, telefone: telefoneLimpo,
          nome: pushName || telefoneLimpo, lid_jid: lidNumerico,
          ultima_atualizacao: new Date().toISOString()
        }).catch(() => {});
      }
    }
  }

  if (!telefoneLimpo || telefoneLimpo.startsWith('lid_') || !validarTelefone(telefoneLimpo)) {
    console.warn(`⚠️ Número inválido/não resolvido: "${remoteJidRaw}" — ignorado`);
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
    arquivo_tamanho = message.audioMessage?.fileLength || message.pttMessage?.fileLength || 0;
  }
  else if (message.videoMessage) { 
    tipo = 'video'; 
    conteudo = message.videoMessage.caption || 'Vídeo';
    arquivo_url = message.videoMessage.url || '';
    arquivo_tamanho = message.videoMessage.fileLength || 0;
  }
  else if (message.documentMessage) { 
    tipo = 'pdf'; 
    conteudo = message.documentMessage.title || 'Documento';
    arquivo_url = message.documentMessage.url || '';
    arquivo_nome = message.documentMessage.fileName || 'Documento';
    arquivo_tamanho = message.documentMessage.fileLength || 0;
  }
  else if (message.stickerMessage) { 
    tipo = 'imagem'; 
    conteudo = 'Sticker';
    arquivo_url = message.stickerMessage.url || '';
  }
  else conteudo = JSON.stringify(message).substring(0, 200);

  console.log(`📝 Tipo: ${tipo} | Conteúdo: "${conteudo.substring(0, 100)}" | URL: ${arquivo_url ? '✓' : '✗'}`);

  // Queries em paralelo: dedup + instância + contato + cliente
  const [existentes, colaboradoresInst, empresasInst, ...contatosClientes] = await Promise.all([
    base44.asServiceRole.entities.MensagemWhatsapp.filter({ whatsapp_message_id: messageId }),
    instanceFinal ? base44.asServiceRole.entities.Colaborador.filter({ evolution_instance_name: instanceFinal }) : Promise.resolve([]),
    instanceFinal ? base44.asServiceRole.entities.Empresa.filter({ evolution_instance_name: instanceFinal }) : Promise.resolve([]),
    ...telefonesVariacoes.map(tel =>
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id: empresaId, telefone: tel })
    ),
    ...telefonesVariacoes.map(tel =>
      base44.asServiceRole.entities.Cliente.filter({ empresa_id: empresaId, celular: tel })
    )
  ]);

  // Duplicata
  if (existentes.length > 0) {
    console.log('⏭️ Duplicata ignorada:', messageId);
    return;
  }

  // Identificar empresa pela instância
  if (colaboradoresInst?.length > 0) {
    const colab = colaboradoresInst[0];
    tipoConexao = 'usuario';
    colaboradorId = colab.id;
    empresaId = colab.empresa_id || JD_ID;
  } else if (empresasInst?.length > 0) {
    empresaId = empresasInst[0].id;
  }

  // Contato e cliente
  const nVariacoes = telefonesVariacoes.length;
  const contatoEncontrado = contatosClientes.slice(0, nVariacoes).find(r => r.length > 0)?.[0] || null;
  const clienteEncontrado = contatosClientes.slice(nVariacoes).find(r => r.length > 0)?.[0] || null;
  const clienteId = clienteEncontrado?.id || '';

  if (!contatoEncontrado) {
    base44.asServiceRole.entities.ContatoWhatsapp.create({
      empresa_id: empresaId, cliente_id: '',
      telefone: telefoneLimpo, nome: pushName || 'Cliente WhatsApp',
      ultima_atualizacao: new Date().toISOString()
    }).catch(() => {});
  }

  // Buscar conversa
  let conversa = null;
  for (const tel of telefonesVariacoes) {
    const resultado = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId, cliente_telefone: tel }
    );
    if (resultado?.length > 0) {
      if (resultado.length > 1) {
        resultado.sort((a, b) => new Date(b.data_ultima_mensagem || b.created_date) - new Date(a.data_ultima_mensagem || a.created_date));
        for (let i = 1; i < resultado.length; i++) {
          base44.asServiceRole.entities.ConversaWhatsapp.delete(resultado[i].id).catch(() => {});
        }
      }
      conversa = resultado[0];
      break;
    }
  }

  if (conversa) {
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: conteudo.substring(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      status: 'ativa',
      tipo_conexao: tipoConexao,
      colaborador_id: colaboradorId || conversa.colaborador_id || '',
      cliente_id: clienteId || conversa.cliente_id || '',
      instancia: instanceFinal,
      cliente_nome: conversa.cliente_nome || telefoneLimpo
    });
  } else {
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId, cliente_id: clienteId,
      cliente_nome: telefoneLimpo, cliente_telefone: telefoneLimpo,
      whatsapp_id: messageId, status: 'ativa',
      ultima_mensagem: conteudo.substring(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      tipo_conexao: tipoConexao, colaborador_id: colaboradorId || '',
      instancia: instanceFinal
    });
    console.log(`✅ Conversa criada: ${conversa.id}`);
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

  registrarLog(base44, empresaId, 'mensagem_recebida', {
    telefone: telefoneLimpo, conteudo: conteudo.substring(0, 100),
    status: 'sucesso', mensagem_id: novaMensagem.id,
    conversa_id: conversa.id, instancia: instanceFinal
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

  // ⚡ Responder 200 IMEDIATAMENTE para evitar retry do Evolution
  // O processamento continua em background
  const responsePromise = Response.json({ success: true, received: true });

  // Processar em background (não bloqueia a resposta)
  processarWebhook(req, rawBody).catch((error) => {
    console.error('❌ Erro no processamento background:', error.message);
    console.error('❌ STACK:', error.stack);
  });

  return responsePromise;
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Garantir que o app ID está disponível para service role
const APP_ID = Deno.env.get('BASE44_APP_ID') || '6950a9860c8af0e2ff10fc9e';

// Cache de empresas por instância (evita rate limit em rajadas de webhooks)
const empresaCache = new Map(); // instanceName → { empresa, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function buscarEmpresaPorInstancia(base44, instanceName) {
  const agora = Date.now();
  const cached = empresaCache.get(instanceName);
  if (cached && cached.expiresAt > agora) {
    return cached.empresa;
  }
  const empresas = await base44.asServiceRole.entities.Empresa.filter(
    { evolution_instance_name: instanceName }, null, 5
  );
  const empresa = empresas.length > 0 ? empresas[0] : null;
  empresaCache.set(instanceName, { empresa, expiresAt: agora + CACHE_TTL_MS });
  return empresa;
}

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
    num = '55' + num;
  }
  // Normalizar para 12 dígitos (sem o nono dígito) para evitar duplicatas
  // Ex: 5511987654321 (13) → 55118765432 (12)
  if (num.startsWith('55') && num.length === 13) {
    const ddd = num.slice(0, 4); // 55 + DDD
    const resto = num.slice(5);  // remove o 9 do início
    num = ddd + resto;
  }
  return num;
}

// Processamento principal em background (não bloqueia resposta HTTP)
async function processarWebhook(req, rawBody, base44) {
  const url = new URL(req.url);
  const instanceFromQuery = url.searchParams.get('instance') || '';

  const payload = normalizarPayload(rawBody);
  if (!payload) {
    console.error('❌ Body inválido');
    await registrarLog(base44, null, 'erro', {
      status: 'erro',
      erro: 'Body inválido',
      instancia: instanceFromQuery
    });
    return;
  }

  const eventRaw = (payload.event || '').toLowerCase();
  const event = eventRaw.replace(/\./g, '_');
  const instancePayload = payload.instance || '';
  const instanceFinal = instancePayload || instanceFromQuery || '';

  // 🔥 LOGS OBRIGATÓRIOS PARA DEBUG
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📥 WEBHOOK RECEBIDO | ${new Date().toISOString()}`);
  console.log(`🔗 URL recebida: ${req.url}`);
  console.log(`🏷️ instance recebida: "${instanceFinal || 'NENHUMA'}"`);
  console.log(`📋 Event: "${event}"`);
  console.log(`🔑 Payload keys: ${Object.keys(payload).join(', ')}`);
  console.log(`📊 Data type: ${Array.isArray(payload.data) ? 'ARRAY' : 'OBJECT'}`);
  console.log(`📄 Full data: ${JSON.stringify(payload.data).substring(0, 500)}`);
  console.log(`${'='.repeat(70)}\n`);

  // ⚠️ VALIDAR INSTÂNCIA
  if (!instanceFinal) {
    console.error('❌ ERRO CRÍTICO: Instância não identificada no webhook');
    await registrarLog(base44, null, 'erro', {
      status: 'erro',
      erro: 'Instância não identificada no webhook',
      instancia: instanceFromQuery
    });
    return;
  }

  let data = payload.data || {};
  
  // Se event é update, pode vir em payload.result ou outras estruturas
  if (event.includes('update') && !data && payload.result) {
    data = payload.result;
    console.log(`🔄 Detectado payload.result para update`);
  }

  // ─── ACK / status update ──────────────────────────────────────────────────
  const isAckEvent = [
    'messages_update', 'messages.update',
    'message_update', 'message.update',
    'message_ack', 'messages_ack',
    'ack', 'receipt', 'status'
  ].includes(event) || eventRaw.includes('update') || eventRaw.includes('ack');

  if (isAckEvent) {
    // 🔥 LOG COMPLETO DO ACK para diagnóstico
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🔔 ACK RECEBIDO: ${JSON.stringify(payload, null, 2).substring(0, 1500)}`);
    console.log(`${'─'.repeat(60)}\n`);

    // Normalizar para array de updates — Evolution pode enviar de formas variadas
    let updates = [];
    if (Array.isArray(data)) {
      updates = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.messages)) updates = data.messages;
      else updates = [data];
    }

    console.log(`🔔 ACK Event: "${event}" | Updates: ${updates.length}`);

    const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };

    for (const upd of updates) {
      if (!upd || typeof upd !== 'object') continue;

      // Extrair messageId — todos os campos possíveis da Evolution
      const remoteId =
        upd.key?.id ||
        upd.id ||
        upd.messageId ||
        upd.message?.key?.id ||
        upd.message?.id ||
        null;

      if (!remoteId) {
        console.log(`⏭️ Update sem messageId: ${JSON.stringify(upd).substring(0, 200)}`);
        continue;
      }

      // Log do objeto completo do update para diagnóstico
      console.log(`  📦 upd completo: ${JSON.stringify(upd).substring(0, 400)}`);

      // Extrair status — todos os campos possíveis, incluindo MessageUpdate[] da Evolution
      const statusPriorityEv = { 'READ': 4, 'PLAYED': 4, 'VIEWED': 4, 'DELIVERY_ACK': 2, 'DELIVERED': 2, 'DEVICE_READ': 2, 'SERVER_ACK': 1, 'SENT': 1 };
      let bestStatusVal = upd.update?.status ?? upd.status ?? upd.ack ?? upd.update?.ack ?? upd.receipt ?? null;
      // Verificar também MessageUpdate array
      if (Array.isArray(upd.MessageUpdate)) {
        for (const mu of upd.MessageUpdate) {
          const s = String(mu?.status || '').toUpperCase();
          if ((statusPriorityEv[s] ?? -1) > (statusPriorityEv[String(bestStatusVal || '').toUpperCase()] ?? -1)) {
            bestStatusVal = s;
          }
        }
      }
      const rawStatusVal = bestStatusVal;

      const rawStatus = rawStatusVal !== null && rawStatusVal !== undefined
        ? String(rawStatusVal).toUpperCase().trim()
        : '';
      const rawStatusNum = parseInt(rawStatus, 10);

      console.log(`  🔍 msgId: "${remoteId}" | rawStatus: "${rawStatus}" (num: ${rawStatusNum}) | keys: ${Object.keys(upd).join(',')}`);

      let novoStatus = null;
      // ack 3 = lida, ack 4 = lida (PLAYED para áudio), READ, PLAYED
      if (['READ', 'PLAYED', '3', '4', 'VIEWED'].includes(rawStatus) || rawStatusNum >= 3) {
        novoStatus = 'lida';
      } else if (['DELIVERY_ACK', 'DELIVERED', 'DEVICE_READ', '2'].includes(rawStatus) || rawStatusNum === 2) {
        novoStatus = 'entregue';
      } else if (['SENT', 'SERVER_ACK', 'PENDING', '1'].includes(rawStatus) || rawStatusNum === 1) {
        novoStatus = 'enviada';
      }

      console.log(`  🗺️ Mapeamento: rawStatus="${rawStatus}" rawNum=${rawStatusNum} → novoStatus="${novoStatus}"`);

      if (!novoStatus) {
        console.log(`  ⏭️ Status não mapeável: "${rawStatus}" — ignorado`);
        continue;
      }

      console.log(`  ✓ "${remoteId}" → ${novoStatus}`);

      // Busca primária: whatsapp_message_id exato
      let msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { whatsapp_message_id: remoteId }, '-created_date', 1
      );

      // Fallback: buscar nas últimas 300 mensagens de vendedor sem filtro de status
      if (!msgs || msgs.length === 0) {
        console.log(`  🔍 ID não encontrado direto — tentando fallback...`);
        const recentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { remetente: 'vendedor' }, '-created_date', 300
        );
        const idLimpo = remoteId.replace(/[^A-Za-z0-9]/g, '');
        const encontrado = recentes.find(m => {
          if (!m.whatsapp_message_id) return false;
          if (m.whatsapp_message_id === remoteId) return true;
          return m.whatsapp_message_id.replace(/[^A-Za-z0-9]/g, '') === idLimpo;
        });
        if (encontrado) {
          msgs = [encontrado];
          console.log(`  🔍 Fallback encontrou: ${encontrado.whatsapp_message_id} | status atual: ${encontrado.status}`);
        }
      }

      if (msgs && msgs.length > 0) {
        const msgAtual = msgs[0];
        const novaProioridade = statusPriority[novoStatus] || 0;
        const atualPrioridade = statusPriority[msgAtual.status] || 0;

        if (novaProioridade > atualPrioridade) {
          const updateData = { status: novoStatus };
          if (novoStatus === 'entregue') updateData.entregue_em = new Date().toISOString();
          if (novoStatus === 'lida') updateData.lida_em = new Date().toISOString();

          await base44.asServiceRole.entities.MensagemWhatsapp.update(msgAtual.id, updateData);
          console.log(`  ✅ Atualizado: ${msgAtual.status} → ${novoStatus} | banco id: ${msgAtual.id}`);
        } else {
          console.log(`  ⏭️ Sem upgrade: atual="${msgAtual.status}" (${atualPrioridade}) ≥ novo="${novoStatus}" (${novaProioridade})`);
        }
      } else {
        console.warn(`  ⚠️ Mensagem não encontrada no banco para id: "${remoteId}"`);
      }
    }
    return;
  }

  const isUpsert = ['messages_upsert'].includes(event);
  if (!isUpsert) {
    console.log(`⏭️ Evento ignorado: "${event}"`);
    return;
  }

  const msgData = Array.isArray(data) ? data[0] : data;
  const key = msgData.key || {};
  const message = msgData.message || {};

  // ─── REAÇÃO DE MENSAGEM ───────────────────────────────────────────────────
  if (message.reactionMessage) {
    const reaction = message.reactionMessage;
    const emoji = reaction.text || '';
    const targetId = reaction.key?.id || '';

    console.log(`😀 ReactionMessage | emoji: "${emoji}" | targetId: "${targetId}"`);

    if (targetId) {
      // Buscar mensagem original pelo whatsapp_message_id
      const mensagensOriginais = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { whatsapp_message_id: targetId }, '-created_date', 1
      );
      if (mensagensOriginais.length > 0) {
        const orig = mensagensOriginais[0];
        // Se emoji vazio = remoção da reação
        await base44.asServiceRole.entities.MensagemWhatsapp.update(orig.id, {
          reaction: emoji || null
        });
        console.log(`✅ Reação "${emoji}" aplicada à mensagem ${orig.id}`);
      } else {
        console.warn(`⚠️ Mensagem original não encontrada para reação: targetId=${targetId}`);
      }
    }
    return; // Não processar como mensagem normal
  }
  const pushName = msgData.pushName || msgData.senderName || 'Cliente';
  const fromMe = key.fromMe === true;
  const remoteJidOriginal = key.remoteJid || '';
  const messageId = key.id || `gen_${Date.now()}`;

  console.log(`📨 Mensagem ${fromMe ? '(ENVIADA)' : '(RECEBIDA)'} | remoteJid: ${remoteJidOriginal} | msgId: ${messageId}`);

  const isGrupo = remoteJidOriginal.includes('@g.us');

  // Determinar empresa pela instância Evolution (cada empresa tem sua instância)
  let empresaId = null;
  let empresaEvolutionUrl = null;
  let empresaEvolutionKey = null;
  let empresaNome = null;

  // 🔥 LOG: Buscando empresa pela instância
  console.log(`🔍 Buscando empresa com evolution_instance_name = "${instanceFinal}"...`);

  // Buscar empresa que possui esta instância configurada (com cache para evitar rate limit)
  try {
    const emp = await buscarEmpresaPorInstancia(base44, instanceFinal);
    if (emp) {
      empresaId = emp.id;
      empresaEvolutionUrl = emp.evolution_url || Deno.env.get('EVOLUTION_API_URL');
      empresaEvolutionKey = emp.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
      empresaNome = emp.nome;
      console.log(`✅ EMPRESA ENCONTRADA: id="${empresaId}" | nome="${empresaNome}" | instance="${instanceFinal}"`);
    } else {
      console.error(`❌ ERRO: Nenhuma empresa encontrada para instância "${instanceFinal}"`);
      await registrarLog(base44, null, 'erro', {
        status: 'erro',
        erro: `Instância "${instanceFinal}" não pertence a nenhuma empresa`,
        instancia: instanceFinal
      });
      return;
    }
  } catch (e) {
    console.error(`❌ Erro ao buscar empresa por instância: ${e.message}`);
    await registrarLog(base44, null, 'erro', {
      status: 'erro',
      erro: `Erro ao buscar empresa: ${e.message}`,
      instancia: instanceFinal
    });
    return;
  }

  // Tipo de conexão: empresa (instância da empresa) ou usuario (instância pessoal do colaborador)
  const tipoConexao = 'empresa';
  const colaboradorId = '';
  const clienteId = '';

  // Para grupos: usar o JID completo como identificador
  if (isGrupo) {
    const grupoJid = remoteJidOriginal; // ex: 120363xxxx@g.us
    const pushNameGrupo = msgData.pushName || msgData.senderName || pushName || 'Grupo';

    // Buscar ou criar conversa do grupo
    let conversaGrupo = null;
    const convsGrupo = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      whatsapp_id: grupoJid
    }, '-data_ultima_mensagem', 1);

    // Extrair conteúdo da mensagem do grupo
    let tipoG = 'texto', conteudoG = '', arquivoUrlG = '';
    if (message.conversation) conteudoG = message.conversation;
    else if (message.extendedTextMessage?.text) conteudoG = message.extendedTextMessage.text;
    else if (message.imageMessage) { tipoG = 'imagem'; conteudoG = message.imageMessage.caption || 'Imagem'; arquivoUrlG = message.imageMessage.url || ''; }
    else if (message.audioMessage || message.pttMessage) { tipoG = 'audio'; conteudoG = 'Áudio'; }
    else if (message.videoMessage) { tipoG = 'video'; conteudoG = message.videoMessage.caption || 'Vídeo'; }
    else if (message.documentMessage) { tipoG = 'pdf'; conteudoG = message.documentMessage.title || 'Documento'; }
    else conteudoG = JSON.stringify(message).substring(0, 200);

    if (convsGrupo.length > 0) {
      conversaGrupo = convsGrupo[0];

      // ⛔ Grupo bloqueado — ignorar mensagem
      if (conversaGrupo.bloqueado === true || conversaGrupo.bloqueado === 'true') {
        console.log(`⛔ Grupo bloqueado ignorado: ${grupoJid}`);
        return;
      }

      const grupoEhMetaOficial = conversaGrupo.tipo_conexao === 'meta_oficial' || conversaGrupo.instancia === 'META_OFICIAL';
      const grupoUpdateData = {
        ultima_mensagem: conteudoG.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        status: 'ativa',
        ultimo_remetente: fromMe ? 'vendedor' : 'cliente',
      };
      if (!grupoEhMetaOficial) {
        grupoUpdateData.instancia = instanceFinal;
        grupoUpdateData.tipo_conexao = 'empresa';
      }
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaGrupo.id, grupoUpdateData);
    } else {
      // Buscar nome do grupo via Evolution
      let nomeGrupo = pushNameGrupo;
      try {
        const evolutionUrl = empresaEvolutionUrl?.replace(/\/$/, '');
        const evolutionKey = empresaEvolutionKey;
        const evolutionInstance = instanceFinal || Deno.env.get('EVOLUTION_INSTANCE_NAME');
        if (evolutionUrl && evolutionKey && evolutionInstance) {
          const resGrupo = await fetch(`${evolutionUrl}/group/findGroupInfos/${evolutionInstance}?groupJid=${grupoJid}`, {
            headers: { 'apikey': evolutionKey }
          });
          if (resGrupo.ok) {
            const dadosGrupo = await resGrupo.json();
            nomeGrupo = dadosGrupo?.subject || dadosGrupo?.name || nomeGrupo;
          }
        }
      } catch (_) {}

      // Buscar foto do grupo via Evolution
      let fotoGrupo = null;
      try {
        const evolutionUrl = empresaEvolutionUrl?.replace(/\/$/, '');
        const evolutionKey = empresaEvolutionKey;
        const evolutionInstance = instanceFinal || Deno.env.get('EVOLUTION_INSTANCE_NAME');
        if (evolutionUrl && evolutionKey && evolutionInstance) {
          const resFoto = await fetch(`${evolutionUrl}/group/findGroupInfos/${evolutionInstance}?groupJid=${grupoJid}`, {
            headers: { 'apikey': evolutionKey }
          });
          if (resFoto.ok) {
            const dadosFoto = await resFoto.json();
            fotoGrupo = dadosFoto?.pictureUrl || dadosFoto?.profilePictureUrl || null;
            if (!nomeGrupo || nomeGrupo === pushNameGrupo) {
              nomeGrupo = dadosFoto?.subject || dadosFoto?.name || nomeGrupo;
            }
          }
        }
      } catch (_) {}

      conversaGrupo = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: '',
        cliente_nome: nomeGrupo,
        cliente_telefone: grupoJid,
        whatsapp_id: grupoJid,
        foto_url: fotoGrupo || null,
        status: 'ativa',
        ultimo_remetente: fromMe ? 'vendedor' : 'cliente',
        ultima_mensagem: conteudoG.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        tipo_conexao: 'empresa',
        colaborador_id: '',
        instancia: instanceFinal
      });
      console.log(`✅ Conversa de GRUPO criada: ${conversaGrupo.id} | JID: ${grupoJid}`);
    }

    // Salvar mensagem do grupo
    // Determinar nome do remetente: para mensagens de outros participantes, usar participant JID ou pushName
    const participantJid = key.participant || msgData.participant || '';
    const participantNumero = participantJid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
    const remetenteNomeGrupo = fromMe
      ? (msgData.pushName || 'Você')
      : (msgData.pushName || msgData.senderName || (participantNumero ? `+${participantNumero}` : 'Participante'));

    const existentesGrupo = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ whatsapp_message_id: messageId });
    if (existentesGrupo.length === 0) {
      await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversaGrupo.id, empresa_id: empresaId,
        remetente: fromMe ? 'vendedor' : 'cliente',
        remetente_nome: remetenteNomeGrupo,
        tipo_conteudo: tipoG, texto: conteudoG,
        arquivo_url: arquivoUrlG || null,
        whatsapp_message_id: messageId,
        data_envio: new Date().toISOString(),
        status: fromMe ? 'enviada' : 'pendente'
      });
      console.log(`✅ Mensagem de GRUPO salva | conversa: ${conversaGrupo.id}`);
    }
    return;
  }

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
        const evolutionUrl = empresaEvolutionUrl;
        const evolutionKey = empresaEvolutionKey;
        const evolutionInstance = instanceFinal || Deno.env.get('EVOLUTION_INSTANCE_NAME');
        if (evolutionUrl && evolutionKey && evolutionInstance) {
          telefoneLimpo = await resolverLidParaTelefone(
            remoteJidOriginal,
            evolutionUrl.replace(/\/$/, ''),
            evolutionKey,
            evolutionInstance
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
        // @lid não resolvido → usar LID numérico como identificador temporário
        // Assim a conversa aparece no CRM em vez de ser descartada
        telefoneLimpo = `lid_${lidNumerico}`;
        console.warn(`⚠️ @lid não resolvido: "${remoteJidOriginal}" (${pushName}) — usando identificador temporário: ${telefoneLimpo}`);
      }
    }
  }

  // Permitir identificadores lid_ temporários (criados quando @lid não resolve)
  if (!telefoneLimpo || (!validarTelefone(telefoneLimpo) && !telefoneLimpo.startsWith('lid_'))) {
    console.warn(`⚠️ Número inválido: remoteJid="${remoteJidOriginal}" | tel="${telefoneLimpo}" | pushName="${pushName}" — ignorado`);
    return;
  }

  console.log(`📞 Tel: ${telefoneLimpo} | msgId: ${messageId}`);

  // Variações do telefone (sempre buscar nas duas formas: com e sem o 9)
  const telefonesVariacoes = [telefoneLimpo];
  if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
    // 12 dígitos → adicionar variação com 9
    telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
  } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
    // 13 dígitos → adicionar variação sem 9
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
  else if (message.secretEncryptedMessage || message.encPayload || message.senderKeyDistributionMessage || message.protocolMessage) {
    // Mensagens internas/técnicas do WhatsApp — ignorar silenciosamente
    console.log(`⏭️ Mensagem técnica interna ignorada: ${Object.keys(message).join(', ')}`);
    return;
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

  // Buscar conversa por telefone e suas variações (12 ou 13 dígitos)
  let conversa = null;
  for (const tel of telefonesVariacoes) {
    const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: tel
    }, '-data_ultima_mensagem', 1);
    if (convs.length > 0) {
      conversa = convs[0];
      break;
    }
  }

  const ultimoRemetente = fromMe ? 'vendedor' : 'cliente';

  if (conversa) {
    // Atualizar conversa existente — SEMPRE com número normalizado (12 dígitos)
    // tipo_conexao registra a última origem recebida
    // canal_atendimento é o canal fixo de resposta — só definido na criação ou manualmente
    const canalAtual = conversa.canal_atendimento || conversa.canal_preferencial || null;

    // Se a conversa já é Meta Oficial ou Instagram, NÃO mudar tipo_conexao via webhook Evolution
    const conversaEhMetaOficial = 
      conversa.tipo_conexao === 'meta_oficial' || 
      conversa.instancia === 'META_OFICIAL' ||
      conversa.canal_atendimento === 'meta_oficial' ||
      conversa.canal_preferencial === 'meta_oficial';

    const conversaEhInstagram = 
      conversa.tipo_conexao === 'instagram' || 
      conversa.instancia === 'INSTAGRAM';

    const conversaDevePreservarCanal = conversaEhMetaOficial || conversaEhInstagram;

    if (conversaDevePreservarCanal) {
      console.log(`🛡️ Conversa protegida (canal: ${conversa.tipo_conexao} / instancia: ${conversa.instancia}) — ignorando webhook Evolution que mudaria o canal`);
    }

    const updateData = {
      ultima_mensagem: conteudo.substring(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      status: 'ativa',
      ultimo_remetente: ultimoRemetente,
      colaborador_id: colaboradorId || conversa.colaborador_id || '',
      cliente_id: clienteId || conversa.cliente_id || '',
      cliente_nome: conversa.cliente_nome || pushName || telefoneLimpo,
      cliente_telefone: telefoneLimpo,
      whatsapp_id: conversa.whatsapp_id || (telefoneLimpo + '@s.whatsapp.net'),
      // Preservar canal/instância se for Meta Oficial ou Instagram
      instancia: conversaDevePreservarCanal ? conversa.instancia : instanceFinal,
      tipo_conexao: conversaDevePreservarCanal ? conversa.tipo_conexao : 'empresa',
      ultima_origem_recebida: conversaDevePreservarCanal ? conversa.ultima_origem_recebida : 'evolution',
    };

    // Só define canal se a conversa NÃO é Meta/Instagram e ainda não tem canal travado
    if (!conversaDevePreservarCanal) {
      if (!canalAtual) {
        updateData.canal_atendimento = 'evolution';
        updateData.canal_preferencial = 'evolution';
      }
    }

    // Se a mensagem foi enviada pelo vendedor (fora do CRM), marcar como em atendimento por 10 min
    if (fromMe) {
      const expira = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      updateData.responsavel_expira_em = expira;
      // Manter responsavel_id existente se já houver, senão deixar sem (não temos user aqui)
      if (!conversa.responsavel_id) {
        updateData.responsavel_id = 'externo'; // sinaliza que foi respondido externamente
        updateData.responsavel_nome = pushName || 'Atendente';
      }
      console.log(`📤 Mensagem enviada externamente — conversa marcada como Em Atendimento por 10min`);

      // Zerar contagem de não lidas: marcar todas as mensagens do cliente como lidas
      try {
        const naoLidas = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
          conversa_id: conversa.id,
          remetente: 'cliente',
          status: 'pendente'
        }, null, 200);
        for (const msg of naoLidas) {
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
            status: 'lida',
            lida_em: new Date().toISOString()
          });
        }
        if (naoLidas.length > 0) {
          console.log(`✅ ${naoLidas.length} mensagem(ns) do cliente marcadas como lidas (resposta externa)`);
        }
      } catch (e) {
        console.warn(`⚠️ Erro ao zerar não lidas: ${e.message}`);
      }
    }

    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, updateData);
  } else {
    // Criar conversa APENAS com número normalizado (NUNCA @lid)
    const novaConversaData = {
      empresa_id: empresaId, cliente_id: clienteId,
      cliente_nome: pushName || telefoneLimpo, 
      cliente_telefone: telefoneLimpo,
      whatsapp_id: `${telefoneLimpo}@s.whatsapp.net`,
      status: 'ativa',
      ultimo_remetente: ultimoRemetente,
      ultima_mensagem: conteudo.substring(0, 200),
      data_ultima_mensagem: new Date().toISOString(),
      tipo_conexao: tipoConexao, 
      colaborador_id: colaboradorId || '',
      instancia: instanceFinal
    };
    if (fromMe) {
      novaConversaData.responsavel_expira_em = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      novaConversaData.responsavel_id = 'externo';
      novaConversaData.responsavel_nome = pushName || 'Atendente';
    }
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create(novaConversaData);
    console.log(`✅ Conversa criada: ${conversa.id} | Tel: ${telefoneLimpo}`);
  }

  // Upsert ContatoWhatsapp — garantir que existe com nome e foto
  // Buscar contato existente por qualquer variação do telefone
  let contatoExistente = null;
  for (const tel of telefonesVariacoes) {
    const found = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId, telefone: tel }, '-created_date', 1
    );
    if (found.length > 0) { contatoExistente = found[0]; break; }
  }

  // Tentar buscar foto de perfil da Evolution (com timeout de 3s) e fazer upload permanente
  let fotoUrlPermanente = contatoExistente?.foto_url || null;
  let fotoUrlTemporaria = null;
  try {
    const evolutionUrl = empresaEvolutionUrl;
    const evolutionKey = empresaEvolutionKey;
    const evolutionInstance = instanceFinal || Deno.env.get('EVOLUTION_INSTANCE_NAME');
    if (evolutionUrl && evolutionKey && evolutionInstance && !contatoExistente?.foto_url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resProfile = await fetch(`${evolutionUrl.replace(/\/$/, '')}/chat/fetchProfile/${evolutionInstance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telefoneLimpo }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (resProfile.ok) {
        const profileData = await resProfile.json();
        fotoUrlTemporaria = profileData?.profilePictureUrl || profileData?.picture || profileData?.pictureUrl;
        if (fotoUrlTemporaria && fotoUrlTemporaria.trim().length > 0) {
          // Fazer download e upload permanente
          const fotoRes = await fetch(fotoUrlTemporaria);
          if (fotoRes.ok) {
            const arrayBuffer = await fotoRes.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
            const file = new File([blob], `foto_${telefoneLimpo}.jpg`, { type: 'image/jpeg' });
            const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });
            if (uploadRes?.file_url) {
              fotoUrlPermanente = uploadRes.file_url;
              console.log(`✅ Foto upload permanente: ${uploadRes.file_url}`);
            }
          }
        }
      }
    }
  } catch (e) { console.warn('⚠️ Erro ao buscar foto:', e.message); }

  if (contatoExistente) {
    const updates = { ultima_atualizacao: new Date().toISOString() };
    // Só atualizar nome se não foi fixado manualmente pelo usuário
    if (!contatoExistente.nome_fixo && !contatoExistente.nome && pushName) updates.nome = pushName;
    if (fotoUrlPermanente && fotoUrlPermanente !== contatoExistente.foto_url) updates.foto_url = fotoUrlPermanente;
    base44.asServiceRole.entities.ContatoWhatsapp.update(contatoExistente.id, updates).catch(() => {});
  } else if (!fromMe) {
    base44.asServiceRole.entities.ContatoWhatsapp.create({
      empresa_id: empresaId,
      telefone: telefoneLimpo,
      nome: pushName || telefoneLimpo,
      foto_url: fotoUrlPermanente || null,
      ultima_atualizacao: new Date().toISOString()
    }).catch(() => {});
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
    status: remetente === 'vendedor' ? 'enviada' : 'pendente'
  });

  console.log(`✅ Mensagem salva: ${novaMensagem.id} | remetente: ${remetente}`);

  // NÃO enviar confirmação automática de leitura (deixar para o usuário fazer manualmente)
  // A Evolution API naturalmente envia "entregue" quando a mensagem chega no telefone

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
  console.log(`📦 Body: ${rawBody.length} bytes | preview: ${rawBody.substring(0, 300)}`);

  // Criar client com service role para webhooks externos (sem token de usuário)
  const base44 = createClientFromRequest(req);

  // ⚡ Responder 200 IMEDIATAMENTE para evitar timeout da Evolution
  // Processar em background após responder
  const response = Response.json({ success: true, received: true });

  // Processar em background (não bloqueia a resposta)
  processarWebhook(req, rawBody, base44).catch((error) => {
    console.error('❌ Erro ao processar:', error.message);
    console.error('❌ STACK:', error.stack);
  });

  return response;
});
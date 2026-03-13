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

// Tenta decodificar base64 → JSON (suporta UTF-8)
function decodeBase64JSON(str) {
  try {
    if (!str || typeof str !== 'string') return null;
    const clean = str.trim();
    // Verificar se parece base64
    if (clean.length < 4) return null;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(clean)) return null;
    
    // Método 1: atob + TextDecoder (correto para UTF-8)
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

// Normaliza o payload para o formato padrão { event, instance, data }
function normalizarPayload(rawBody) {
  let parsed = null;

  // 1) Tentar JSON direto
  try {
    parsed = JSON.parse(rawBody);
    console.log('✅ Parseado como JSON direto. Keys:', Object.keys(parsed).join(', '));
  } catch (_) {}

  // 2) Se não é JSON, tentar base64 do body inteiro
  if (!parsed) {
    parsed = decodeBase64JSON(rawBody);
    if (parsed) console.log('✅ Body decodificado como base64. Keys:', Object.keys(parsed).join(', '));
  }

  if (!parsed) return null;

  // ── Formato Evolution com webhookBase64=true ──
  // O body JSON tem { event, instance, data: "base64string" }
  // Onde "data" é o payload real em base64
  if (parsed.event && typeof parsed.data === 'string' && parsed.data.length > 0) {
    const decodedData = decodeBase64JSON(parsed.data);
    if (decodedData) {
      console.log('✅ payload.data decodificado de base64. Keys:', Object.keys(decodedData).join(', '));
      parsed.data = decodedData;
    } else {
      // Tentar parse JSON direto da string
      try {
        parsed.data = JSON.parse(parsed.data);
        console.log('✅ payload.data parseado como JSON string');
      } catch (_) {}
    }
  }

  // ── Unwrap wrapper externo: { data: { event, instance, data } } ──
  if (!parsed.event && parsed.data && parsed.data.event) {
    console.log('🔄 Unwrapped wrapper externo');
    parsed = parsed.data;
    // Verificar novamente se data interna é base64
    if (parsed.event && typeof parsed.data === 'string' && parsed.data.length > 0) {
      const decodedData = decodeBase64JSON(parsed.data);
      if (decodedData) {
        parsed.data = decodedData;
        console.log('✅ payload.data decodificado após unwrap');
      }
    }
  }

  return parsed;
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  console.log('='.repeat(60));
  console.log(`📥 WEBHOOK - ${timestamp} | ${req.method}`);

  // Verificação GET
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge') || 'OK';
    return new Response(challenge, { status: 200 });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não suportado' }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const instanceFromQuery = url.searchParams.get('instance') || '';

    const rawBody = await req.text();
    console.log(`📦 Body: ${rawBody.length} bytes | Preview: ${rawBody.substring(0, 200)}`);

    const payload = normalizarPayload(rawBody);

    if (!payload) {
      console.error('❌ Não foi possível parsear o body');
      return Response.json({ error: 'Body inválido' }, { status: 400 });
    }

    // Normalizar event: aceitar maiúsculas, pontos e underscores
    const event = (payload.event || '').toLowerCase().replace(/\./g, '_');
    const instancePayload = payload.instance || '';
    const instanceFinal = instanceFromQuery || instancePayload || '';

    console.log(`📋 Event: "${event}" | Instance: "${instanceFinal}"`);

    const data = payload.data || {};
    if (typeof data === 'object') {
      console.log(`📋 Data keys: ${Object.keys(data).join(', ')}`);
    }

    // ─── ACK / status update ──────────────────────────────────────────────────
    if (['messages_update', 'message_ack', 'messages_ack'].includes(event)) {
      const base44 = createClientFromRequest(req);
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
      return Response.json({ success: true, handled: 'ack' });
    }

    // ─── Somente messages_upsert ──────────────────────────────────────────────
    const isUpsert = ['messages_upsert', 'messages'].includes(event);
    if (!isUpsert) {
      console.log(`⏭️ Evento ignorado: "${event}"`);
      return Response.json({ success: true, skipped: event });
    }

    // ─── Extrair dados da mensagem ────────────────────────────────────────────
    // Evolution pode mandar como array ou objeto único
    const msgData = Array.isArray(data) ? data[0] : data;

    const key = msgData.key || {};
    const message = msgData.message || {};
    const pushName = msgData.pushName || msgData.senderName || 'Cliente';
    const fromMe = key.fromMe === true;
    const remoteJidRaw = key.remoteJid || '';
    const messageId = key.id || `gen_${Date.now()}`;

    // Resolver telefone (IGNORAR @lid completamente)
    let telefone = null;
    console.log(`📞 remoteJidRaw: ${remoteJidRaw}`);
    console.log(`📞 remoteJidAlt: ${msgData.remoteJidAlt || 'não informado'}`);
    console.log(`📞 participant: ${msgData.participant || 'não informado'}`);
    
    // Prioridade: participant > remoteJidAlt > remoteJidRaw
    // NUNCA aceitar @lid como telefone válido
    if (msgData.participant && !msgData.participant.includes('@lid')) {
      telefone = msgData.participant;
      console.log(`✅ Usando participant: ${telefone}`);
    } else if (msgData.remoteJidAlt && !msgData.remoteJidAlt.includes('@lid')) {
      telefone = msgData.remoteJidAlt;
      console.log(`✅ Usando remoteJidAlt: ${telefone}`);
    } else if (remoteJidRaw && !remoteJidRaw.includes('@lid')) {
      telefone = remoteJidRaw;
      console.log(`✅ Usando remoteJidRaw: ${telefone}`);
    }
    
    // REJEITAR se não conseguiu resolver um número válido
    if (!telefone) {
      console.error(`❌ REJEIÇÃO: Não conseguiu resolver telefone válido (sem @lid). Dados: remoteJid=${remoteJidRaw}, participant=${msgData.participant}, remoteJidAlt=${msgData.remoteJidAlt}`);
      return Response.json({ 
        success: false, 
        error: 'Cannot resolve valid phone number (no @lid allowed)',
        debug: { remoteJidRaw, participant: msgData.participant, remoteJidAlt: msgData.remoteJidAlt }
      }, { status: 400 });
    }

    console.log(`📞 Telefone final: ${telefone} | fromMe: ${fromMe} | msgId: ${messageId}`);

    if (!telefone || !messageId) {
      console.error('❌ Dados insuficientes - sem telefone ou messageId');
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
    if (message.conversation) {
      conteudo = message.conversation;
    } else if (message.extendedTextMessage?.text) {
      conteudo = message.extendedTextMessage.text;
    } else if (message.imageMessage) {
      tipo = 'imagem'; conteudo = message.imageMessage.caption || 'Imagem';
    } else if (message.audioMessage || message.pttMessage) {
      tipo = 'audio'; conteudo = 'Áudio';
    } else if (message.videoMessage) {
      tipo = 'video'; conteudo = message.videoMessage.caption || 'Vídeo';
    } else if (message.documentMessage) {
      tipo = 'pdf'; conteudo = message.documentMessage.title || 'Documento';
    } else if (message.stickerMessage) {
      tipo = 'imagem'; conteudo = 'Sticker';
    } else {
      conteudo = JSON.stringify(message).substring(0, 200);
    }

    console.log(`📝 Tipo: ${tipo} | Conteúdo: "${conteudo.substring(0, 100)}"`);

    // Limpar telefone: remover suffixes @s.whatsapp.net, @c.us e manter apenas números
    let telefoneLimpo = telefone
      .replace(/@s\.whatsapp\.net/g, '')
      .replace(/@c\.us/g, '')
      .replace(/\D/g, '');

    // Validar telefone (deve ter entre 10 e 15 dígitos)
    if (!telefoneLimpo || telefoneLimpo.length < 10 || telefoneLimpo.length > 15) {
      console.error(`❌ Telefone inválido após limpeza: "${telefoneLimpo}" (original: "${telefone}")`);
      return Response.json({ success: false, error: 'Invalid phone number' }, { status: 400 });
    }

    // BLOQUEAR números duplicados/falsos conhecidos - MÚLTIPLAS VARIAÇÕES
    const numerosBlockeados = [
      '123248767422595',  // Original duplicado
      '12324876742259',   // Variação
      '123248767422',     // Variação curta
      '55123248767422595', // Com código país
      '55123248767422',   // Com código país curto
    ];
    
    // Verificar bloqueio
    if (numerosBlockeados.includes(telefoneLimpo) || numerosBlockeados.some(num => telefoneLimpo.includes(num))) {
      console.error(`❌ REJEIÇÃO TOTAL: Número bloqueado (duplicado/falso): "${telefoneLimpo}"`);
      await registrarLog(base44, JD_ID, 'erro_webhook', {
        status: 'erro',
        erro: `Número bloqueado (duplicado detectado): ${telefoneLimpo}`,
        instancia: instanceFinal || 'desconhecida'
      });
      return Response.json({ success: false, error: 'Phone number is blocked (duplicate/fake ID)' }, { status: 400 });
    }

    // Rejeitar números suspeitos que parecem IDs de banco de dados (15 dígitos sem 55 no início)
    if (/^\d{15}$/.test(telefoneLimpo) && !telefoneLimpo.startsWith('55')) {
      console.error(`❌ REJEIÇÃO TOTAL: Número suspeito (parece ID): "${telefoneLimpo}"`);
      await registrarLog(base44, JD_ID, 'erro_webhook', {
        status: 'erro',
        erro: `Número suspeito (banco de dados ID): ${telefoneLimpo}`,
        instancia: instanceFinal || 'desconhecida'
      });
      return Response.json({ success: false, error: 'Suspicious phone number (database ID)' }, { status: 400 });
    }

    // Variações do telefone (com/sem 9º dígito BR)
    const telefonesVariacoes = [telefoneLimpo];
    if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
      // Número sem 9º dígito: 5587991426333 → 558799914226333 (com 9)
      telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
    } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
      // Número com 9º dígito: 558799914226333 → 5587991426333 (sem 9)
      telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5));
    }
    console.log(`📞 Tel limpo: ${telefoneLimpo} | Variações: ${telefonesVariacoes.join(', ')}`);

    // ─── Inicializar base44 ───────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';
    let empresaId = JD_ID;
    let colaboradorId = null;
    let tipoConexao = 'empresa';

    // ─── Identificar empresa pela instância ──────────────────────────────────
    if (instanceFinal) {
      try {
        const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
          { evolution_instance_name: instanceFinal }
        );
        if (colaboradores?.length > 0) {
          const colab = colaboradores[0];
          tipoConexao = 'usuario';
          colaboradorId = colab.id;
          empresaId = colab.empresa_id || JD_ID;
          console.log(`✅ Instância colaborador: ${colab.nome} (empresa: ${empresaId})`);
        } else {
          const empresas = await base44.asServiceRole.entities.Empresa.filter(
            { evolution_instance_name: instanceFinal }
          );
          if (empresas?.length > 0) {
            empresaId = empresas[0].id;
            console.log(`✅ Instância empresa: ${empresas[0].nome}`);
          } else {
            console.warn(`⚠️ Instância "${instanceFinal}" não encontrada, usando JD padrão`);
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
      let contatoEncontrado = null;
      for (const tel of telefonesVariacoes) {
        const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
          { empresa_id: empresaId, telefone: tel }
        );
        if (contatos?.length > 0) { contatoEncontrado = contatos[0]; break; }
      }
      if (contatoEncontrado) {
        contato = contatoEncontrado;
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
      for (const tel of telefonesVariacoes) {
        const clientes = await base44.asServiceRole.entities.Cliente.filter(
          { empresa_id: empresaId, celular: tel }
        );
        if (clientes?.length > 0) { clienteId = clientes[0].id; break; }
      }
      if (clienteId) console.log(`✅ Cliente encontrado: ${clienteId}`);
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar cliente: ${e.message}`);
    }

    // ─── Buscar/criar conversa ────────────────────────────────────────────────
    let conversa = null;
    let conversas = [];
    
    // PROTEGER: rejeitar se encontrar conversa com número bloqueado
    for (const numBloqueado of numerosBlockeados) {
      const convsBlockeadas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId, cliente_telefone: numBloqueado }
      );
      if (convsBlockeadas?.length > 0) {
        console.error(`❌ BLOQUEIO: Conversa com número duplicado detectada e será ignorada`);
        // Deletar conversa com número bloqueado
        for (const conv of convsBlockeadas) {
          await base44.asServiceRole.entities.ConversaWhatsapp.delete(conv.id);
        }
      }
    }
    
    // Buscar conversa com número correto
    for (const tel of telefonesVariacoes) {
      const resultado = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId, cliente_telefone: tel }
      );
      if (resultado?.length > 0) { conversas = resultado; break; }
    }

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

    console.log(`✅ Mensagem salva: ${novaMensagem.id} | empresa: ${empresaId} | remetente: ${remetente}`);

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
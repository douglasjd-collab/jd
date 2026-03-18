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
  try {
    parsed = JSON.parse(rawBody);
  } catch (_) {}

  if (!parsed) {
    parsed = decodeBase64JSON(rawBody);
  }

  if (!parsed) return null;

  if (parsed.event && typeof parsed.data === 'string' && parsed.data.length > 0) {
    const decodedData = decodeBase64JSON(parsed.data);
    if (decodedData) {
      parsed.data = decodedData;
    } else {
      try { parsed.data = JSON.parse(parsed.data); } catch (_) {}
    }
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

// ── Extrair telefone de JIDs válidos ──────────────────────────────────────
function extrairTelefoneValido(jid) {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.includes('@g.us') || jid.includes('@broadcast')) return null;
  // @lid precisa de resolução — retornar null para tratar separadamente
  if (jid.includes('@lid')) return null;
  if (!jid.includes('@s.whatsapp.net') && !jid.includes('@c.us')) return null;
  const numeros = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
  return numeros || null;
}

// ── Resolver @lid para número real via Evolution API ──────────────────────
async function resolverLidParaTelefone(lid, evolutionUrl, evolutionKey, instanceName) {
  const lidNumerico = lid.replace(/@lid/g, '').replace(/\D/g, '');

  // Estratégia 1: fetchProfile com o número lid
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
        if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
          console.log(`✅ @lid resolvido via fetchProfile: ${lid} → ${tel}`);
          return tel;
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ fetchProfile falhou:', e.message);
  }

  // Estratégia 2: buscar nas mensagens recentes pelo participant
  try {
    const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { remoteJid: lid } }, limit: 5 })
    });
    if (res.ok) {
      const data = await res.json();
      const msgs = Array.isArray(data) ? data : (data.messages?.records || data.messages || []);
      for (const m of msgs) {
        const participantJid = m.key?.participant || '';
        if (participantJid.includes('@s.whatsapp.net')) {
          const tel = participantJid.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
          if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
            console.log(`✅ @lid resolvido via participant: ${tel}`);
            return tel;
          }
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ findMessages falhou:', e.message);
  }

  // Estratégia 3: buscar contatos
  try {
    const res2 = await fetch(`${evolutionUrl}/chat/findContacts/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {} })
    });
    if (res2.ok) {
      const data2 = await res2.json();
      const contatos = Array.isArray(data2) ? data2 : (data2.contacts || data2.records || []);
      for (const c of contatos) {
        const cId = c.id || c.remoteJid || '';
        if (cId === lid) {
          const fontes = [c.phone, c.phoneNumber, c.number];
          for (const f of fontes) {
            if (!f) continue;
            const tel = String(f).replace(/\D/g, '');
            if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
          }
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ findContacts falhou:', e.message);
  }

  return null;
}

// Validar se um número de telefone parece legítimo (apenas BR: 55 + DDD + numero = 12 ou 13 dígitos)
function validarTelefone(num) {
  if (!num) return false;
  // Aceitar apenas números brasileiros: começa com 55, total 12 ou 13 dígitos
  if (!num.startsWith('55')) return false;
  if (num.length !== 12 && num.length !== 13) return false;
  // Rejeitar repetições óbvias
  if (/^(\d)\1{9,}$/.test(num)) return false;
  return true;
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  console.log('='.repeat(60));
  console.log(`📥 WEBHOOK - ${timestamp} | ${req.method}`);

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
    const msgData = Array.isArray(data) ? data[0] : data;
    const key = msgData.key || {};
    const message = msgData.message || {};
    const pushName = msgData.pushName || msgData.senderName || 'Cliente';
    const fromMe = key.fromMe === true;
    // Usar remoteJidAlt se o remoteJid for @lid (Evolution já fornece o número real)
    const remoteJidRaw = (key.remoteJid || '').includes('@lid') && key.remoteJidAlt
      ? key.remoteJidAlt
      : (key.remoteJid || '');
    const remoteJidOriginal = key.remoteJid || '';
    const messageId = key.id || `gen_${Date.now()}`;
    if (remoteJidOriginal.includes('@lid') && key.remoteJidAlt) {
      console.log(`🔄 @lid resolvido via remoteJidAlt: ${remoteJidOriginal} → ${key.remoteJidAlt}`);
    }

    console.log(`📞 remoteJid: ${remoteJidRaw} | fromMe: ${fromMe} | participant: ${key.participant || 'N/A'}`);

    // ── Bloqueio imediato de qualquer JID lid_ ou @lid sem resolução ──────────
    const remoteJidOriginalRaw = key.remoteJid || '';
    if (remoteJidOriginalRaw.includes('@lid') || remoteJidOriginalRaw.startsWith('lid_') || remoteJidRaw.startsWith('lid_')) {
      // Só prosseguir se remoteJidAlt forneceu um JID válido (@s.whatsapp.net)
      if (!remoteJidRaw.includes('@s.whatsapp.net') && !remoteJidRaw.includes('@c.us')) {
        console.warn(`⚠️ JID lid_ sem resolução direta: "${remoteJidOriginalRaw}" — ignorado`);
        return Response.json({ success: true, skipped: 'lid_no_alt' });
      }
    }

    console.log(`📤 fromMe: ${fromMe} — processando normalmente (dedup por messageId garante sem duplicata)`);


    // ── Inicializar SDK aqui para poder usar na resolução de @lid ────────────
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';
    let empresaId = JD_ID;
    let colaboradorId = null;
    let tipoConexao = 'empresa';

    // ── Resolver telefone com lógica estrita ──────────────────────────────────
    // 1. Rejeitar grupos imediatamente
    if (remoteJidRaw.includes('@g.us')) {
      console.log('⏭️ Grupo ignorado');
      return Response.json({ success: true, skipped: 'group' });
    }

    // 2. Extrair telefone SOMENTE de JIDs válidos (@s.whatsapp.net, @c.us ou @lid resolvido)
    let telefoneLimpo = extrairTelefoneValido(remoteJidRaw);

    if (!telefoneLimpo) {
      // Se for @lid, tentar resolver para número real
      if (remoteJidRaw.includes('@lid')) {
        const lidNumerico = remoteJidRaw.replace(/@lid/g, '').replace(/\D/g, '');
        console.log(`🔍 @lid detectado: "${remoteJidRaw}" (lidNumerico: ${lidNumerico}) — buscando no banco...`);

        // Estratégia 1: buscar ContatoWhatsapp com lid_jid cadastrado
        try {
          const contatosLid = await base44.asServiceRole.entities.ContatoWhatsapp.filter({
            empresa_id: empresaId, lid_jid: lidNumerico
          });
          if (contatosLid.length > 0) {
            telefoneLimpo = contatosLid[0].telefone;
            console.log(`✅ @lid resolvido via ContatoWhatsapp: ${remoteJidRaw} → ${telefoneLimpo}`);
          }
        } catch (e) {
          console.warn('⚠️ Erro ao buscar contato por lid_jid:', e.message);
        }

        // Estratégia 2: via Evolution API (fetchProfile, findMessages, findContacts)
        if (!telefoneLimpo) {
          try {
            const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
            const empresa = empresas?.[0];
            if (empresa?.evolution_url && empresa?.evolution_api_key) {
              const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
              const resolvedTel = await resolverLidParaTelefone(
                remoteJidRaw, evolutionUrl, empresa.evolution_api_key, empresa.evolution_instance_name
              );
              if (resolvedTel) {
                console.log(`✅ @lid resolvido via Evolution API: ${remoteJidRaw} → ${resolvedTel}`);
                telefoneLimpo = resolvedTel;
                // Salvar mapeamento para uso futuro
                try {
                  await base44.asServiceRole.entities.ContatoWhatsapp.create({
                    empresa_id: empresaId,
                    telefone: resolvedTel,
                    nome: pushName || resolvedTel,
                    lid_jid: lidNumerico,
                    ultima_atualizacao: new Date().toISOString()
                  });
                  console.log(`💾 Mapeamento lid→telefone salvo: ${lidNumerico} → ${resolvedTel}`);
                } catch (_) {}
              }
            }
          } catch (e) {
            console.warn('⚠️ Erro ao tentar resolver @lid via Evolution:', e.message);
          }
        }
      }

      if (!telefoneLimpo) {
        console.warn(`⚠️ @lid não resolvível: "${remoteJidRaw}" (pushName: ${pushName}) — mensagem ignorada`);
        return Response.json({ success: true, skipped: 'unresolvable_lid' });
      }
    }

    // 3. Bloquear definitivamente qualquer lid_ que tenha escapado (apenas prefixo lid_)
    if (telefoneLimpo.startsWith('lid_')) {
      console.error(`❌ BLOQUEIO DEFINITIVO: telefone lid_ não permitido: "${telefoneLimpo}"`);
      return Response.json({ success: true, skipped: 'blocked_lid' });
    }

    // 4. Validar que o número parece um telefone real
    if (!validarTelefone(telefoneLimpo)) {
      console.error(`❌ REJEIÇÃO: Número não parece telefone válido: "${telefoneLimpo}"`);
      return Response.json({ success: false, error: 'Invalid phone number format' }, { status: 400 });
    }

    console.log(`📞 Tel limpo: ${telefoneLimpo} | msgId: ${messageId}`);

    if (!messageId) {
      return Response.json({ success: false, error: 'Missing messageId' }, { status: 400 });
    }

    // Variações do telefone (com/sem 9º dígito BR)
    const telefonesVariacoes = [telefoneLimpo];
    if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
      telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
    } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
      telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5));
    }
    console.log(`📞 Variações: ${telefonesVariacoes.join(', ')}`);

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

    // ─── Inicializar SDK (já feito acima) ─────────────────────────────────────

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

    // ─── Verificar duplicata de mensagem ─────────────────────────────────────
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { whatsapp_message_id: messageId }
    );
    if (existentes.length > 0) {
      console.log('⏭️ Duplicata de mensagem ignorada:', messageId);
      return Response.json({ success: true, skipped: 'duplicate' });
    }

    // ─── Buscar/criar contato ─────────────────────────────────────────────────
    try {
      let contatoEncontrado = null;
      for (const tel of telefonesVariacoes) {
        const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
          { empresa_id: empresaId, telefone: tel }
        );
        if (contatos?.length > 0) { contatoEncontrado = contatos[0]; break; }
      }
      if (!contatoEncontrado) {
        await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: '',
          telefone: telefoneLimpo,
          nome: pushName || 'Cliente WhatsApp',
          ultima_atualizacao: new Date().toISOString()
        });
        console.log(`✅ Contato criado: ${telefoneLimpo}`);
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
    // Buscar conversa existente para qualquer variação do telefone
    let conversa = null;
    let conversas = [];

    for (const tel of telefonesVariacoes) {
      const resultado = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId, cliente_telefone: tel }
      );
      if (resultado?.length > 0) {
        // Se encontrou múltiplas, usar a mais recente e deletar duplicatas
        if (resultado.length > 1) {
          console.warn(`⚠️ ${resultado.length} conversas duplicadas para ${tel}. Limpando...`);
          resultado.sort((a, b) => new Date(b.data_ultima_mensagem || b.created_date) - new Date(a.data_ultima_mensagem || a.created_date));
          for (let i = 1; i < resultado.length; i++) {
            await base44.asServiceRole.entities.ConversaWhatsapp.delete(resultado[i].id);
            console.log(`🗑️ Conversa duplicada removida: ${resultado[i].id}`);
          }
        }
        conversas = [resultado[0]];
        break;
      }
    }

    if (conversas.length > 0) {
      conversa = conversas[0];
      // Normalizar telefone para o canônico (com 9º dígito se BR 13 dígitos)
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
      console.log(`✅ Conversa atualizada: ${conversa.id}`);
    } else {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: clienteId,
        cliente_nome: telefoneLimpo,
        cliente_telefone: telefoneLimpo,
        whatsapp_id: messageId,
        status: 'ativa',
        ultima_mensagem: conteudo.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        tipo_conexao: tipoConexao,
        colaborador_id: colaboradorId || '',
        instancia: instanceFinal
      });
      console.log(`✅ Conversa criada: ${conversa.id} | tel: ${telefoneLimpo}`);
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
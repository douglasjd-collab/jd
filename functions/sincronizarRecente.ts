// Sync LEVE — busca apenas mensagens dos últimos 2 minutos
// Chamado a cada 5s pelo frontend para tempo real quando webhook falha
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];

    if (!empresa?.evolution_url || !empresa?.evolution_api_key || !empresa?.evolution_instance_name) {
      return Response.json({ erro: 'Configuração Evolution incompleta' }, { status: 400 });
    }

    const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    // Apenas últimos 2 minutos
    const agoSeconds = Math.floor((Date.now() - (2 * 60 * 1000)) / 1000);

    const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: {
          key: { fromMe: false },
          messageTimestamp: { $gte: agoSeconds }
        },
        limit: 30
      })
    });

    if (!res.ok) {
      return Response.json({ ok: true, processadas: 0 }); // silencioso
    }

    const data = await res.json();
    const mensagens = Array.isArray(data)
      ? data
      : (data.messages?.records || data.messages || []);

    if (mensagens.length === 0) {
      return Response.json({ ok: true, processadas: 0, total: 0 });
    }

    // Filtrar mensagens válidas (não de grupos, não enviadas por nós)
    const mensagensValidas = mensagens.filter(m => {
      const key = m.key || {};
      const jid = key.remoteJid || '';
      return key.id && !key.fromMe && !jid.includes('@g.us') && !jid.includes('@broadcast');
    });

    if (mensagensValidas.length === 0) {
      return Response.json({ ok: true, processadas: 0, total: mensagens.length });
    }

    // Buscar IDs já existentes no banco em LOTE (uma única query por conversa)
    // Usamos o timestamp mínimo das mensagens para filtrar
    const minTimestamp = Math.min(...mensagensValidas.map(m => m.messageTimestamp || 0));
    const dataMinima = new Date(minTimestamp * 1000).toISOString();
    const existentesNoBanco = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { empresa_id: JD_ID, remetente: 'cliente' },
      '-data_envio',
      100
    );
    const idsExistentes = new Set(existentesNoBanco.map(m => m.whatsapp_message_id).filter(Boolean));

    // Filtrar apenas mensagens novas
    const mensagensNovas = mensagensValidas.filter(m => !idsExistentes.has(m.key?.id));
    
    if (mensagensNovas.length === 0) {
      return Response.json({ ok: true, processadas: 0, total: mensagens.length });
    }

    console.log(`🆕 ${mensagensNovas.length} mensagens novas para processar`);

    // Construir mapa @lid apenas se necessário
    const temLid = mensagensNovas.some(m => (m.key?.remoteJid || '').includes('@lid'));
    const lidToPhone = {};
    if (temLid) {
      try {
        const resContatos = await fetch(`${evolutionUrl}/chat/findContacts/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ where: {} })
        });
        if (resContatos.ok) {
          const dataContatos = await resContatos.json();
          const contatos = Array.isArray(dataContatos) ? dataContatos : (dataContatos.contacts || dataContatos.records || []);
          for (const c of contatos) {
            const lidId = c.id || c.remoteJid || '';
            if (lidId.includes('@lid')) {
              const jidReal = c.remoteJid || c.jid || '';
              if (jidReal.includes('@s.whatsapp.net')) {
                lidToPhone[lidId] = jidReal.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
              } else if (c.number) {
                lidToPhone[lidId] = String(c.number).replace(/\D/g, '');
              }
            }
          }
        }
      } catch (_) {}
    }

    let processadas = 0;

    for (const msg of mensagensNovas) {
      try {
        const key = msg.key || {};
        const message = msg.message || {};
        const pushName = msg.pushName || msg.senderName || 'Cliente';
        const remoteJidRaw = key.remoteJid || '';
        const messageId = key.id;

        // Resolver @lid
        let remoteJid = remoteJidRaw;
        if (remoteJidRaw.includes('@lid')) {
          if (lidToPhone[remoteJidRaw]) {
            remoteJid = `${lidToPhone[remoteJidRaw]}@s.whatsapp.net`;
          } else {
            // Buscar no banco ContatoWhatsapp pelo lid_jid
            const lidNumerico = remoteJidRaw.replace(/@lid/g, '').replace(/\D/g, '');
            try {
              const contatosLid = await base44.asServiceRole.entities.ContatoWhatsapp.filter({
                empresa_id: JD_ID, lid_jid: lidNumerico
              });
              if (contatosLid.length > 0 && contatosLid[0].telefone) {
                remoteJid = `${contatosLid[0].telefone}@s.whatsapp.net`;
                console.log(`✅ @lid resolvido via ContatoWhatsapp: ${remoteJidRaw} → ${contatosLid[0].telefone}`);
              } else {
                // Sem mapeamento — ignorar completamente, nunca criar com lid_
                console.warn(`⚠️ @lid não resolvível: ${remoteJidRaw} (${pushName}) — ignorado`);
                continue;
              }
            } catch (_) {
              console.warn(`⚠️ @lid não resolvível (erro banco): ${remoteJidRaw} — ignorado`);
              continue;
            }
          }
        }

        if (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@c.us')) continue;

        const telefoneLimpo = remoteJid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');

        // Aceitar SOMENTE números BR válidos: começa com 55 + DDD (2) + número (8-9) = 12 ou 13 dígitos
        if (!telefoneLimpo.startsWith('55') || (telefoneLimpo.length !== 12 && telefoneLimpo.length !== 13)) {
          console.warn(`⚠️ Número inválido ignorado: "${telefoneLimpo}"`);
          continue;
        }

        // Extrair conteúdo
        let tipo = 'texto';
        let conteudo = '';
        if (message.conversation) conteudo = message.conversation;
        else if (message.extendedTextMessage?.text) conteudo = message.extendedTextMessage.text;
        else if (message.imageMessage) { tipo = 'imagem'; conteudo = message.imageMessage.caption || 'Imagem'; }
        else if (message.audioMessage || message.pttMessage) { tipo = 'audio'; conteudo = 'Áudio'; }
        else if (message.videoMessage) { tipo = 'video'; conteudo = message.videoMessage.caption || 'Vídeo'; }
        else if (message.documentMessage) { tipo = 'pdf'; conteudo = message.documentMessage.title || 'Documento'; }
        else conteudo = JSON.stringify(message).substring(0, 100);

        // Normalizar telefone
        let telefoneNormalizado = telefoneLimpo;
        if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
          telefoneNormalizado = telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4);
        }

        const telefonesVariacoes = [telefoneNormalizado];
        if (telefoneNormalizado.startsWith('55') && telefoneNormalizado.length === 13) {
          telefonesVariacoes.push(telefoneNormalizado.slice(0, 4) + telefoneNormalizado.slice(5));
        }

        // Buscar/criar conversa
        let conversa = null;
        for (const tel of telefonesVariacoes) {
          const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
            { empresa_id: JD_ID, cliente_telefone: tel }
          );
          if (convs?.length > 0) { conversa = convs[0]; break; }
        }

        if (!conversa) {
          // Bloco final de segurança: nunca criar conversa com número inválido
          if (!telefoneNormalizado.startsWith('55') || (telefoneNormalizado.length !== 12 && telefoneNormalizado.length !== 13)) {
            console.warn(`⚠️ Bloqueado criar conversa com número inválido: "${telefoneNormalizado}"`);
            continue;
          }
          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: JD_ID,
            cliente_nome: telefoneNormalizado,
            cliente_telefone: telefoneNormalizado,
            whatsapp_id: messageId,
            status: 'ativa',
            ultima_mensagem: conteudo.substring(0, 200),
            data_ultima_mensagem: new Date().toISOString(),
            tipo_conexao: 'empresa',
            instancia: instanceName
          });
        } else {
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
            ultima_mensagem: conteudo.substring(0, 200),
            data_ultima_mensagem: new Date().toISOString(),
            status: 'ativa'
          });
        }

        const timestamp = msg.messageTimestamp
          ? new Date(msg.messageTimestamp * 1000).toISOString()
          : new Date().toISOString();

        await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: conversa.id,
          empresa_id: JD_ID,
          remetente: 'cliente',
          tipo_conteudo: tipo,
          texto: conteudo,
          whatsapp_message_id: messageId,
          data_envio: timestamp,
          status: 'entregue'
        });

        processadas++;
        console.log(`✅ Nova msg: ${messageId} | ${telefoneLimpo} | "${conteudo.substring(0, 40)}"`);

      } catch (e) {
        console.error('Erro msg:', e.message);
      }
    }

    return Response.json({ ok: true, total: mensagens.length, processadas });

  } catch (e) {
    return Response.json({ ok: false, erro: e.message }, { status: 500 });
  }
});
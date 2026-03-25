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

    // Apenas últimos 30 segundos (chamado a cada 5s)
    const agoSeconds = Math.floor((Date.now() - (30 * 1000)) / 1000);

    const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: {
          messageTimestamp: { $gte: agoSeconds }
        },
        limit: 50
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

    // Filtrar mensagens válidas (não de grupos) — incluir fromMe=true (enviadas pelo celular)
    const mensagensValidas = mensagens.filter(m => {
      const key = m.key || {};
      const jid = key.remoteJid || '';
      return key.id && !jid.includes('@g.us') && !jid.includes('@broadcast');
    });

    if (mensagensValidas.length === 0) {
      return Response.json({ ok: true, processadas: 0, total: mensagens.length });
    }

    // Buscar IDs já existentes no banco em LOTE
    const existentesNoBanco = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { empresa_id: JD_ID },
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
        const fromMe = key.fromMe === true;
        const pushName = msg.pushName || msg.senderName || (fromMe ? 'Vendedor' : 'Cliente');
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
                // Tentar fetchProfile como último recurso
                try {
                  const profileRes = await fetch(`${evolutionUrl}/contact/fetchProfile/${instanceName}`, {
                    method: 'POST',
                    headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: lidNumerico })
                  });
                  if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    const jidReal = profileData?.jid || profileData?.wuid || profileData?.id || '';
                    if (jidReal.includes('@s.whatsapp.net') || jidReal.includes('@c.us')) {
                      const tel = jidReal.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
                      if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
                        remoteJid = `${tel}@s.whatsapp.net`;
                        // Salvar mapeamento para próximas vezes
                        base44.asServiceRole.entities.ContatoWhatsapp.create({
                          empresa_id: JD_ID, telefone: tel, nome: pushName || tel,
                          lid_jid: lidNumerico, ultima_atualizacao: new Date().toISOString()
                        }).catch(() => {});
                        console.log(`✅ @lid resolvido via fetchProfile: ${remoteJidRaw} → ${tel}`);
                      } else {
                        console.warn(`⚠️ @lid não resolvível: ${remoteJidRaw} (${pushName}) — ignorado`);
                        continue;
                      }
                    } else {
                      console.warn(`⚠️ @lid não resolvível: ${remoteJidRaw} (${pushName}) — ignorado`);
                      continue;
                    }
                  } else {
                    console.warn(`⚠️ @lid não resolvível: ${remoteJidRaw} (${pushName}) — ignorado`);
                    continue;
                  }
                } catch (_) {
                  console.warn(`⚠️ @lid não resolvível: ${remoteJidRaw} (${pushName}) — ignorado`);
                  continue;
                }
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
          const fl = message.audioMessage?.fileLength || message.pttMessage?.fileLength || 0;
          arquivo_tamanho = (typeof fl === 'object' && fl !== null && 'low' in fl) ? (fl.low + fl.high * 4294967296) : Number(fl) || 0;
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
        else conteudo = JSON.stringify(message).substring(0, 100);

        // Variações do telefone (com e sem 9º dígito) — buscar nos dois formatos
        const telefonesVariacoes = [telefoneLimpo];
        if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
          telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
        } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
          telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5));
        }
        const telefoneNormalizado = telefoneLimpo;

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
          remetente: fromMe ? 'vendedor' : 'cliente',
          tipo_conteudo: tipo,
          texto: conteudo,
          arquivo_url: arquivo_url || null,
          arquivo_nome: arquivo_nome || null,
          arquivo_tamanho: arquivo_tamanho || 0,
          whatsapp_message_id: messageId,
          data_envio: timestamp,
          status: fromMe ? 'enviada' : 'entregue'
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
// Sincronização ATIVA de mensagens — busca diretamente na Evolution API
// Executa periodicamente como fallback quando o webhook falha
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

    // Auto-heal: a cada execução, reconfirmar que o webhook está ativo (evita que pare de disparar)
    try {
      const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${empresa.evolution_instance_name}`;
      await fetch(`${evolutionUrl}/webhook/set/${empresa.evolution_instance_name}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: true, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"] } })
      });
    } catch (_) { /* silencioso */ }

    // Calcular janela de busca — últimas 6 horas em segundos (Evolution usa Unix timestamp)
    const agoSeconds = Math.floor((Date.now() - (6 * 60 * 60 * 1000)) / 1000);

    console.log(`🕐 Buscando mensagens desde: ${new Date(agoSeconds * 1000).toISOString()}`);

    // Buscar mensagens recentes da Evolution (recebidas, não enviadas por nós)
    const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: {
          key: { fromMe: false },
          messageTimestamp: { $gte: agoSeconds }
        },
        limit: 100
      })
    });

    if (!res.ok) {
      console.error('Erro Evolution API:', res.status, await res.text());
      return Response.json({ erro: `Evolution retornou ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    // Evolution retorna { messages: { total, records: [...] } }
    const mensagens = Array.isArray(data) 
      ? data 
      : (data.messages?.records || data.messages || []);

    console.log(`📦 ${mensagens.length} mensagens encontradas na Evolution`);

    // ── Construir mapa de @lid → telefone usando contatos da Evolution ──
    const lidToPhone = {};
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
            // Tentar pegar o número real de campos alternativos
            const jidReal = c.remoteJid || c.jid || '';
            if (jidReal.includes('@s.whatsapp.net')) {
              lidToPhone[lidId] = jidReal.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
            } else if (c.number) {
              lidToPhone[lidId] = String(c.number).replace(/\D/g, '');
            }
          }
        }
        console.log(`📒 Mapa @lid construído: ${Object.keys(lidToPhone).length} entradas`);
      }
    } catch (e) {
      console.warn('⚠️ Erro ao construir mapa @lid:', e.message);
    }

    let processadas = 0;
    let ignoradas = 0;

    for (const msg of mensagens) {
      try {
        const key = msg.key || {};
        const message = msg.message || {};
        const pushName = msg.pushName || msg.senderName || 'Cliente';
        const remoteJidRaw = key.remoteJid || '';
        const messageId = key.id;
        const fromMe = key.fromMe === true;

        if (!messageId || !remoteJidRaw || fromMe) { ignoradas++; continue; }
        // Rejeitar grupos e broadcasts
        if (remoteJidRaw.includes('@g.us') || remoteJidRaw.includes('@broadcast')) { ignoradas++; continue; }

        // Resolver @lid para telefone real
        let remoteJid = remoteJidRaw;
        if (remoteJidRaw.includes('@lid')) {
          if (lidToPhone[remoteJidRaw]) {
            // Temos o mapeamento via contacts: usar o telefone real
            const tel = lidToPhone[remoteJidRaw];
            remoteJid = `${tel}@s.whatsapp.net`;
            console.log(`🔄 @lid resolvido via mapa: ${remoteJidRaw} → ${remoteJid}`);
          } else {
            // Sem mapeamento via contacts: tentar resolver via ContatoWhatsapp (pushName)
            const lidNumerico = remoteJidRaw.replace(/@lid/g, '').replace(/\D/g, '');
            let resolvedPhone = null;

            // Buscar ConversaWhatsapp existente com lid_XXXX para ver se já foi vinculada
            try {
              const conversasLid = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
                empresa_id: JD_ID, cliente_telefone: `lid_${lidNumerico}`
              });
              if (conversasLid.length > 0 && conversasLid[0].cliente_id) {
                // Se a conversa lid já tem cliente vinculado, tenta achar o telefone
                const clientes = await base44.asServiceRole.entities.Cliente.filter({ id: conversasLid[0].cliente_id });
                if (clientes.length > 0 && clientes[0].celular) {
                  resolvedPhone = clientes[0].celular.replace(/\D/g, '');
                  console.log(`🔄 @lid resolvido via cliente vinculado: ${resolvedPhone}`);
                }
              }
            } catch (_) {}

            if (resolvedPhone) {
              remoteJid = `${resolvedPhone}@s.whatsapp.net`;
            } else {
              // Tentar resolver por pushName: buscar conversa existente com esse nome
              try {
                const conversasPorNome = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
                  empresa_id: JD_ID, cliente_nome: pushName
                });
                // Filtrar apenas as que têm telefone real (não lid_)
                const conversaReal = conversasPorNome.find(c => c.cliente_telefone && !c.cliente_telefone.startsWith('lid_'));
                if (conversaReal) {
                  resolvedPhone = conversaReal.cliente_telefone.replace(/\D/g, '');
                  remoteJid = `${resolvedPhone}@s.whatsapp.net`;
                  console.log(`🔄 @lid resolvido por pushName "${pushName}": ${remoteJid}`);
                }
              } catch (_) {}

              if (!resolvedPhone) {
                if (lidNumerico && lidNumerico.length >= 8) {
                  remoteJid = `lid_${lidNumerico}`;
                  console.log(`⚠️ @lid sem mapeamento, usando fallback: ${remoteJid} (pushName: ${pushName})`);
                } else {
                  ignoradas++; continue;
                }
              }
            }
          }
        }

        // Só aceitar JIDs com sufixo válido ou lids resolvidos
        const isLidFallback = remoteJid.startsWith('lid_');
        if (!isLidFallback && !remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@c.us')) { ignoradas++; continue; }

        // Verificar se já existe no banco
        const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { whatsapp_message_id: messageId }
        );
        if (existentes.length > 0) { ignoradas++; continue; }

        // Extrair telefone
        const telefoneLimpo = isLidFallback ? remoteJid : remoteJid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');

        // Validar telefone: 10-15 dígitos, brasileiro começa com 55 (exceto lids fallback)
        if (!isLidFallback) {
          if (!telefoneLimpo || telefoneLimpo.length < 10 || telefoneLimpo.length > 15) { ignoradas++; continue; }
          if (telefoneLimpo.length >= 12 && telefoneLimpo.length <= 13 && !telefoneLimpo.startsWith('55')) { ignoradas++; continue; }
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

        // Normalizar sempre para o número COM o 9º dígito (padrão BR)
        let telefoneNormalizado = telefoneLimpo;
        if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
          // Sem 9 → adicionar 9 após o DDD (posição 4)
          telefoneNormalizado = telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4);
        }

        // Variações do telefone para busca (com e sem 9)
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
          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: JD_ID,
            cliente_nome: pushName,
            cliente_telefone: telefoneNormalizado, // sempre com 9
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

        // Salvar mensagem
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
        console.log(`✅ Mensagem sincronizada: ${messageId} | tel: ${telefoneLimpo} | "${conteudo.substring(0, 50)}"`);

      } catch (e) {
        console.error('Erro ao processar mensagem:', e.message);
      }
    }

    console.log(`📊 Resultado: ${processadas} processadas, ${ignoradas} ignoradas`);

    return Response.json({ 
      ok: true, 
      total_evolution: mensagens.length,
      processadas, 
      ignoradas 
    });

  } catch (e) {
    console.error('❌ Erro geral:', e.message);
    return Response.json({ erro: e.message }, { status: 500 });
  }
});
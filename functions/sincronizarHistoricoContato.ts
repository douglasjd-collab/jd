import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const { telefone, empresa_id } = await req.json();

    if (!telefone) {
      return Response.json({ erro: 'Parâmetro telefone obrigatório' }, { status: 400 });
    }

    const JD_ID = empresa_id || '699696c2c9f5bffc2e67402b';

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];

    if (!empresa?.evolution_url || !empresa?.evolution_api_key || !empresa?.evolution_instance_name) {
      return Response.json({ erro: 'Configuração Evolution incompleta' }, { status: 400 });
    }

    const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    const telefoneLimpo = telefone.replace(/\D/g, '');

    // Variações do número (com e sem 9º dígito)
    const variacoes = [telefoneLimpo];
    if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
      variacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
    } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
      variacoes.push(telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5));
    }

    console.log(`📞 Buscando histórico para: ${telefoneLimpo} | variações: ${variacoes.join(', ')}`);

    // Buscar todas as mensagens para cada variação do JID
    let todasMensagens = [];

    for (const tel of variacoes) {
      const remoteJid = `${tel}@s.whatsapp.net`;
      console.log(`🔍 Buscando JID: ${remoteJid}`);

      // Buscar sem filtro de timestamp para pegar TODO o histórico
      const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          where: {
            key: { remoteJid }
          },
          limit: 1000
        })
      });

      if (!res.ok) {
        console.warn(`⚠️ Erro Evolution para ${remoteJid}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const msgs = Array.isArray(data)
        ? data
        : (data.messages?.records || data.messages || []);

      console.log(`📦 ${msgs.length} mensagens encontradas para ${remoteJid}`);
      todasMensagens = [...todasMensagens, ...msgs];
    }

    if (todasMensagens.length === 0) {
      return Response.json({ ok: true, mensagem: 'Nenhuma mensagem encontrada na Evolution para este contato', processadas: 0 });
    }

    // Remover duplicatas pelo messageId
    const vistas = new Set();
    todasMensagens = todasMensagens.filter(m => {
      const id = m.key?.id;
      if (!id || vistas.has(id)) return false;
      vistas.add(id);
      return true;
    });

    console.log(`📦 Total único de mensagens: ${todasMensagens.length}`);

    // Buscar/criar conversa no banco
    let conversa = null;
    for (const tel of variacoes) {
      const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: JD_ID, cliente_telefone: tel }
      );
      if (convs?.length > 0) { conversa = convs[0]; break; }
    }

    if (!conversa) {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: JD_ID,
        cliente_nome: telefoneLimpo,
        cliente_telefone: telefoneLimpo,
        whatsapp_id: `sync_${telefoneLimpo}`,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        tipo_conexao: 'empresa',
        instancia: instanceName
      });
      console.log(`✅ Conversa criada: ${conversa.id}`);
    } else {
      console.log(`✅ Conversa encontrada: ${conversa.id}`);
    }

    // Buscar IDs já existentes no banco para esta conversa (evitar duplicatas)
    const existentesNoBanco = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { conversa_id: conversa.id },
      'data_envio',
      2000
    );
    const idsExistentes = new Set(existentesNoBanco.map(m => m.whatsapp_message_id).filter(Boolean));
    console.log(`🗃️ ${idsExistentes.size} mensagens já existem no banco`);

    let processadas = 0;
    let ignoradas = 0;

    // Ordenar por timestamp para processar cronologicamente
    todasMensagens.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    for (const msg of todasMensagens) {
      const key = msg.key || {};
      const message = msg.message || {};
      const messageId = key.id;
      const fromMe = key.fromMe === true;

      if (!messageId) { ignoradas++; continue; }
      if (idsExistentes.has(messageId)) { ignoradas++; continue; }

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

      const timestamp = msg.messageTimestamp
        ? new Date(msg.messageTimestamp * 1000).toISOString()
        : new Date().toISOString();

      await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa.id,
        empresa_id: JD_ID,
        remetente: fromMe ? 'vendedor' : 'cliente',
        tipo_conteudo: tipo,
        texto: conteudo,
        whatsapp_message_id: messageId,
        data_envio: timestamp,
        status: fromMe ? 'enviada' : 'entregue'
      });

      processadas++;
    }

    // Atualizar última mensagem da conversa
    if (processadas > 0 || existentesNoBanco.length > 0) {
      const ultimaMsg = todasMensagens[todasMensagens.length - 1];
      if (ultimaMsg) {
        let conteudoUltima = '';
        const m = ultimaMsg.message || {};
        if (m.conversation) conteudoUltima = m.conversation;
        else if (m.extendedTextMessage?.text) conteudoUltima = m.extendedTextMessage.text;
        else if (m.imageMessage) conteudoUltima = 'Imagem';
        else if (m.audioMessage || m.pttMessage) conteudoUltima = 'Áudio';
        else if (m.videoMessage) conteudoUltima = 'Vídeo';
        else if (m.documentMessage) conteudoUltima = 'Documento';

        const ts = ultimaMsg.messageTimestamp
          ? new Date(ultimaMsg.messageTimestamp * 1000).toISOString()
          : new Date().toISOString();

        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
          ultima_mensagem: conteudoUltima.substring(0, 200),
          data_ultima_mensagem: ts
        });
      }
    }

    console.log(`📊 Resultado: ${processadas} novas, ${ignoradas} já existiam`);

    return Response.json({
      ok: true,
      conversa_id: conversa.id,
      total_evolution: todasMensagens.length,
      processadas,
      ignoradas,
      mensagem: `Histórico sincronizado: ${processadas} mensagens novas salvas`
    });

  } catch (e) {
    console.error('❌ Erro:', e.message);
    return Response.json({ erro: e.message }, { status: 500 });
  }
});
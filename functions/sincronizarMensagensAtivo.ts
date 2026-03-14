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

    // Calcular janela de busca — últimas 2 horas
    const agoMs = Date.now() - (2 * 60 * 60 * 1000);

    // Buscar mensagens recentes da Evolution (recebidas, não enviadas por nós)
    const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: { key: { fromMe: false } },
        limit: 50
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

    let processadas = 0;
    let ignoradas = 0;

    for (const msg of mensagens) {
      try {
        const key = msg.key || {};
        const message = msg.message || {};
        const pushName = msg.pushName || msg.senderName || 'Cliente';
        const remoteJid = key.remoteJid || '';
        const messageId = key.id;
        const fromMe = key.fromMe === true;

        if (!messageId || !remoteJid || fromMe) { ignoradas++; continue; }
        // Rejeitar grupos, @lid e broadcasts
        if (remoteJid.includes('@g.us') || remoteJid.includes('@lid') || remoteJid.includes('@broadcast')) { ignoradas++; continue; }
        // Só aceitar JIDs com sufixo válido
        if (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@c.us')) { ignoradas++; continue; }

        // Verificar se já existe no banco
        const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { whatsapp_message_id: messageId }
        );
        if (existentes.length > 0) { ignoradas++; continue; }

        // Extrair telefone — somente dígitos do JID após remover sufixo
        const telefoneLimpo = remoteJid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');

        // Validar telefone: 10-15 dígitos, brasileiro começa com 55
        if (!telefoneLimpo || telefoneLimpo.length < 10 || telefoneLimpo.length > 15) { ignoradas++; continue; }
        if (telefoneLimpo.length >= 12 && telefoneLimpo.length <= 13 && !telefoneLimpo.startsWith('55')) { ignoradas++; continue; }

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

        // Variações do telefone
        const telefonesVariacoes = [telefoneLimpo];
        if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
          telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
        } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
          telefonesVariacoes.push(telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5));
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
            cliente_telefone: telefoneLimpo,
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
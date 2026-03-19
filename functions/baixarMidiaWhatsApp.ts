import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mensagem_id, arquivo_url, conversa_id } = await req.json();
    if (!mensagem_id) {
      return Response.json({ error: 'mensagem_id obrigatório' }, { status: 400 });
    }

    // Buscar mensagem do banco para pegar whatsapp_message_id
    const mensagens = await base44.entities.MensagemWhatsapp.filter({ id: mensagem_id });
    const mensagem = mensagens?.[0];
    if (!mensagem) return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });

    // Verificar se já foi baixada (URL permanente)
    const urlAtual = mensagem.arquivo_url;
    if (urlAtual && (urlAtual.includes('base44') || urlAtual.includes('supabase') || urlAtual.includes('amazonaws'))) {
      return Response.json({ ok: true, arquivo_url: urlAtual });
    }

    // Buscar empresa para credenciais Evolution
    const JD_ID = mensagem.empresa_id || '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    if (!empresa?.evolution_url || !empresa?.evolution_api_key) {
      return Response.json({ error: 'Credenciais Evolution não configuradas' }, { status: 400 });
    }

    const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    // Buscar conversa para pegar remoteJid
    const conversaId = conversa_id || mensagem.conversa_id;
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({ id: conversaId });
    const conversa = conversas?.[0];
    const remoteJid = conversa?.cliente_telefone 
      ? `${conversa.cliente_telefone.replace(/\D/g, '')}@s.whatsapp.net`
      : '';

    const whatsappMessageId = mensagem.whatsapp_message_id;

    console.log(`📥 Baixando mídia | msgId: ${whatsappMessageId} | jid: ${remoteJid}`);

    // Definir mimeType padrão baseado no tipo da mensagem
    const tipoParaMime = {
      'audio': 'audio/ogg',
      'imagem': 'image/jpeg',
      'video': 'video/mp4',
      'pdf': 'application/pdf',
      'documento': 'application/octet-stream'
    };
    let base64Data = null;
    let mimeType = tipoParaMime[mensagem.tipo_conteudo] || 'audio/ogg';

    // Método 1: Usar Evolution getBase64FromMediaMessage (descriptografa WhatsApp CDN)
    if (whatsappMessageId && remoteJid) {
      try {
        // Primeiro buscar o objeto completo da mensagem via findMessages
        const findRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            where: { key: { id: whatsappMessageId } },
            limit: 1
          })
        });

        if (findRes.ok) {
          const findData = await findRes.json();
          const records = Array.isArray(findData) ? findData : (findData.messages?.records || findData.messages || findData.records || []);
          const msgObject = records[0];

          if (msgObject?.message) {
            // Chamar getBase64FromMediaMessage com o objeto completo
            const b64Res = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
              method: 'POST',
              headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: {
                  key: msgObject.key,
                  message: msgObject.message
                },
                convertToMp4: false
              })
            });

            if (b64Res.ok) {
              const b64Data = await b64Res.json();
              if (b64Data?.base64) {
                base64Data = b64Data.base64;
                mimeType = b64Data.mimetype || 'audio/ogg';
                console.log(`✅ base64 obtido via getBase64FromMediaMessage | tipo: ${mimeType}`);
              }
            } else {
              console.warn(`⚠️ getBase64FromMediaMessage falhou: ${b64Res.status}`);
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Erro ao usar getBase64FromMediaMessage:', e.message);
      }
    }

    // Método 2: Tentar baixar URL diretamente com apikey (para URLs do próprio Evolution)
    if (!base64Data && urlAtual) {
      try {
        const fetchRes = await fetch(urlAtual, {
          headers: { 'apikey': evolutionKey, 'User-Agent': 'Base44-WhatsApp-CRM' }
        });

        if (fetchRes.ok) {
          const ct = fetchRes.headers.get('content-type') || '';
          // Não sobrescrever com octet-stream genérico — manter tipo da mensagem
          if (ct && ct !== 'application/octet-stream') mimeType = ct;
          const arrayBuffer = await fetchRes.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
          }
          base64Data = btoa(binary);
          console.log(`✅ Mídia baixada diretamente | tipo: ${mimeType}`);
        }
      } catch (e) {
        console.warn('⚠️ Download direto falhou:', e.message);
      }
    }

    if (!base64Data) {
      return Response.json({ error: 'Não foi possível baixar a mídia' }, { status: 500 });
    }

    console.log(`✅ base64 pronto, retornando para upload no frontend | tipo: ${mimeType} | tamanho: ${base64Data.length}`);

    // Retornar base64 para o frontend fazer o upload permanente via SDK browser
    return Response.json({ ok: true, base64: base64Data, mimeType, mensagem_id });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
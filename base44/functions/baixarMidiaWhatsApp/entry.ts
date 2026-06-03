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

    // Buscar mensagem via service role para garantir acesso
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ id: mensagem_id });
    const mensagem = mensagens?.[0];
    if (!mensagem) return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });

    // Se já tem URL permanente, retornar ela
    const urlAtual = mensagem.arquivo_url;
    if (urlAtual && (urlAtual.includes('base44') || urlAtual.includes('supabase') || urlAtual.includes('amazonaws'))) {
      return Response.json({ ok: true, arquivo_url: urlAtual });
    }

    // Buscar conversa para determinar tipo de conexão (Meta Oficial ou Evolution)
    const conversaId = conversa_id || mensagem.conversa_id;
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({ id: conversaId });
    const conversa = conversas?.[0];

    // Buscar empresa
    const JD_ID = mensagem.empresa_id || '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];

    // Mime type padrão pelo tipo da mensagem
    const tipoParaMime = {
      'audio': 'audio/ogg',
      'imagem': 'image/jpeg',
      'video': 'video/mp4',
      'pdf': 'application/pdf',
      'documento': 'application/octet-stream'
    };
    let base64Data = null;
    let mimeType = tipoParaMime[mensagem.tipo_conteudo] || 'application/octet-stream';

    const whatsappMessageId = mensagem.whatsapp_message_id;
    const isMetaOficial = conversa?.tipo_conexao === 'meta_oficial';

    // ── META OFICIAL: buscar mídia via Graph API ──────────────────────────────
    if (isMetaOficial) {
      // Obter access token: pode ser da empresa ou do colaborador
      let metaToken = empresa?.whatsapp_access_token;
      if (!metaToken) {
        return Response.json({ error: 'Token Meta não configurado para esta empresa' }, { status: 400 });
      }

      // O whatsapp_message_id da Meta pode ser o ID da mensagem ou o media_id diretamente
      // Para mensagens da Meta, o arquivo_url geralmente vem vazio ou com media_id
      // Primeiro tentar extrair media_id da URL ou usar o whatsapp_message_id
      let mediaId = null;

      // Verificar se arquivo_url já contém um media_id válido (formato numérico longo)
      if (urlAtual && /^\d{10,}$/.test(urlAtual.trim())) {
        mediaId = urlAtual.trim();
      } else if (whatsappMessageId) {
        // Buscar detalhes da mensagem via Graph API para obter o media_id
        try {
          const msgRes = await fetch(`https://graph.facebook.com/v19.0/${whatsappMessageId}`, {
            headers: { 'Authorization': `Bearer ${metaToken}` }
          });
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            // A mensagem retorna campos como audio.id, image.id, video.id, document.id
            mediaId = msgData?.audio?.id || msgData?.image?.id || msgData?.video?.id || msgData?.document?.id || msgData?.sticker?.id;
            if (mediaId) {
              mimeType = msgData?.audio?.mime_type || msgData?.image?.mime_type || msgData?.video?.mime_type || msgData?.document?.mime_type || mimeType;
            }
          }
        } catch (e) {
          console.warn('⚠️ Busca detalhes mensagem Meta falhou:', e.message);
        }
      }

      // Se temos media_id, buscar URL de download via Graph API
      if (mediaId) {
        try {
          const mediaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${metaToken}` }
          });
          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            const downloadUrl = mediaData?.url;
            mimeType = mediaData?.mime_type || mimeType;

            if (downloadUrl) {
              // Baixar o arquivo usando o token Meta
              const fileRes = await fetch(downloadUrl, {
                headers: { 'Authorization': `Bearer ${metaToken}`, 'User-Agent': 'Base44-WhatsApp-CRM' }
              });
              if (fileRes.ok) {
                const ct = fileRes.headers.get('content-type') || '';
                if (ct && ct !== 'application/octet-stream') mimeType = ct.split(';')[0].trim();
                const arrayBuffer = await fileRes.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                // btoa em chunks para evitar stack overflow em arquivos grandes
                let binary = '';
                const chunkSize = 8192;
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                  binary += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
                }
                base64Data = btoa(binary);
                console.log(`✅ Mídia Meta baixada | media_id: ${mediaId} | tipo: ${mimeType}`);
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Download mídia Meta falhou:', e.message);
        }
      }

      if (!base64Data) {
        console.warn('⚠️ Não conseguiu baixar mídia da Meta Oficial');
        return Response.json({ ok: false, error: 'Não foi possível baixar a mídia da API Meta Oficial' }, { status: 400 });
      }

    } else {
      // ── EVOLUTION API ──────────────────────────────────────────────────────
      if (!empresa?.evolution_url || !empresa?.evolution_api_key) {
        return Response.json({ error: 'Credenciais Evolution não configuradas' }, { status: 400 });
      }

      const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
      const evolutionKey = empresa.evolution_api_key;
      const instanceName = empresa.evolution_instance_name;

      const remoteJid = conversa?.cliente_telefone
        ? `${conversa.cliente_telefone.replace(/\D/g, '')}@s.whatsapp.net`
        : '';

      // Método 1: getBase64FromMediaMessage (descriptografa CDN do WhatsApp)
      if (whatsappMessageId && remoteJid) {
        try {
          const findRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ where: { key: { id: whatsappMessageId } }, limit: 1 })
          });
          if (findRes.ok) {
            const findData = await findRes.json();
            const records = Array.isArray(findData) ? findData
              : (findData.messages?.records || findData.messages || findData.records || []);
            const msgObject = records[0];
            if (msgObject?.message) {
              const b64Res = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
                method: 'POST',
                headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: { key: msgObject.key, message: msgObject.message }, convertToMp4: false })
              });
              if (b64Res.ok) {
                const b64Data = await b64Res.json();
                if (b64Data?.base64) {
                  base64Data = b64Data.base64;
                  mimeType = b64Data.mimetype || mimeType;
                  console.log(`✅ base64 via getBase64FromMediaMessage | tipo: ${mimeType}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ getBase64FromMediaMessage falhou:', e.message);
        }
      }

      // Se URL externa estável, retornar direto
      const isUrlExternaEstavel = urlAtual && !urlAtual.includes('.enc') && 
        (urlAtual.includes('supabase') || urlAtual.includes('amazonaws') || urlAtual.includes('base44'));
      if (!base64Data && isUrlExternaEstavel) {
        console.log(`✅ URL permanente retornada: ${urlAtual}`);
        return Response.json({ ok: true, arquivo_url: urlAtual });
      }

      // Método 2: Download direto da URL com apikey (para arquivos .enc)
      if (!base64Data && urlAtual) {
        try {
          const fetchRes = await fetch(urlAtual, {
            headers: { 'apikey': evolutionKey, 'User-Agent': 'Base44-WhatsApp-CRM' }
          });
          if (fetchRes.ok) {
            const ct = fetchRes.headers.get('content-type') || '';
            if (ct && ct !== 'application/octet-stream') mimeType = ct.split(';')[0].trim();
            const arrayBuffer = await fetchRes.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            base64Data = btoa(String.fromCharCode.apply(null, uint8Array));
            console.log(`✅ Download direto | tipo: ${mimeType}`);
          }
        } catch (e) {
          console.warn('⚠️ Download direto falhou:', e.message);
          return Response.json({ ok: true, arquivo_url: urlAtual });
        }
      }
    }

    if (!base64Data) {
      console.warn('⚠️ Não conseguiu baixar via Evolution - retornando URL temporária');
      return Response.json({ 
        ok: true, 
        arquivo_url: urlAtual || 'indisponivel'
      });
    }

    // Converter base64 → Blob → File e fazer upload no backend (via service role)
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const file = new File([blob], `media_${mensagem_id}.${ext}`, { type: mimeType });

    const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    if (!uploadRes?.file_url) {
      return Response.json({ error: 'Upload para storage falhou' }, { status: 500 });
    }

    // Salvar URL permanente na mensagem
    await base44.asServiceRole.entities.MensagemWhatsapp.update(mensagem_id, {
      arquivo_url: uploadRes.file_url
    });

    console.log(`✅ Mídia salva permanentemente: ${uploadRes.file_url}`);
    return Response.json({ ok: true, arquivo_url: uploadRes.file_url });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
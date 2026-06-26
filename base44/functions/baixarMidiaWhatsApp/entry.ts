import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    // Buscar mensagem
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ id: mensagem_id });
    const mensagem = mensagens?.[0];
    if (!mensagem) return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });

    // Se já tem URL permanente do nosso storage, verificar se o arquivo é válido antes de retornar
    const urlAtual = mensagem.arquivo_url;
    const isUrlPermanente = urlAtual && (
      urlAtual.includes('base44') || urlAtual.includes('supabase') || urlAtual.includes('amazonaws')
    );
    // Nunca retornar URLs .enc (criptografadas da CDN do WhatsApp) como definitivas
    const isUrlEnc = urlAtual && (urlAtual.includes('.enc') || urlAtual.includes('.enc?'));
    if (isUrlPermanente && !isUrlEnc) {
      // Verificar se o arquivo existe e não está corrompido (>1KB)
      try {
        const headRes = await fetch(urlAtual, { method: 'HEAD' });
        const size = parseInt(headRes.headers.get('content-length') || '0');
        const ct = headRes.headers.get('content-type') || '';
        const isValido = headRes.status === 200 && size > 1000 && !ct.startsWith('text/plain');
        if (isValido) {
          return Response.json({ ok: true, arquivo_url: urlAtual });
        }
        console.warn(`⚠️ URL do storage inválida (status=${headRes.status}, size=${size}, ct=${ct}) — rebaixando...`);
      } catch (e) {
        console.warn('⚠️ HEAD check falhou, tentando rebaixar:', e.message);
      }
    }

    // Buscar conversa e empresa
    const conversaId = conversa_id || mensagem.conversa_id;
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({ id: conversaId });
    const conversa = conversas?.[0];

    const empresaId = mensagem.empresa_id || '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    const empresa = empresas?.[0];

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

    // Detectar se é Meta Oficial:
    // 1. tipo_conexao da conversa é meta_oficial
    // 2. OU o whatsapp_message_id começa com "wamid." (padrão Meta)
    // 3. OU o arquivo_url é um media_id numérico (padrão Meta)
    const isWamid = whatsappMessageId && whatsappMessageId.startsWith('wamid.');
    const isMediaIdNumerico = urlAtual && /^\d{10,}$/.test(urlAtual.trim());
    const isUrlPrivadaMeta =
      urlAtual &&
      (
        urlAtual.includes('pps.whatsapp.net') ||
        urlAtual.includes('mmg.whatsapp.net') ||
        urlAtual.includes('lookaside.fbsbx.com')
      );

    const isMetaOficial =
      conversa?.tipo_conexao === 'meta_oficial' ||
      conversa?.ultima_origem_recebida === 'meta_oficial' ||
      conversa?.instancia === 'META_OFICIAL' ||
      isWamid ||
      isMediaIdNumerico ||
      isUrlPrivadaMeta;

    // ── META OFICIAL ──────────────────────────────────────────────────────────
    if (isMetaOficial) {
      const metaToken = empresa?.whatsapp_access_token;
      if (!metaToken) {
        return Response.json({ error: 'Token Meta não configurado' }, { status: 400 });
      }

      let mediaId = null;

      // arquivo_url pode conter o media_id numérico diretamente
      if (urlAtual && /^\d{10,}$/.test(urlAtual.trim())) {
        mediaId = urlAtual.trim();
      } else if (whatsappMessageId) {
        // Não buscar na Meta por whatsappMessageId, pois o ID da mensagem não contém o media_id
        // O media_id deve ser obtido do webhook de recebimento e salvo no arquivo_url
        // Se arquivo_url não for um media_id, não há como baixar da Meta aqui.
        console.warn('⚠️ Tentativa de baixar da Meta sem media_id (apenas com whatsapp_message_id). Isso não é suportado. O media_id deve estar em arquivo_url.');
      }

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
              const fileRes = await fetch(downloadUrl, {
                headers: { 'Authorization': `Bearer ${metaToken}`, 'User-Agent': 'Base44-WhatsApp-CRM' }
              });
              if (fileRes.ok) {
                const ct = fileRes.headers.get('content-type') || '';
                if (ct && ct !== 'application/octet-stream') mimeType = ct.split(';')[0].trim();
                const arrayBuffer = await fileRes.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
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
          console.warn('⚠️ Download Meta falhou:', e.message);
        }
      }

      // Se já temos uma URL privada da Meta/WhatsApp, baixar direto com Bearer Token
      if (!base64Data && isUrlPrivadaMeta && urlAtual) {
        try {
          const fileRes = await fetch(urlAtual, {
            headers: {
              Authorization: `Bearer ${metaToken}`,
              'User-Agent': 'Base44-WhatsApp-CRM'
            }
          });

          console.log('📥 Download direto URL privada Meta:', fileRes.status);

          if (fileRes.ok) {
            const ct = fileRes.headers.get('content-type') || '';
            if (ct && ct !== 'application/octet-stream') {
              mimeType = ct.split(';')[0].trim();
            }

            const arrayBuffer = await fileRes.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              binary += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
            }

            base64Data = btoa(binary);
            console.log(`✅ Mídia privada Meta baixada direto | tipo: ${mimeType}`);
          }
        } catch (e) {
          console.warn('⚠️ Download direto URL privada Meta falhou:', e.message);
        }
      }

      if (!base64Data) {
        console.warn('⚠️ Não conseguiu baixar mídia da Meta Oficial', { mediaId, whatsappMessageId });
        return Response.json({ ok: false, error: 'Não foi possível baixar a mídia da API Meta Oficial' }, { status: 400 });
      }

    } else {
      // ── EVOLUTION API ─────────────────────────────────────────────────────────
      if (!empresa?.evolution_url || !empresa?.evolution_api_key) {
        return Response.json({ error: 'Credenciais Evolution não configuradas' }, { status: 400 });
      }

      const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
      const evolutionKey = empresa.evolution_api_key;
      const instanceName = empresa.evolution_instance_name;

      // Verificar se URL atual já é externa/estável (não enc)
      const isUrlEstavel = urlAtual && !urlAtual.endsWith('.enc') && !urlAtual.includes('.enc?') &&
        (urlAtual.startsWith('https://') || urlAtual.startsWith('http://')) &&
        !urlAtual.includes('supabase') && !urlAtual.includes('base44') && !urlAtual.includes('amazonaws');

      const telefoneLimpo = conversa?.cliente_telefone?.replace(/\D/g, '') || '';
      const remoteJid = telefoneLimpo ? `${telefoneLimpo}@s.whatsapp.net` : '';

      // Método 1a: getBase64FromMediaMessage com key direto (sem findMessages)
      if (whatsappMessageId && remoteJid && !base64Data) {
        try {
          const keyDireto = { remoteJid, fromMe: false, id: whatsappMessageId };
          const b64ResDireto = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: { key: keyDireto }, convertToMp4: false })
          });
          if (b64ResDireto.ok) {
            const b64DataDireto = await b64ResDireto.json();
            if (b64DataDireto?.base64) {
              base64Data = b64DataDireto.base64;
              mimeType = b64DataDireto.mimetype || mimeType;
              console.log(`✅ base64 via key direto | tipo: ${mimeType}`);
            }
          }
        } catch (e) {
          console.warn('⚠️ getBase64 direto falhou:', e.message);
        }
      }

      // Método 1b: fromMe=true (mensagem enviada pelo vendedor)
      if (whatsappMessageId && remoteJid && !base64Data) {
        try {
          const keyFromMe = { remoteJid, fromMe: true, id: whatsappMessageId };
          const b64ResFromMe = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: { key: keyFromMe }, convertToMp4: false })
          });
          if (b64ResFromMe.ok) {
            const b64DataFromMe = await b64ResFromMe.json();
            if (b64DataFromMe?.base64) {
              base64Data = b64DataFromMe.base64;
              mimeType = b64DataFromMe.mimetype || mimeType;
              console.log(`✅ base64 via key fromMe=true | tipo: ${mimeType}`);
            }
          }
        } catch (e) {
          console.warn('⚠️ getBase64 fromMe falhou:', e.message);
        }
      }

      // Método 1c: findMessages + getBase64FromMediaMessage
      if (whatsappMessageId && !base64Data) {
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
                  console.log(`✅ base64 via findMessages | tipo: ${mimeType}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ findMessages falhou:', e.message);
        }
      }

      // Método 2: URL estável que não seja enc — retornar diretamente
      if (!base64Data && isUrlEstavel) {
        console.log(`✅ URL estável retornada diretamente: ${urlAtual}`);
        return Response.json({ ok: true, arquivo_url: urlAtual });
      }

      // Método 3: Download direto da URL (enc ou outra)
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
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              binary += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
            }
            base64Data = btoa(binary);
            console.log(`✅ Download direto da URL | tipo: ${mimeType}`);
          }
        } catch (e) {
          console.warn('⚠️ Download direto falhou:', e.message);
        }
      }

      // Fallback: tentar via Meta Oficial se empresa tiver token configurado
      if (!base64Data && empresa?.whatsapp_access_token && (isWamid || isMediaIdNumerico)) {
        console.log('🔄 Tentando fallback Meta Oficial para mensagem com ID Meta...');
        const metaToken = empresa.whatsapp_access_token;
        try {
          let mediaId = isMediaIdNumerico ? urlAtual.trim() : null;
          if (!mediaId && whatsappMessageId) {
            const msgRes = await fetch(`https://graph.facebook.com/v19.0/${whatsappMessageId}`, {
              headers: { 'Authorization': `Bearer ${metaToken}` }
            });
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              mediaId = msgData?.audio?.id || msgData?.image?.id || msgData?.video?.id || msgData?.document?.id;
              if (mediaId) mimeType = msgData?.audio?.mime_type || msgData?.image?.mime_type || mimeType;
            }
          }
          if (mediaId) {
            const mediaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
              headers: { 'Authorization': `Bearer ${metaToken}` }
            });
            if (mediaRes.ok) {
              const mediaData = await mediaRes.json();
              if (mediaData?.url) {
                const fileRes = await fetch(mediaData.url, {
                  headers: { 'Authorization': `Bearer ${metaToken}`, 'User-Agent': 'Base44-WhatsApp-CRM' }
                });
                if (fileRes.ok) {
                  mimeType = mediaData.mime_type || mimeType;
                  const arrayBuffer = await fileRes.arrayBuffer();
                  const uint8Array = new Uint8Array(arrayBuffer);
                  let binary = '';
                  for (let i = 0; i < uint8Array.length; i += 8192) {
                    binary += String.fromCharCode(...uint8Array.slice(i, i + 8192));
                  }
                  base64Data = btoa(binary);
                  console.log(`✅ Fallback Meta funcionou | media_id: ${mediaId}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Fallback Meta falhou:', e.message);
        }
      }

      if (!base64Data) {
        console.warn('⚠️ Todos os métodos falharam', {
          whatsapp_message_id: whatsappMessageId,
          arquivo_url: urlAtual,
          remoteJid,
          instancia: instanceName,
        });
        return Response.json({ ok: false, error: 'Mídia não disponível no servidor Evolution' }, { status: 400 });
      }
    }

    // Converter base64 → upload permanente
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

    // Salvar URL permanente na mensagem e marcar como baixado
    await base44.asServiceRole.entities.MensagemWhatsapp.update(mensagem_id, {
      arquivo_url: uploadRes.file_url,
      download_status: 'baixado'
    });

    console.log(`✅ Mídia salva permanentemente: ${uploadRes.file_url}`);
    return Response.json({ ok: true, arquivo_url: uploadRes.file_url });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Upload de mídia para templates WhatsApp via Meta Resumable Upload API
// Fluxo correto:
//   1. POST https://graph.facebook.com/v21.0/app/uploads  → upload_session_id
//   2. POST https://graph.facebook.com/v21.0/{upload_session_id} (binário) → h:xxxxx (header_handle)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { empresa_id, midia_url, tipo_midia } = body;

    if (!midia_url) return Response.json({ error: 'URL da mídia não fornecida' }, { status: 400 });
    if (!tipo_midia) return Response.json({ error: 'Tipo da mídia não fornecido' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas[0];
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const accessToken = empresa.whatsapp_access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
    if (!accessToken) return Response.json({ error: 'Access token da Meta não configurado' }, { status: 400 });

    // === PASSO 1: Baixar o arquivo ===
    const fileResp = await fetch(midia_url);
    if (!fileResp.ok) {
      return Response.json({ error: `Não foi possível baixar o arquivo (HTTP ${fileResp.status})` }, { status: 400 });
    }

    const contentType = cleanMimeType(fileResp.headers.get('content-type'), tipo_midia, midia_url);
    const fileBuffer = await fileResp.arrayBuffer();
    const fileSize = fileBuffer.byteLength;

    console.log('[upload] Arquivo baixado. Tamanho:', fileSize, 'MIME:', contentType);

    // === PASSO 2: Criar sessão de upload resumável ===
    const sessionUrl = new URL('https://graph.facebook.com/v21.0/app/uploads');
    sessionUrl.searchParams.set('file_length', String(fileSize));
    sessionUrl.searchParams.set('file_type', contentType);
    sessionUrl.searchParams.set('access_token', accessToken);

    const sessionResp = await fetch(sessionUrl.toString(), { method: 'POST' });
    const sessionData = await sessionResp.json();
    console.log('[upload] Sessão criada:', JSON.stringify(sessionData));

    if (!sessionResp.ok || sessionData.error || !sessionData.id) {
      const errMsg = sessionData.error?.message || sessionData.error?.error_user_msg || `Falha ao criar sessão (HTTP ${sessionResp.status})`;
      return Response.json({ ok: false, error: 'Erro ao criar sessão de upload: ' + errMsg, details: sessionData }, { status: 400 });
    }

    const uploadSessionId = sessionData.id;

    // === PASSO 3: Fazer upload do arquivo binário ===
    const uploadUrl = `https://graph.facebook.com/v21.0/${uploadSessionId}`;
    const uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${accessToken}`,
        'file_offset': '0',
        'Content-Type': contentType,
      },
      body: fileBuffer,
    });

    const uploadData = await uploadResp.json();
    console.log('[upload] Resultado upload:', JSON.stringify(uploadData));

    if (!uploadResp.ok || uploadData.error) {
      const errMsg = uploadData.error?.error_user_msg
        || uploadData.error?.message
        || `Falha no upload do arquivo (HTTP ${uploadResp.status})`;
      return Response.json({ ok: false, error: errMsg, details: uploadData }, { status: 400 });
    }

    // O handle retornado começa com "h:" — ex: "h:AQHxxx..."
    const handle = uploadData.h;
    if (!handle) {
      return Response.json({ ok: false, error: 'Meta não retornou handle da mídia. Resposta: ' + JSON.stringify(uploadData) }, { status: 400 });
    }

    console.log('[upload] handle obtido:', handle);
    return Response.json({ ok: true, media_id: handle });

  } catch (error) {
    console.error('[uploadMidiaMetaTemplate] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function cleanMimeType(rawType, tipoMidia, url) {
  // Remover parâmetros extras do content-type (ex: "image/jpeg; charset=utf-8" → "image/jpeg")
  if (rawType) {
    const clean = rawType.split(';')[0].trim();
    if (clean && clean !== 'application/octet-stream') return clean;
  }
  // Inferir pelo tipo de mídia solicitado
  const ext = (url.split('.').pop() || '').split('?')[0].toLowerCase();
  if (tipoMidia === 'IMAGE') {
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    return 'image/jpeg';
  }
  if (tipoMidia === 'VIDEO') return 'video/mp4';
  if (tipoMidia === 'DOCUMENT') return 'application/pdf';
  return 'application/octet-stream';
}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Faz o upload de uma mídia para a Meta e retorna o header_handle
// necessário para criar templates com cabeçalho de mídia (IMAGE/VIDEO/DOCUMENT)
// IMPORTANTE: para templates, usa-se POST /{business-account-id}/media (NÃO /{phone-number-id}/media)
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
    const businessAccountId = empresa.whatsapp_business_account_id;
    const phoneNumberId = empresa.whatsapp_phone_number_id;

    if (!accessToken) return Response.json({ error: 'Access token da Meta não configurado' }, { status: 400 });
    if (!businessAccountId) return Response.json({ error: 'Business Account ID não configurado' }, { status: 400 });

    // 1. Baixar o arquivo da URL do Base44
    const fileResp = await fetch(midia_url);
    if (!fileResp.ok) return Response.json({ error: `Não foi possível baixar o arquivo (HTTP ${fileResp.status})` }, { status: 400 });

    const contentType = fileResp.headers.get('content-type') || getMimeType(tipo_midia, midia_url);
    const fileBuffer = await fileResp.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    console.log('[uploadMidiaMetaTemplate] Arquivo baixado. Tamanho:', fileBytes.length, 'Tipo:', contentType);

    // 2. Upload via endpoint de media para TEMPLATES da Meta
    //    Templates usam POST /{business-account-id}/media (não phone-number-id)
    const fileName = midia_url.split('/').pop()?.split('?')[0] || getDefaultFileName(tipo_midia);

    const boundary = '----MetaUpload' + Date.now();
    const parts = [];

    // Part: messaging_product
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp`);
    // Part: file
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`);
    const headerBytes = new TextEncoder().encode(parts.join('\r\n') + '\r\n');
    const footerBytes = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);

    const bodyBuffer = new Uint8Array(headerBytes.length + fileBytes.length + footerBytes.length);
    bodyBuffer.set(headerBytes, 0);
    bodyBuffer.set(fileBytes, headerBytes.length);
    bodyBuffer.set(footerBytes, headerBytes.length + fileBytes.length);

    // Tentar primeiro com o business account ID (recomendado para templates)
    const uploadUrl = `https://graph.facebook.com/v21.0/${businessAccountId}/media`;
    console.log('[uploadMidiaMetaTemplate] Enviando para Meta (business account):', uploadUrl);

    let uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'file_offset': '0',
      },
      body: bodyBuffer,
    });

    let uploadData = await uploadResp.json();
    console.log('[uploadMidiaMetaTemplate] Resposta business account:', JSON.stringify(uploadData));

    // Fallback: tentar com phone number ID se o business falhar
    if ((!uploadResp.ok || uploadData.error) && phoneNumberId) {
      const phoneUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/media`;
      console.log('[uploadMidiaMetaTemplate] Fallback: tentando com phone number ID:', phoneUrl);

      const boundary2 = '----MetaUpload' + Date.now();
      const parts2 = [];
      parts2.push(`--${boundary2}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp`);
      parts2.push(`--${boundary2}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`);
      const headerBytes2 = new TextEncoder().encode(parts2.join('\r\n') + '\r\n');
      const footerBytes2 = new TextEncoder().encode(`\r\n--${boundary2}--\r\n`);
      const bodyBuffer2 = new Uint8Array(headerBytes2.length + fileBytes.length + footerBytes2.length);
      bodyBuffer2.set(headerBytes2, 0);
      bodyBuffer2.set(fileBytes, headerBytes2.length);
      bodyBuffer2.set(footerBytes2, headerBytes2.length + fileBytes.length);

      uploadResp = await fetch(phoneUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary2}`,
        },
        body: bodyBuffer2,
      });
      uploadData = await uploadResp.json();
      console.log('[uploadMidiaMetaTemplate] Resposta phone number ID:', JSON.stringify(uploadData));
    }

    if (!uploadResp.ok || uploadData.error) {
      const errMsg = uploadData.error?.error_user_msg
        || uploadData.error?.message
        || uploadData.error?.error_data?.details
        || `Erro Meta (código ${uploadData.error?.code || uploadResp.status})`;
      return Response.json({ ok: false, error: errMsg, details: uploadData }, { status: 400 });
    }

    const mediaId = uploadData.id || uploadData.handle;
    if (!mediaId) return Response.json({ ok: false, error: 'Meta não retornou ID/handle da mídia' }, { status: 400 });

    console.log('[uploadMidiaMetaTemplate] media_id/handle obtido:', mediaId);
    return Response.json({ ok: true, media_id: mediaId });
  } catch (error) {
    console.error('[uploadMidiaMetaTemplate] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getMimeType(tipo, url) {
  const ext = (url.split('.').pop() || '').split('?')[0].toLowerCase();
  if (tipo === 'IMAGE') {
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    return 'image/jpeg';
  }
  if (tipo === 'VIDEO') return 'video/mp4';
  if (tipo === 'DOCUMENT') return 'application/pdf';
  return 'application/octet-stream';
}

function getDefaultFileName(tipo) {
  if (tipo === 'IMAGE') return 'header.jpg';
  if (tipo === 'VIDEO') return 'header.mp4';
  if (tipo === 'DOCUMENT') return 'header.pdf';
  return 'file';
}
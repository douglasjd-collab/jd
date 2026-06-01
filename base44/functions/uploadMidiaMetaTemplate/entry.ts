import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Faz o upload de uma mídia para a Meta e retorna o media handle
// necessário para criar templates com cabeçalho de mídia
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { empresa_id, midia_url, tipo_midia } = body;
    // tipo_midia: 'IMAGE' | 'VIDEO' | 'DOCUMENT'

    if (!midia_url) return Response.json({ error: 'URL da mídia não fornecida' }, { status: 400 });
    if (!tipo_midia) return Response.json({ error: 'Tipo da mídia não fornecido' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas[0];
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const accessToken = empresa.whatsapp_access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = empresa.whatsapp_phone_number_id;

    if (!accessToken) return Response.json({ error: 'Access token da Meta não configurado' }, { status: 400 });
    if (!phoneNumberId) return Response.json({ error: 'Phone Number ID não configurado na empresa' }, { status: 400 });

    // 1. Baixar o arquivo da URL do Base44
    const fileResp = await fetch(midia_url);
    if (!fileResp.ok) return Response.json({ error: 'Não foi possível baixar o arquivo da URL fornecida' }, { status: 400 });

    const contentType = fileResp.headers.get('content-type') || getMimeType(tipo_midia, midia_url);
    const fileBuffer = await fileResp.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // 2. Montar o FormData para enviar à API da Meta
    const formData = new FormData();
    const fileName = midia_url.split('/').pop()?.split('?')[0] || getDefaultFileName(tipo_midia);
    const blob = new Blob([fileBytes], { type: contentType });

    formData.append('file', blob, fileName);
    formData.append('type', contentType);
    formData.append('messaging_product', 'whatsapp');

    // 3. Upload para a Meta
    const uploadUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/media`;
    console.log('[uploadMidiaMetaTemplate] Enviando para Meta:', uploadUrl, 'tipo:', contentType, 'tamanho:', fileBytes.length);

    const uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const uploadData = await uploadResp.json();
    console.log('[uploadMidiaMetaTemplate] Resposta Meta:', JSON.stringify(uploadData));

    if (!uploadResp.ok || uploadData.error) {
      const errMsg = uploadData.error?.message || 'Erro ao fazer upload da mídia na Meta';
      return Response.json({ error: errMsg, details: uploadData }, { status: 400 });
    }

    const mediaId = uploadData.id;
    if (!mediaId) return Response.json({ error: 'Meta não retornou ID da mídia' }, { status: 400 });

    return Response.json({ ok: true, media_id: mediaId });
  } catch (error) {
    console.error('[uploadMidiaMetaTemplate] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getMimeType(tipo, url) {
  const ext = url.split('.').pop()?.toLowerCase();
  if (tipo === 'IMAGE') {
    if (ext === 'png') return 'image/png';
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
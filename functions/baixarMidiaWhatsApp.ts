import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mensagem_id, arquivo_url } = await req.json();
    if (!mensagem_id || !arquivo_url) {
      return Response.json({ error: 'Missing params' }, { status: 400 });
    }

    // Baixar arquivo da Evolution (URL com autenticação via query param ou header)
    console.log(`📥 Baixando mídia: ${arquivo_url.substring(0, 100)}...`);
    
    const fetchRes = await fetch(arquivo_url, {
      method: 'GET',
      headers: { 'User-Agent': 'Base44-WhatsApp-CRM' }
    });

    if (!fetchRes.ok) {
      console.error(`❌ Erro ao baixar: ${fetchRes.status}`);
      return Response.json({ error: `Download failed: ${fetchRes.status}` }, { status: 500 });
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: fetchRes.headers.get('content-type') || 'application/octet-stream' });
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Fazer upload para Base44 com base64
    const uploadRes = await base44.integrations.Core.UploadFile({
      file: base64
    });

    if (!uploadRes?.file_url) {
      console.error('❌ Upload falhou');
      return Response.json({ error: 'Upload failed' }, { status: 500 });
    }

    console.log(`✅ Mídia salva: ${uploadRes.file_url}`);

    // Atualizar a mensagem com a nova URL
    await base44.entities.MensagemWhatsapp.update(mensagem_id, {
      arquivo_url: uploadRes.file_url
    });

    return Response.json({ ok: true, arquivo_url: uploadRes.file_url });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
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

    console.log(`📥 Baixando mídia: ${arquivo_url.substring(0, 100)}...`);

    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY') || '';

    // Tentar baixar com API key (necessário para URLs da Evolution API)
    let fetchRes = await fetch(arquivo_url, {
      method: 'GET',
      headers: { 
        'User-Agent': 'Base44-WhatsApp-CRM',
        'apikey': evolutionKey
      }
    });

    // Fallback sem header se falhar
    if (!fetchRes.ok) {
      console.warn(`⚠️ Tentativa com apikey falhou (${fetchRes.status}), tentando sem...`);
      fetchRes = await fetch(arquivo_url, {
        method: 'GET',
        headers: { 'User-Agent': 'Base44-WhatsApp-CRM' }
      });
    }

    if (!fetchRes.ok) {
      console.error(`❌ Erro ao baixar: ${fetchRes.status}`);
      return Response.json({ error: `Download failed: ${fetchRes.status}` }, { status: 500 });
    }

    const contentType = fetchRes.headers.get('content-type') || 'audio/ogg';
    const arrayBuffer = await fetchRes.arrayBuffer();
    
    // Converter para base64 em chunks para evitar stack overflow
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    // Upload para Base44 (storage permanente)
    const uploadRes = await base44.integrations.Core.UploadFile({ file: base64 });

    if (!uploadRes?.file_url) {
      return Response.json({ error: 'Upload failed' }, { status: 500 });
    }

    console.log(`✅ Mídia salva: ${uploadRes.file_url}`);

    // Atualizar a mensagem com a URL permanente
    await base44.entities.MensagemWhatsapp.update(mensagem_id, {
      arquivo_url: uploadRes.file_url
    });

    return Response.json({ ok: true, arquivo_url: uploadRes.file_url });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
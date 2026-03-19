import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { arquivo_url, mensagem_id } = await req.json();
    if (!arquivo_url) {
      return Response.json({ error: 'arquivo_url obrigatório' }, { status: 400 });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return Response.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 500 });
    }

    console.log(`🎙️ Transcrevendo: ${arquivo_url.substring(0, 80)}...`);

    // Baixar o arquivo de áudio
    const fetchRes = await fetch(arquivo_url, {
      headers: { 'User-Agent': 'Base44-WhatsApp-CRM' }
    });

    if (!fetchRes.ok) {
      return Response.json({ error: `Falha ao baixar áudio: ${fetchRes.status}` }, { status: 500 });
    }

    const audioBuffer = await fetchRes.arrayBuffer();
    const contentType = fetchRes.headers.get('content-type') || 'audio/ogg';

    // Determinar extensão do arquivo
    let ext = 'ogg';
    if (contentType.includes('webm')) ext = 'webm';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) ext = 'mp4';
    else if (contentType.includes('mpeg') || contentType.includes('mp3')) ext = 'mp3';
    else if (contentType.includes('wav')) ext = 'wav';

    // Enviar para Whisper API via multipart/form-data
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: contentType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error('❌ Whisper erro:', err);
      return Response.json({ error: `Whisper falhou: ${whisperRes.status}` }, { status: 500 });
    }

    const result = await whisperRes.json();
    const transcricao = result.text || '';

    console.log(`✅ Transcrito: "${transcricao.substring(0, 80)}"`);

    // Salvar transcrição no texto da mensagem se mensagem_id fornecido
    if (mensagem_id && transcricao) {
      await base44.entities.MensagemWhatsapp.update(mensagem_id, {
        texto: transcricao
      });
    }

    return Response.json({ ok: true, transcricao });

  } catch (error) {
    console.error('❌ Erro transcrição:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
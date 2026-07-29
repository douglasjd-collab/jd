import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────────
// Helpers locais — envio agendado multi-API (Meta Oficial ou D-API JD Promotora)
// ─────────────────────────────────────────────────────────────────────────

// Normaliza número BR para E.164 sem "+" (formato Meta/D-API)
function normalizarTelefone(raw: string): string {
  let tel = (raw || '').replace(/\D/g, '');
  if (!tel.startsWith('55') && tel.length >= 10 && tel.length <= 11) tel = '55' + tel;
  return tel;
}

// Busca versão da API Meta configurada para a empresa (fallback v23.0)
async function getMetaApiVersion(base44, empresaId: string): Promise<string> {
  let v = 'v23.0';
  if (!empresaId) return v;
  try {
    const cfg = await base44.asServiceRole.entities.ConfiguracaoSistema.filter(
      { chave: `meta_api_versao_${empresaId}`, empresa_id: empresaId },
      '-created_date',
      1
    );
    if (cfg?.length > 0 && cfg[0].valor) v = cfg[0].valor;
  } catch (_) {}
  return v;
}

// Upload de mídia na Meta Graph API (retorna media_id)
async function uploadMidiaMeta(metaApiVersion: string, phoneNumberId: string, accessToken: string, fileUrl: string, mimeType: string, fileName: string): Promise<{ id: string } | null> {
  try {
    const mediaResp = await fetch(fileUrl);
    if (!mediaResp.ok) return null;
    const buf = await mediaResp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const file = new File([bytes], fileName || `midia_${Date.now()}`, { type: mimeType || 'application/octet-stream' });

    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');
    fd.append('file', file);

    const url = `https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/media`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: fd,
    });
    const txt = await resp.text();
    if (!resp.ok) {
      console.error('Meta media upload falhou:', resp.status, txt);
      return null;
    }
    const data = JSON.parse(txt);
    return data?.id ? { id: data.id } : null;
  } catch (e) {
    console.error('Erro no upload de mídia Meta:', e.message);
    return null;
  }
}

// Envia mensagem via Meta Graph API Oficial (texto, imagem, vídeo ou documento)
async function enviarViaMetaOficial(base44, empresa, conversa, msg, telefone: string, metaApiVersion: string) {
  const accessToken = empresa?.whatsapp_access_token;
  if (!accessToken) throw new Error('Meta access_token não configurado para a empresa');

  // phone_number_id: preferir o da conversa (número que recebeu), fallback da empresa
  const phoneNumberId = conversa?.phone_number_id_meta || empresa?.whatsapp_phone_number_id;
  if (!phoneNumberId) throw new Error('phone_number_id da Meta não configurado (conversa nem empresa)');

  const url = `https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/messages`;
  let payload;
  let tipoConteudo = 'texto';

  if (msg.tipo_envio === 'texto_imagem' && msg.arquivo_url) {
    tipoConteudo = 'imagem';
    const media = await uploadMidiaMeta(metaApiVersion, phoneNumberId, accessToken, msg.arquivo_url, msg.arquivo_tipo || 'image/jpeg', msg.arquivo_nome || 'imagem.jpg');
    if (!media) throw new Error('Falha ao fazer upload da imagem para a Meta');
    const imgObj: any = { id: media.id };
    if (msg.mensagem?.trim()) imgObj.caption = msg.mensagem.trim();
    payload = { messaging_product: 'whatsapp', to: telefone, type: 'image', image: imgObj };
  } else if (msg.tipo_envio === 'texto_video' && msg.arquivo_url) {
    tipoConteudo = 'video';
    const media = await uploadMidiaMeta(metaApiVersion, phoneNumberId, accessToken, msg.arquivo_url, msg.arquivo_tipo || 'video/mp4', msg.arquivo_nome || 'video.mp4');
    if (!media) throw new Error('Falha ao fazer upload do vídeo para a Meta');
    const vidObj: any = { id: media.id };
    if (msg.mensagem?.trim()) vidObj.caption = msg.mensagem.trim();
    payload = { messaging_product: 'whatsapp', to: telefone, type: 'video', video: vidObj };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: { body: msg.mensagem.trim() },
    };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status} da Meta`;
    try { errMsg = JSON.parse(respText)?.error?.message || errMsg; } catch (_) {}
    throw new Error(`Meta: ${errMsg}`);
  }
  const data = JSON.parse(respText);
  const messageId = data?.messages?.[0]?.id || `meta_${Date.now()}`;
  return { messageId, tipoConteudo, provider: 'whatsapp_meta' };
}

// Envia mensagem via D-API (JD Promotora) usando whatsappService
async function enviarViaDapi(base44, empresa, conversa, msg, telefone: string) {
  const conexoesDapi = await base44.asServiceRole.entities.WhatsappConnection.filter(
    {
      empresa_id: msg.empresa_id,
      provider_type: 'dapi',
      is_active: true,
    },
    '-created_date',
    1
  );
  const conexaoDapi = conexoesDapi[0];
  if (!conexaoDapi) throw new Error('Nenhuma conexão D-API ativa encontrada para a empresa');

  let dapiAction = 'sendText';
  let dapiActionParams: any = {};
  let tipoConteudo = 'texto';

  if (msg.tipo_envio === 'texto_imagem' && msg.arquivo_url) {
    dapiAction = 'sendImage';
    dapiActionParams = { imageUrl: msg.arquivo_url, caption: msg.mensagem };
    tipoConteudo = 'imagem';
  } else if (msg.tipo_envio === 'texto_video' && msg.arquivo_url) {
    dapiAction = 'sendVideo';
    dapiActionParams = { videoUrl: msg.arquivo_url, caption: msg.mensagem };
    tipoConteudo = 'video';
  } else {
    dapiAction = 'sendText';
    tipoConteudo = 'texto';
  }

  const respService = await base44.asServiceRole.functions.invoke('whatsappService', {
    connectionId: conexaoDapi.id,
    action: dapiAction,
    phoneNumber: telefone,
    text: msg.mensagem,
    ...dapiActionParams,
  });

  const serviceResult = respService?.data;
  if (!serviceResult?.success) {
    const erroDetalhes = serviceResult?.data?.error || serviceResult?.error || 'Erro desconhecido';
    throw new Error(`D-API error: ${erroDetalhes}`);
  }
  const messageId = serviceResult?.data?.data?.messageId || serviceResult?.data?.messageId || '';
  return { messageId, tipoConteudo, provider: 'dapi' };
}

// ─────────────────────────────────────────────────────────────────────────
// Handler principal — automação agendada
// ─────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const agora = new Date();
    const agoraISO = agora.toISOString();

    const todas = await base44.asServiceRole.entities.MensagemAgendada.filter({ status: 'agendada' }, null, 500);
    const pendentes = todas.filter((m) => m.proxima_execucao && m.proxima_execucao <= agoraISO);

    if (pendentes.length === 0) {
      return Response.json({ ok: true, processadas: 0, mensagem: 'Nenhuma mensagem pendente' });
    }

    let enviadas = 0;
    let falhas = 0;

    for (const msg of pendentes) {
      try {
        const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: msg.empresa_id });
        const empresa = empresas[0];

        if (!empresa) {
          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'falha',
            erro_detalhe: 'Empresa não encontrada',
          });
          falhas++;
          continue;
        }

        // Buscar a conversa (apenas para Meta — D-API não precisa)
        let conversa = null;
        const apiPreferida = msg.api_preferida || 'dapi';
        if (apiPreferida === 'meta_oficial' && msg.conversa_id) {
          try {
            conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(msg.conversa_id);
          } catch (_) {}
        }

        const telefone = normalizarTelefone(msg.telefone || '');

        let resultado;
        if (apiPreferida === 'meta_oficial') {
          const metaApiVersion = await getMetaApiVersion(base44, msg.empresa_id);
          resultado = await enviarViaMetaOficial(base44, empresa, conversa, msg, telefone, metaApiVersion);
        } else {
          resultado = await enviarViaDapi(base44, empresa, conversa, msg, telefone);
        }

        const { messageId, tipoConteudo, provider } = resultado;

        // Registrar mensagem no histórico
        await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: msg.conversa_id,
          empresa_id: msg.empresa_id,
          remetente: 'vendedor',
          usuario_id: msg.responsavel_id || '',
          usuario_nome: msg.responsavel_nome || 'Agendamento automático',
          tipo_conteudo: tipoConteudo,
          texto: msg.mensagem,
          arquivo_url: msg.arquivo_url || '',
          arquivo_nome: msg.arquivo_nome || '',
          provider: provider,
          whatsapp_message_id: messageId,
          data_envio: new Date().toISOString(),
          status: 'enviada',
        });

        // Atualizar última mensagem da conversa
        if (msg.conversa_id) {
          await base44.asServiceRole.entities.ConversaWhatsapp.update(msg.conversa_id, {
            ultima_mensagem: msg.mensagem,
            data_ultima_mensagem: new Date().toISOString(),
            ultimo_remetente: 'vendedor',
          });
        }

        // Recorrente: reagendar para o próximo mês
        if (msg.tipo === 'recorrente' && msg.recorrencia === 'mensal') {
          const proximaData = new Date(msg.proxima_execucao);
          proximaData.setMonth(proximaData.getMonth() + 1);

          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'agendada',
            ultima_execucao: new Date().toISOString(),
            proxima_execucao: proximaData.toISOString(),
          });
        } else {
          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'enviada',
            ultima_execucao: new Date().toISOString(),
          });
        }

        enviadas++;
      } catch (err) {
        console.error(`Erro ao processar msg ${msg.id}:`, err.message);
        await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
          status: 'falha',
          erro_detalhe: err.message,
        });
        falhas++;
      }
    }

    return Response.json({ ok: true, processadas: pendentes.length, enviadas, falhas, timestamp: agoraISO });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
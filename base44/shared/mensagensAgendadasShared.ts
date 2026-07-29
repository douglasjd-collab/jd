// Helpers utilizados pelo agendamento e pelo reenvio manual de mensagens.
// Residem em base44/shared/ para que ambas as funções possam importá-los.
// Todas as credenciais permanecem no backend; nenhum token é retornado.

// Normaliza número BR para E.164 sem "+" (formato Meta/D-API)
export function normalizarTelefone(raw: string): string {
  let tel = (raw || '').replace(/\D/g, '').replace(/@.*$/, '');
  if (!tel.startsWith('55') && tel.length >= 10 && tel.length <= 11) tel = '55' + tel;
  return tel;
}

// Busca versão da API Meta configurada para a empresa (fallback v23.0)
export async function getMetaApiVersion(base44, empresaId: string): Promise<string> {
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

// Encontra conexão ativa da API Oficial (preferindo Cloud API D-API, depois Meta direta)
export async function encontrarConexaoMetaOficialAtiva(base44, empresaId: string): Promise<any | null> {
  if (!empresaId) return null;
  try {
    const conns = await base44.asServiceRole.entities.WhatsappConnection.filter(
      { empresa_id: empresaId, is_active: true },
      '-created_date',
      50
    );
    const cloud = conns.find(
      (c) => c.provider_type === 'dapi' && /^cloud-/i.test(String(c.session_id || '').trim())
    );
    if (cloud) return cloud;
    const meta = conns.find((c) => c.provider_type === 'meta_oficial');
    if (meta) return meta;
    return null;
  } catch (e) {
    console.warn('⚠️ Erro ao buscar conexão ativa da empresa:', e?.message);
    return null;
  }
}

export function descriptografarToken(tokenEncrypted: string): string {
  try {
    const decoded = tokenEncrypted ? atob(tokenEncrypted) : '';
    if (decoded && decoded.length > 20) return decoded.trim();
    return (tokenEncrypted || '').trim();
  } catch (_) {
    return (tokenEncrypted || '').trim();
  }
}

function montarTemplatePayloadDapi(template: any, valuesByPos: Record<string, string>): any {
  const positions = Object.keys(valuesByPos).sort((a, b) => Number(a) - Number(b));
  const bodyVariables = positions.map((p) => valuesByPos[p] || '');

  const payload: any = {
    name: template?.name,
    language: template?.language || 'pt_BR',
    bodyVariables,
  };

  if (template) {
    const headerType = (template.header_type || '').toUpperCase();
    const headerUrl = template.header_media_url || '';
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerUrl) {
      const mediaKey =
        headerType === 'IMAGE' ? 'image' : headerType === 'VIDEO' ? 'video' : 'document';
      payload.headerMedia = { type: mediaKey, url: headerUrl };
    } else if (headerType === 'TEXT' && template.header_text) {
      let txt = template.header_text;
      for (const p of positions) txt = txt.split(`{{${p}}}`).join(valuesByPos[p] || '');
      payload.headerVariable = txt;
    }
  }
  return payload;
}

// ─────────────────────────────────────────────────────────────────────────
// Envia template aprovado via API Oficial Meta. Acha a conexão ativa da empresa
// (Cloud API D-API ou conexão meta_oficial) e usa a mesma integração do Bate-papo.
// ─────────────────────────────────────────────────────────────────────────
export async function enviarViaMetaOficial(
  base44,
  empresa,
  conversa,
  msg,
  telefone: string,
  metaApiVersion: string
) {
  // Template OBRIGATÓRIO para Meta (envio fora da janela de 24h)
  let template: any = null;
  if (msg.template_id) {
    try {
      template = await base44.asServiceRole.entities.WhatsappTemplate.get(msg.template_id);
    } catch (_) {}
  }
  if (msg.template_id && !template) {
    throw new Error(`Template da Meta (id: ${msg.template_id}) não encontrado no CRM.`);
  }
  if (template && template.status !== 'aprovado') {
    throw new Error(
      `Template "${template.name}" não está aprovado (status atual: ${template.status}). Reenvie para análise ou sincronize o status com a Meta.`
    );
  }
  const templateName = template?.name || msg.template_nome;
  const templateLanguage = template?.language || msg.template_language || 'pt_BR';
  if (!templateName) {
    throw new Error(
      'Envio via API Oficial Meta exige um template aprovado. Selecione um template no agendamento.'
    );
  }

  // Variáveis {{1}}, {{2}}... por posição
  const valuesByPos: Record<string, string> = {};
  try {
    const arr = msg.template_variables_json ? JSON.parse(msg.template_variables_json) : [];
    if (Array.isArray(arr)) {
      for (const v of arr) valuesByPos[String(v.position)] = String(v.value ?? '');
    }
  } catch (_) {}

  const logCtx: any = {
    agendamento_id: msg.id,
    empresa_id: msg.empresa_id,
    template_name: templateName,
    template_language: templateLanguage,
    telefone_destino: telefone,
    variaveis_count: Object.keys(valuesByPos).length,
  };

  const conexao = await encontrarConexaoMetaOficialAtiva(base44, msg.empresa_id);

  // ── Caso A: D-API Cloud API → whatsappService.sendTemplate ─────────────
  if (conexao?.provider_type === 'dapi' && /^cloud-/i.test(String(conexao.session_id || '').trim())) {
    logCtx.conexao_id = conexao.id;
    logCtx.session_id = conexao.session_id;

    const templatePayload = montarTemplatePayloadDapi(template, valuesByPos);

    let sr: any;
    try {
      sr = await base44.asServiceRole.functions.invoke('whatsappService', {
        connectionId: conexao.id,
        action: 'sendTemplate',
        phoneNumber: telefone,
        template: templatePayload,
      });
    } catch (e) {
      logCtx.motivo_real = `exceção whatsappService: ${e.message}`;
      console.error('❌ [Agendamento] D-API Cloud exceção:', logCtx);
      throw new Error('D-API Cloud: ' + e.message);
    }

    const srData = sr?.data || {};
    const resultObj = srData?.data || srData;
    const httpStatus = resultObj?.httpStatus || srData?.httpStatus || 0;
    logCtx.http_status = httpStatus;
    const candidateId =
      resultObj?.data?.messageId ||
      resultObj?.messageId ||
      resultObj?.data?.id ||
      resultObj?.data?.message_id ||
      resultObj?.data?.messages?.[0]?.id ||
      resultObj?.id ||
      '';
    logCtx.api_response_id = candidateId;

    if (!resultObj?.success) {
      const errMsg = resultObj?.error || srData?.error || 'Erro no envio';
      logCtx.motivo_real = errMsg;
      console.error('❌ [Agendamento] D-API Cloud erro:', logCtx);
      throw new Error(`D-API Cloud: ${errMsg}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`);
    }

    const messageId = candidateId || `cloud_${Date.now()}`;
    logCtx.message_id = messageId;
    console.log('✅ [Agendamento] Template enviado via D-API Cloud:', logCtx);
    return { messageId, tipoConteudo: 'texto', provider: 'whatsapp_meta', conexaoId: conexao.id, sessionId: conexao.session_id };
  }

  // ── Caso B/C: Graph API direta (conexao meta_oficial OU app secrets) ────
  let accessToken = '';
  let phoneNumberId = '';

  if (conexao?.provider_type === 'meta_oficial') {
    logCtx.conexao_id = conexao.id;
    accessToken = descriptografarToken(conexao.token_encrypted || '');
    phoneNumberId = conexao.session_id || '';
    if (!phoneNumberId && conexao.config_json) {
      try {
        const cfg = JSON.parse(conexao.config_json);
        phoneNumberId = cfg.phone_number_id || cfg.phoneNumberId || '';
      } catch (_) {}
    }
  }
  // Fallback app secrets
  if (!accessToken) accessToken = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN') || '';
  if (!phoneNumberId)
    phoneNumberId = conversa?.phone_number_id_meta || Deno.env.get('META_PHONE_NUMBER_ID') || '';

  if (!accessToken || !phoneNumberId) {
    const err = new Error(
      'Não foi encontrada uma conexão da API Oficial ativa para esta empresa. Conecte uma conexão Cloud API (D-API) em Configurações ou cadastre as credenciais Meta oficiais.'
    );
    logCtx.motivo_real = err.message;
    console.error('❌ [Agendamento] Conexão ativa ausente:', logCtx);
    throw err;
  }

  const components: any[] = [];
  if (template) {
    const headerType = (template.header_type || '').toUpperCase();
    const headerUrl = String(template.header_media_url || '').trim();
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerUrl) {
      const mediaKey =
        headerType === 'IMAGE' ? 'image' : headerType === 'VIDEO' ? 'video' : 'document';
      const isMediaId = /^\d{10,}$/.test(headerUrl);
      let mediaValue: any = null;
      if (isMediaId) {
        mediaValue = { id: headerUrl };
      } else if (headerUrl.startsWith('http')) {
        try {
          const mr = await fetch(headerUrl);
          if (mr.ok) {
            const buf = await mr.arrayBuffer();
            const ct =
              mr.headers.get('content-type') ||
              (headerType === 'VIDEO' ? 'video/mp4' : 'image/jpeg');
            const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('mp4') ? 'mp4' : 'jpg';
            const fd = new FormData();
            fd.append('messaging_product', 'whatsapp');
            fd.append('file', new Blob([buf], { type: ct }), `header.${ext}`);
            const upResp = await fetch(
              `https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/media`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                body: fd,
              }
            );
            const upData = await upResp.json().catch(() => ({}));
            if (upData.id) mediaValue = { id: upData.id };
          }
        } catch (e) {
          console.warn('⚠️ Upload header Meta falhou:', e.message);
        }
      }
      if (mediaValue) {
        components.push({
          type: 'header',
          parameters: [{ type: mediaKey, [mediaKey]: mediaValue }],
        });
      }
    } else if (headerType === 'TEXT' && template.header_text) {
      const hdrVars = (template.header_text.match(/\{\{(\d+)\}\}/g) || []).map((v: string) => v.match(/\d+/)[0]);
      if (hdrVars.length > 0) {
        components.push({
          type: 'header',
          parameters: hdrVars.map((p) => ({ type: 'text', text: valuesByPos[p] || '' })),
        });
      }
    }
  }
  const positions = Object.keys(valuesByPos).sort((a, b) => Number(a) - Number(b));
  if (positions.length > 0) {
    components.push({
      type: 'body',
      parameters: positions.map((p) => ({ type: 'text', text: valuesByPos[p] || '' })),
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: telefone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLanguage },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  const url = `https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const respText = await resp.text();
  logCtx.http_status = resp.status;
  let respData: any = {};
  try {
    respData = JSON.parse(respText);
  } catch (_) {}
  const messageIdResp = respData?.messages?.[0]?.id || '';
  logCtx.api_response_id = messageIdResp;

  if (!resp.ok) {
    const errMsg =
      respData?.error?.error_data?.details ||
      respData?.error?.message ||
      `HTTP ${resp.status} da Meta`;
    logCtx.motivo_real = errMsg;
    console.error('❌ [Agendamento] Graph API falhou:', logCtx);
    throw new Error(`Meta: ${errMsg}`);
  }
  const messageId = messageIdResp || `meta_${Date.now()}`;
  logCtx.message_id = messageId;
  console.log('✅ [Agendamento] Template enviado via Graph API direta:', logCtx);
  return { messageId, tipoConteudo: 'texto', provider: 'whatsapp_meta' };
}

// ─────────────────────────────────────────────────────────────────────────
// Envio via D-API (texto/imagem/vídeo livre) usando whatsappService
// ─────────────────────────────────────────────────────────────────────────
export async function enviarViaDapi(base44, empresa, conversa, msg, telefone: string) {
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
  const messageId =
    serviceResult?.data?.data?.messageId || serviceResult?.data?.messageId || '';
  return { messageId, tipoConteudo, provider: 'dapi' };
}
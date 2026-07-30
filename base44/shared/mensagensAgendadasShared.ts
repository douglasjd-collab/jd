// Helpers utilizados pelo agendamento e pelo reenvio manual de mensagens.
// Residem em base44/shared/ para que ambas as funções possam importá-los.
// Todas as credenciais permanecem no backend; nenhum token é retornado.

import { ehAutoPrimeiroNome, resolverPrimeiroNomeDestinatario } from './primeiroNomeShared.ts';

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

// Busca a definição complementar do template em CampanhaLog
// (tipo 'meta_template_definition', populado pelo sincronizarTemplatesMeta).
// Usada quando o WhatsappTemplate não tem header_type / header_media_url /
// header_media_id preenchidos — caso típico de templates aprovados
// externamente (Meta Business Manager) e importados via sincronização.
// Sem esses campos, o envio para a Meta falha com #132012 ("Parameter
// format does not match format in the created template") por ausência
// do parâmetro de mídia do header aprovado.
async function buscarDefinicaoComplementarTemplate(
  base44,
  empresaId: string,
  templateName: string
): Promise<{
  header_type?: string;
  header_url?: string;
  header_id?: string;
  header_text?: string;
  botoes?: any[];
}> {
  if (!empresaId || !templateName) return {};
  try {
    const defs = await base44.asServiceRole.entities.CampanhaLog.filter({
      empresa_id: empresaId,
      tipo_campanha: 'meta_template_definition',
      cliente_nome: templateName,
    });
    const def = defs?.[0];
    if (def?.motivo_erro) {
      const parsed = JSON.parse(def.motivo_erro || '{}');
      return {
        header_type: parsed.tipo_cabecalho || parsed.header_type || '',
        header_url: parsed.cabecalho_midia_url || parsed.header_url || '',
        header_id: parsed.cabecalho_media_id || '',
        header_text: parsed.cabecalho || '',
        botoes: Array.isArray(parsed.botoes) ? parsed.botoes : [],
      };
    }
  } catch (_) {}
  return {};
}

// Resolve o cabeçalho do template combinando:
//   1) WhatsappTemplate (cadastro local no CRM) — principal
//   2) CampanhaLog meta_template_definition (sincronizado com a Meta) — fallback
// Garante headerType, headerUrl (URL pública/armazenada), headerId (media_id
// permanente da Meta) e headerText (para headers TEXT com {{n}}).
function resolverHeaderTemplate(template: any, defComplementar: any): {
  headerType: string;
  headerUrl: string;
  headerId: string;
  headerText: string;
} {
  return {
    headerType: String(template?.header_type || defComplementar?.header_type || '').toUpperCase(),
    headerUrl: String(template?.header_media_url || defComplementar?.header_url || '').trim(),
    headerId: String(template?.header_media_id || defComplementar?.header_id || '').trim(),
    headerText: template?.header_text || defComplementar?.header_text || '',
  };
}

// Monta o array de components no formato Graph API da Meta (aceito também
// pelo endpoint POST /api/v1/messages/send/template da D-API). Esse formato
// espelha EXATAMENTE o template aprovado pela Meta, evitando o erro #132012.
//
// Regras:
//  - HEADER (VIDEO/IMAGE/DOCUMENT): 1 parâmetro { type: '<tipo>', <tipo>: { link | id } }
//    - Prioridade: media_id (permanente, mesmo WABA) > URL pública (link)
//    - Nunca usar URL Meta CDN privado (exige Auth) sem re-upload
//  - HEADER (TEXT): 1 parâmetro { type: 'text', text } por {{n}} no header
//  - HEADER vazio/NONE: nada a enviar (template não tem header aprovado)
//  - BODY: 1 parâmetro { type: 'text', text } por variável {{n}} (ordem crescente)
//    Cada valor é uma string simples (resolvida antes da chamada — nunca
//    {{1}} cru, null, objeto ou array).
function montarComponentsTemplate(
  template: any,
  defComplementar: any,
  valuesByPos: Record<string, string>
): {
  components: any[];
  headerInfo: ReturnType<typeof resolverHeaderTemplate>;
  mediaPresent: boolean;
} {
  const components: any[] = [];
  const headerInfo = resolverHeaderTemplate(template, defComplementar);
  let mediaPresent = false;

  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerInfo.headerType)) {
    const mediaKey =
      headerInfo.headerType === 'IMAGE'
        ? 'image'
        : headerInfo.headerType === 'VIDEO'
        ? 'video'
        : 'document';
    let mediaValue: any = null;

    // 1) media_id (handle permanente da Meta). Para Graph API direta funciona
    //    nativamente; para D-API Cloud exige que pertença à WABA gerenciada.
    if (headerInfo.headerId && /^\d{10,}$/.test(headerInfo.headerId)) {
      mediaValue = { id: headerInfo.headerId };
    } else if (headerInfo.headerUrl) {
      const isNumericHandle = /^\d{10,}$/.test(headerInfo.headerUrl);
      const isMetaCdn = /fbcdn\.net|fbsbx\.com|graph\.facebook\.com/.test(headerInfo.headerUrl);
      if (isNumericHandle) {
        mediaValue = { id: headerInfo.headerUrl };
      } else if (headerInfo.headerUrl.startsWith('http') && !isMetaCdn) {
        mediaValue = { link: headerInfo.headerUrl };
      }
    }

    if (mediaValue) {
      mediaPresent = true;
      components.push({
        type: 'header',
        parameters: [{ type: mediaKey, [mediaKey]: mediaValue }],
      });
    }
  } else if (headerInfo.headerType === 'TEXT' && headerInfo.headerText) {
    const hdrVars = (headerInfo.headerText.match(/\{\{(\d+)\}\}/g) || []).map(
      (v: string) => v.match(/\d+/)![0]
    );
    if (hdrVars.length > 0) {
      components.push({
        type: 'header',
        parameters: hdrVars.map((p) => ({ type: 'text', text: String(valuesByPos[p] ?? '') })),
      });
    }
    mediaPresent = true;
  } else if (headerInfo.headerType === '' || headerInfo.headerType === 'NONE') {
    mediaPresent = true;
  }

  // BODY — variáveis {{n}} em ordem crescente.
  const positions = Object.keys(valuesByPos).sort((a, b) => Number(a) - Number(b));
  if (positions.length > 0) {
    components.push({
      type: 'body',
      parameters: positions.map((p) => ({ type: 'text', text: String(valuesByPos[p] ?? '') })),
    });
  }

  return { components, headerInfo, mediaPresent };
}

// Validação pré-disparo do template (regra #132012). Retorna lista de violações
// (vazia = OK). Aponta o campo específico que precisa ser corrigido em vez
// de falhar com mensagem genérica.
function validarPreDisparoTemplate(p: {
  template: any;
  valuesByPos: Record<string, string>;
  headerInfo: ReturnType<typeof resolverHeaderTemplate>;
  mediaPresent: boolean;
  templateLanguage: string;
}): string[] {
  const v: string[] = [];

  // 1) Cada variável {{n}} deve ser uma string simples e não-vazia.
  for (const pos of Object.keys(p.valuesByPos)) {
    const val = p.valuesByPos[pos];
    if (val === undefined || val === null || typeof val !== 'string') {
      v.push(`Variável {{${pos}}} não é uma string simples (recebido: ${typeof val})`);
    } else if (val.trim() === '') {
      v.push(`Variável {{${pos}}} está vazia`);
    } else if (/\{\{(\d+)\}\}/.test(val)) {
      v.push(`Variável {{${pos}}} ainda contém marcador cru "{{x}}" — não foi resolvida`);
    }
  }

  // 2) Header aprovado como mídia exige parâmetro de mídia presente.
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(p.headerInfo.headerType) && !p.mediaPresent) {
    v.push(
      `Header aprovado como ${p.headerInfo.headerType} mas sem media_id nem URL pública validada — verifique header_media_id / header_media_url no template "${p.template?.name ?? ''}"`
    );
  }

  // 3) Quantidade de variáveis no BODY do template aprovado deve bater com
  //    as valuesByPos enviadas.
  const bodyVarCountAprovado =
    (p.template?.body_text?.match(/\{\{(\d+)\}\}/g) || []).length || 0;
  const varsEnviadas = Object.keys(p.valuesByPos).length;
  if (bodyVarCountAprovado > 0 && varsEnviadas !== bodyVarCountAprovado) {
    v.push(
      `BODY aprovado tem ${bodyVarCountAprovado} variável(is) mas ${varsEnviadas} valor(es) foi(ram) fornecido(s)`
    );
  }

  // 4) Idioma deve ser uma string não-vazia.
  if (!p.templateLanguage || String(p.templateLanguage).trim() === '') {
    v.push('Idioma do template ausente — preencha template_language');
  }

  return v;
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

  // Resolve variáveis marcadas como automáticas ({{1}} = primeiro nome do
  // destinatário). O front-end grava o marcador __AUTO_PRIMEIRO_NOME__; aqui
  // substituímos pelo primeiro nome real do cliente, com fallback "por aí".
  const posicoesAuto = Object.keys(valuesByPos).filter((p) => ehAutoPrimeiroNome(valuesByPos[p]));
  if (posicoesAuto.length > 0) {
    const { nome, usouFallback } = await resolverPrimeiroNomeDestinatario(
      base44,
      msg.empresa_id,
      msg.cliente_id,
      telefone,
      (conversa as any)?.cliente_nome
    );
    for (const p of posicoesAuto) valuesByPos[p] = nome;
    (msg as any).__auto_primeiro_nome_resolvido = nome;
    (msg as any).__auto_primeiro_nome_usou_fallback = usouFallback;
  }

  const logCtx: any = {
    agendamento_id: msg.id,
    empresa_id: msg.empresa_id,
    template_name: templateName,
    template_language: templateLanguage,
    telefone_destino: telefone,
    variaveis_count: Object.keys(valuesByPos).length,
  };

  // Resolve as variáveis restantes contra o body BRUTO do template para uso
  // no histórico (MensagemWhatsapp.texto). Quando o agendamento antigo salvou
  // um preview ("por aí"), ainda assim aqui reconstruímos a partir do
  // template.body_text original → nunca guardamos "por aí" no histórico.
  function montarTextoResolvido(bodyBruto: string, valores: Record<string, string>): string {
    return (bodyBruto || '').replace(/\{\{(\d+)\}\}/g, (m, n) => valores[n] || m);
  }
  const bodyOrigem = (template && template.body_text) ? template.body_text : (msg.mensagem || '');
  const textoResolvido = montarTextoResolvido(bodyOrigem, valuesByPos);

  // Conexão: prioriza a conexão oficial fixa no agendamento (garante disparo
  // pela mesma conexão escolhida na criação). Se não existir, cai para a
  // conexão ativa padrão da empresa.
  let conexao: any = null;
  if (msg.official_connection_id) {
    try {
      const porId = await base44.asServiceRole.entities.WhatsappConnection.filter(
        { id: msg.official_connection_id },
        null,
        1
      );
      conexao = porId?.[0] || null;
      if (conexao && !conexao.is_active) {
        console.warn('⚠️ [Agendamento] Conexão oficial salva está inativa; usando fallback.', {
          official_connection_id: msg.official_connection_id,
        });
        conexao = null;
      }
    } catch (_) {}
  }
  if (!conexao) conexao = await encontrarConexaoMetaOficialAtiva(base44, msg.empresa_id);

  // ── Caso A: D-API Cloud API → whatsappService.sendTemplate ─────────────
  if (conexao?.provider_type === 'dapi' && /^cloud-/i.test(String(conexao.session_id || '').trim())) {
    logCtx.conexao_id = conexao.id;
    logCtx.session_id = conexao.session_id;

    // Diagnóstico: consulta o esquema sincronizado do template aprobado
    // (CampanhaLog meta_template_definition) e combina com o WhatsappTemplate
    // — garante headerType/header_media_id preenchidos mesmo para templates
    // importados via sincronizarTemplatesMeta, evitando #132012.
    const defComplementar = await buscarDefinicaoComplementarTemplate(
      base44,
      msg.empresa_id,
      templateName
    );
    const { components, headerInfo, mediaPresent } = montarComponentsTemplate(
      template,
      defComplementar,
      valuesByPos
    );

    // Validação pré-disparo — falha com campo específico (sem credenciais).
    const violacoesDapi = validarPreDisparoTemplate({
      template,
      valuesByPos,
      headerInfo,
      mediaPresent,
      templateLanguage,
    });
    if (violacoesDapi.length > 0) {
      const errMsg = `Validação pré-disparo falhou (${violacoesDapi.length}): ${violacoesDapi.join(' | ')}`;
      logCtx.motivo_real = errMsg;
      logCtx.violacoes = violacoesDapi;
      console.error('❌ [Agendamento] D-API Cloud validação falhou:', logCtx);
      throw new Error(errMsg);
    }

    // Log técnico (sem credenciais): schema aprovado + componentes enviados.
    logCtx.template_schema = {
      header_type: headerInfo.headerType,
      header_media_id_present: !!headerInfo.headerId,
      header_url_present: !!headerInfo.headerUrl,
      body_var_count_aprovado:
        (template?.body_text?.match(/\{\{(\d+)\}\}/g) || []).length || 0,
    };
    logCtx.components_enviados = components.map((c) => ({
      type: c.type,
      parameter_types: (c.parameters || []).map((p) => p.type),
    }));
    logCtx.variavel_1_resolvida = valuesByPos['1'] ?? null;

    // Template payload no formato Graph API components — não usa o atalho
    // bodyVariables/headerMedia (que pode divergir do aprovado pela Meta).
    const templatePayload = {
      name: templateName,
      language: templateLanguage,
      components,
    };

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
    // Resposta completa da D-API (sem credenciais/token) para diagnóstico #132012.
    logCtx.dapi_response_full = {
      success: resultObj?.success,
      httpStatus: resultObj?.httpStatus,
      error: resultObj?.error,
      traceId: resultObj?.traceId,
      endpoint: resultObj?.endpoint,
      response_data: resultObj?.data,
    };
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
    return { messageId, tipoConteudo: 'texto', provider: 'whatsapp_meta', conexaoId: conexao.id, sessionId: conexao.session_id, phoneNumberId: (conexao as any)?.session_id || '', textoResolvido };
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

  // Diagnóstico: complementa header com CampanhaLog (sincronizarTemplatesMeta).
  const defComplementarGraph = await buscarDefinicaoComplementarTemplate(
    base44,
    msg.empresa_id,
    templateName
  );
  const headerInfo = resolverHeaderTemplate(template, defComplementarGraph);

  const components: any[] = [];
  let mediaPresentGraph = false;
  let headerUploadErrorGraph: string | null = null;
  let headerUploadedMediaId: string | null = null;

  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerInfo.headerType)) {
    const mediaKey =
      headerInfo.headerType === 'IMAGE'
        ? 'image'
        : headerInfo.headerType === 'VIDEO'
        ? 'video'
        : 'document';
    let mediaValue: any = null;

    // 1) media_id (handle permanente da Meta) — direto, sem re-upload.
    if (headerInfo.headerId && /^\d{10,}$/.test(headerInfo.headerId)) {
      mediaValue = { id: headerInfo.headerId };
      mediaPresentGraph = true;
      logCtx.header_media_source = 'media_id';
    } else if (headerInfo.headerUrl) {
      const isNumericHandle = /^\d{10,}$/.test(headerInfo.headerUrl);
      if (isNumericHandle) {
        mediaValue = { id: headerInfo.headerUrl };
        mediaPresentGraph = true;
        logCtx.header_media_source = 'numeric_handle_in_url';
      } else if (headerInfo.headerUrl.startsWith('http')) {
        try {
          const mr = await fetch(headerInfo.headerUrl);
          if (mr.ok) {
            const buf = await mr.arrayBuffer();
            const ct =
              mr.headers.get('content-type') ||
              (headerInfo.headerType === 'VIDEO' ? 'video/mp4' : 'image/jpeg');
            const ext =
              ct.includes('png') ? 'png' :
              ct.includes('webp') ? 'webp' :
              ct.includes('mp4') ? 'mp4' : 'jpg';
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
            if (upData.id) {
              mediaValue = { id: upData.id };
              mediaPresentGraph = true;
              logCtx.header_media_source = 'upload_url_to_media_id';
              headerUploadedMediaId = upData.id;
            }
          } else {
            headerUploadErrorGraph = `URL header retornou HTTP ${mr.status}`;
            logCtx.header_fetch_error = headerUploadErrorGraph;
          }
        } catch (e) {
          console.warn('⚠️ Upload header Meta falhou:', e.message);
          headerUploadErrorGraph = e.message;
          logCtx.header_upload_error = e.message;
        }
      }
    }
    if (mediaValue) {
      components.push({
        type: 'header',
        parameters: [{ type: mediaKey, [mediaKey]: mediaValue }],
      });
    }
  } else if (headerInfo.headerType === 'TEXT' && headerInfo.headerText) {
    const hdrVars = (headerInfo.headerText.match(/\{\{(\d+)\}\}/g) || []).map((v: string) => v.match(/\d+/)[0]);
    if (hdrVars.length > 0) {
      components.push({
        type: 'header',
        parameters: hdrVars.map((p) => ({ type: 'text', text: valuesByPos[p] || '' })),
      });
    }
    mediaPresentGraph = true; // header TEXT sem mídia é OK
  } else if (headerInfo.headerType === '' || headerInfo.headerType === 'NONE') {
    mediaPresentGraph = true; // sem header aprovado
  }

  // BODY variáveis em ordem crescente.
  const positions = Object.keys(valuesByPos).sort((a, b) => Number(a) - Number(b));
  if (positions.length > 0) {
    components.push({
      type: 'body',
      parameters: positions.map((p) => ({ type: 'text', text: valuesByPos[p] || '' })),
    });
  }

  // Validação pré-disparo (Graph) — aponta campo específico que precisa corrigir.
  const violacoesGraph = validarPreDisparoTemplate({
    template,
    valuesByPos,
    headerInfo,
    mediaPresent: mediaPresentGraph,
    templateLanguage,
  });
  if (violacoesGraph.length > 0) {
    const errMsg = `Validação pré-disparo (Graph) falhou (${violacoesGraph.length}): ${violacoesGraph.join(' | ')}`;
    logCtx.motivo_real = errMsg;
    logCtx.violacoes = violacoesGraph;
    console.error('❌ [Agendamento] Graph API validação falhou:', logCtx);
    throw new Error(errMsg);
  }

  // Log técnico (sem credenciais): schema aprovado + componentes enviados.
  logCtx.template_schema = {
    header_type: headerInfo.headerType,
    header_media_id_present: !!headerInfo.headerId,
    header_url_present: !!headerInfo.headerUrl,
    header_uploaded_media_id: headerUploadedMediaId,
    header_upload_error: headerUploadErrorGraph,
    body_var_count_aprovado:
      (template?.body_text?.match(/\{\{(\d+)\}\}/g) || []).length || 0,
  };
  logCtx.components_enviados = components.map((c) => ({
    type: c.type,
    parameter_types: (c.parameters || []).map((p) => p.type),
  }));
  logCtx.variavel_1_resolvida = valuesByPos['1'] ?? null;

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
  // Resposta completa da Meta (sem credenciais/token) — diagnóstico #132012.
  logCtx.meta_response_full = respData;
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
  return { messageId, tipoConteudo: 'texto', provider: 'whatsapp_meta', conexaoId: conexao?.id || '', sessionId: conexao?.session_id || '', phoneNumberId: phoneNumberId, textoResolvido };
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
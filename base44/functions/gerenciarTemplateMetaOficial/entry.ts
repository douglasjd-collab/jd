import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// Versão da Graph API usada para criar/listar/atualizar templates.
const META_API_VERSION = "v20.0";
const META_BASE_URL = "https://graph.facebook.com";

// D-API (Cloud API oficial) — chave exclusivamente no backend.
const DAPI_BASE_URL = "https://api.d-api.cloud";

function dapiKey(): string {
  const k = Deno.env.get("DAPI_USER_API_KEY");
  if (!k) throw new Error("DAPI_USER_API_KEY não configurado no backend.");
  return k;
}

// Normaliza diferentes formatos de status retornados pela D-API.
function normalizeDapiStatus(raw: any): string {
  const s = String(raw || "").toLowerCase();
  if (["connected", "active", "online", "ready", "open", "authenticated", "authorized"].includes(s)) return "connected";
  return s || "unknown";
}

function isOfficialSession(sess: any): boolean {
  const t = String(sess?.type || sess?.connectionType || sess?.connection_type || "").toLowerCase();
  const p = String(sess?.provider || "").toLowerCase();
  if (t === "cloud_api" || t === "cloud api" || t === "cloudapi") return true;
  if (sess?.isOfficial === true || sess?.is_official === true) return true;
  if (p === "cloud_api" || p === "official" || p === "meta") return true;
  if (String(sess?.connectionMode || "").toLowerCase() === "cloud_api") return true;
  return false;
}

// Extrai dados padronizados de uma sessão da D-API (response GET /api/v1/sessions).
// Estrutura real: { id: 'cloud-xxx', type: 'cloud_api', connectionId, phoneNumber, displayPhoneNumber,
//   meta: { wabaId, phoneNumberId, ... } }  + possíveis variações legacy.
function normalizeDapiSession(sess: any, empresaId?: string | null): any {
  const meta = sess?.meta || {};
  const phone = sess?.displayPhoneNumber || sess?.phoneNumber || sess?.phone_number || "";
  const sid = sess?.id || sess?.sessionId || "";
  return {
    sessionId: sid,
    uuid: sess?.connectionId || sess?.uuid || sess?.id || "",
    name: sess?.name || sess?.profileName || sess?.verified_name || sess?.verifiedName || (phone ? `Cloud API ${phone}` : sid),
    type: "cloud_api",
    provider: "dapi",
    status: normalizeDapiStatus(sess?.status),
    wabaId: meta.wabaId || sess?.wabaId || sess?.waba_id || "",
    phoneNumberId: meta.phoneNumberId || sess?.phoneNumberId || sess?.phone_number_id || "",
    businessId: meta.businessId || sess?.businessId || sess?.business_id || null,
    displayPhoneNumber: phone,
    verifiedName: sess?.verifiedName || sess?.verified_name || sess?.profileName || "",
    isOfficial: true,
  };
}

// Converte um nome amigável em nome válido para template da Meta:
// minúsculo, underline, sem acentos/espaços/caracteres especiais.
function normalizeName(raw: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Monta o array de components exigido pela Meta a partir do template salvo no CRM.
function buildComponents(template: any): any[] {
  const components: any[] = [];
  let examples: any[] = [];
  try { examples = JSON.parse(template.variables_json || "[]"); } catch {}
  const bodyExamples = examples
    .filter((v) => v.component === "BODY")
    .sort((a, b) => a.position - b.position)
    .map((v) => v.example_value || "");

  // HEADER (TEXT, IMAGE ou VIDEO)
  if (template.type === "IMAGE" || template.header_type === "IMAGE") {
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: template.header_media_id ? { header_handle: [template.header_media_id] } : undefined,
    });
  } else if (template.type === "VIDEO" || template.header_type === "VIDEO") {
    components.push({
      type: "HEADER",
      format: "VIDEO",
      example: template.header_media_id ? { header_handle: [template.header_media_id] } : undefined,
    });
  } else if (template.header_text) {
    components.push({ type: "HEADER", format: "TEXT", text: template.header_text });
  }

  // BODY
  if (template.body_text) {
    const c: any = { type: "BODY", text: template.body_text };
    if (bodyExamples.length > 0) {
      c.example = { body_text: [bodyExamples] };
    }
    components.push(c);
  }

  // FOOTER — sem variáveis permitidas
  if (template.footer_text) {
    components.push({ type: "FOOTER", text: template.footer_text });
  }

  // BUTTONS
  let buttons: any[] = [];
  try { buttons = JSON.parse(template.buttons_json || "[]"); } catch {}
  if (buttons.length > 0) {
    const metaButtons = buttons.map((b) => {
      if (b.type === "QUICK_REPLY") {
        return { type: "QUICK_REPLY", text: b.text };
      }
      if (b.type === "URL") {
        return { type: "URL", text: b.text, url: b.url };
      }
      if (b.type === "PHONE_NUMBER") {
        return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
      }
      return null;
    }).filter(Boolean);
    if (metaButtons.length > 0) {
      components.push({ type: "BUTTONS", buttons: metaButtons });
    }
  }

  return components;
}

// Mapeia o status retornado pela Meta para o status interno do CRM.
function mapMetaStatusToCrm(metaStatus: string): string {
  const mapping: Record<string, string> = {
    APPROVED: "aprovado",
    REJECTED: "rejeitado",
    PENDING: "em_analise",
    IN_APPEAL: "em_analise",
    PAUSED: "pausado",
    DISABLED: "desativado",
  };
  return mapping[(metaStatus || "").toUpperCase()] || "em_analise";
}

// Deriva o tipo (TEXT/IMAGE/VIDEO) e header_type a partir dos components locais.
function deriveTypeFromComponents(comps: any[]): { type: string; header_type: string } {
  const header = (comps || []).find((c: any) => c.type === "HEADER");
  if (header) {
    if (header.format === "IMAGE") return { type: "IMAGE", header_type: "IMAGE" };
    if (header.format === "VIDEO") return { type: "VIDEO", header_type: "VIDEO" };
    if (header.format === "TEXT") return { type: "TEXT", header_type: "TEXT" };
  }
  return { type: "TEXT", header_type: "NONE" };
}

// Extrai body_text / footer_text / buttons / header_text dos components
function extractTextsFromComponents(comps: any[]) {
  const out: any = { body_text: "", footer_text: "", header_text: "", buttons: [] };
  for (const c of comps || []) {
    if (c.type === "BODY" && typeof c.text === "string") out.body_text = c.text;
    if (c.type === "FOOTER" && typeof c.text === "string") out.footer_text = c.text;
    if (c.type === "HEADER" && c.format === "TEXT" && typeof c.text === "string") out.header_text = c.text;
    if (c.type === "BUTTONS" && Array.isArray(c.buttons)) out.buttons = c.buttons;
  }
  return out;
}

// Lista TODOS os templates de uma WABA com paginação (limite de paginação ~100).
async function listWabaTemplates(wabaId: string, token: string): Promise<any[]> {
  const all: any[] = [];
  let url: string | null =
    `${META_BASE_URL}/${META_API_VERSION}/${wabaId}/message_templates?limit=250`;
  let guard = 0;
  while (url && guard < 20) {
    guard++;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data?.data)) all.push(...data.data);
    url = data?.paging?.next || null;
  }
  return all;
}

// Sincroniza: importa templates da Meta que ainda não existem no CRM.
// Reúne todas as conexões oficiais da empresa com waba_id resolvido,
// conforme especificado: "Caso o template exista na Meta e não exista no
// banco do CRM, importá-lo automaticamente."
async function syncTemplatesFromMeta(
  empresaId: string,
  b44: any,
): Promise<{
  imported: number;
  totalInMeta: number;
  totalInCrm: number;
}> {
  // Identifica wabas disponíveis (de empresa + conexões oficiais)
  const wabaSet = new Set<string>();
  let fallbackConnectionId: string | null = null;
  let fallbackConnName = "";

  // 1) Token da empresa e waba diretamente cadastrado
  let token: string | null = null;
  if (empresaId) {
    try {
      const empresas = await b44.asServiceRole.entities.Empresa.filter({ id: empresaId });
      const emp = empresas?.[0];
      if (emp?.whatsapp_business_account_id) wabaSet.add(emp.whatsapp_business_account_id);
      if (emp?.whatsapp_access_token) token = emp.whatsapp_access_token;
    } catch {}
  }
  if (!token) {
    try { token = await getToken(empresaId, b44); } catch {}
  }

  // 2) Conexões oficiais da empresa (D-API ou Meta oficial)
  const connFilter = empresaId ? { empresa_id: empresaId } : {};
  const connections = await b44.entities.WhatsappConnection.filter(connFilter, null, 200);
  for (const c of connections || []) {
    if (c.provider_type !== "meta_oficial" && c.provider_type !== "dapi") continue;
    if (!fallbackConnectionId) {
      fallbackConnectionId = c.id;
      fallbackConnName = c.nome;
    }
    let cfg: any = {};
    try { cfg = JSON.parse(c.config_json || "{}"); } catch {}
    if (cfg?.wabaId) wabaSet.add(cfg.wabaId);
  }

  if (wabaSet.size === 0 || !token) {
    // Sem WABA ou sem token — não há o que sincronizar.
    const existing = await b44.entities.WhatsappTemplate.filter(
      empresaId ? { empresa_id: empresaId } : {},
      null,
      500,
    );
    return { imported: 0, totalInMeta: 0, totalInCrm: existing.length };
  }

  // Templates já cadastrados no CRM (empresa)
  const crmTemplates = await b44.entities.WhatsappTemplate.filter(
    empresaId ? { empresa_id: empresaId } : {},
    null,
    500,
  );
  const crmIndex = new Set(
    crmTemplates.map((t) => `${(t.name || "").toLowerCase()}|${(t.language || "pt_BR").toLowerCase()}`),
  );

  // Coleta todos os templates de cada WABA
  const allMetaTemplates: any[] = [];
  for (const wabaId of wabaSet) {
    try {
      const items = await listWabaTemplates(wabaId, token!);
      allMetaTemplates.push(...items);
    } catch {}
  }

  const toCreate: any[] = [];
  const defaultConn = fallbackConnectionId || connections?.[0]?.id || null;
  const defaultConnName = fallbackConnName || connections?.[0]?.nome || "";

  for (const m of allMetaTemplates) {
    const name = (m.name || "").toLowerCase();
    if (!name) continue;
    const language = m.language || "pt_BR";
    const key = `${name}|${language}`;
    if (crmIndex.has(key)) {
      // Atualiza meta_template_id / status se faltarem (preserva dados do CRM)
      const existing = crmTemplates.find(
        (t) => (t.name || "").toLowerCase() === name && (t.language || "") === language,
      );
      if (existing && !existing.meta_template_id && m.id) {
        try {
          await b44.entities.WhatsappTemplate.update(existing.id, {
            meta_template_id: m.id,
            status: mapMetaStatusToCrm(m.status),
            last_synced_at: new Date().toISOString(),
          });
        } catch {}
      }
      continue;
    }
    // Criar novo template importado da Meta
    const components = Array.isArray(m.components) ? m.components : [];
    const { type, header_type } = deriveTypeFromComponents(components);
    const texts = extractTextsFromComponents(components);
    toCreate.push({
      empresa_id: empresaId,
      connection_id: defaultConn,
      connection_nome: defaultConnName,
      name: m.name,
      display_name: m.name,
      meta_template_id: m.id,
      language: m.language,
      category: m.category || "UTILITY",
      type,
      header_type,
      header_text: type === "TEXT" ? texts.header_text : null,
      body_text: texts.body_text,
      footer_text: texts.footer_text,
      buttons_json: JSON.stringify(texts.buttons || []),
      components_json: JSON.stringify(components),
      status: mapMetaStatusToCrm(m.status),
      quality_rating: m.quality_rating || null,
      rejection_reason: m.rejected_reason || null,
      submitted_at: m.created_time ? new Date(m.created_time).toISOString() : null,
      last_synced_at: new Date().toISOString(),
      created_by_id: null,
      created_by_nome: "Importado da Meta",
    });
  }

  if (toCreate.length > 0) {
    try {
      await b44.entities.WhatsappTemplate.bulkCreate(toCreate);
    } catch {
      // Em caso de erro de bulk, tenta criar individualmente
      for (const t of toCreate) {
        try { await b44.entities.WhatsappTemplate.create(t); } catch {}
      }
    }
    await b44.entities.WhatsappTemplateLog.create({
      empresa_id: empresaId,
      template_id: null,
      action: "sincronizar_status",
      previous_status: null,
      new_status: "importado",
      request_json: JSON.stringify({ action: "sync_templates_from_meta", count: toCreate.length }),
      response_json: JSON.stringify({ imported: toCreate.length }),
      user_id: empresaId,
      user_name: "system",
    }).catch(() => {});
  }

  return {
    imported: toCreate.length,
    totalInMeta: allMetaTemplates.length,
    totalInCrm: crmTemplates.length + toCreate.length,
  };
}

const tokenCache: Record<string, string> = {};

async function getToken(empresaId?: string | null, b44?: any): Promise<string> {
  if (empresaId && tokenCache[empresaId]) return tokenCache[empresaId];
  // 1) Token gravado pela empresa (Meta Embedded Signup)
  if (b44 && empresaId) {
    try {
      const empresas = await b44.asServiceRole.entities.Empresa.filter({ id: empresaId });
      const emp = empresas?.[0];
      if (emp?.whatsapp_access_token) {
        tokenCache[empresaId] = emp.whatsapp_access_token;
        return emp.whatsapp_access_token;
      }
    } catch {}
  }
  // 2) Fallback: token global da app
  const token = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN");
  if (!token) {
    throw new Error("Sem credencial de acesso à API Oficial da Meta. Conecte via Meta Embedded Signup ou configure META_WHATSAPP_ACCESS_TOKEN.");
  }
  if (empresaId) tokenCache[empresaId] = token;
  return token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const action = body?.action;
    const perfil = (user.perfil || user.role || "").toLowerCase();

    // ----------------------------------------------------------------
    // list_dapi_sessions — busca sessões Cloud API da D-API e sincroniza
    // o banco do CRM (WhatsappConnection), retornando apenas conexões
    // oficiais ativas. Reutiliza a API Key do backend (DAPI_USER_API_KEY).
    // ----------------------------------------------------------------
    async function fetchDapiSessions(): Promise<any[]> {
      const apiKey = dapiKey();
      const res = await fetch(`${DAPI_BASE_URL}/api/v1/sessions`, {
        headers: { Authorization: apiKey, Accept: "application/json" },
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error("AUTH_DAPI_INVALID");
      }
      if (res.status === 500 || res.status === 502 || res.status === 503) {
        throw new Error("DAPI_TEMP_FAILURE");
      }
      if (!res.ok) {
        throw new Error(`DAPI_HTTP_${res.status}`);
      }
      const json = await res.json().catch(() => []);
      const list = json?.data || json?.sessions || json || [];
      const arr = Array.isArray(list) ? list : [];
      return arr.filter(isOfficialSession);
    }

    async function syncDapiSessionsIntoCrm(empresaId: string | null): Promise<any[]> {
      const sessions = await fetchDapiSessions();
      const apiKey = dapiKey();
      // GET por sessão para capturar campos detalhados (phoneNumber, wabaId, phoneNumberId)
      const enriched: any[] = [];
      for (const s of sessions) {
        const sid = s?.id || s?.sessionId;
        if (!sid) continue;
        let detail = s;
        try {
          const r = await fetch(`${DAPI_BASE_URL}/api/v1/sessions/${encodeURIComponent(sid)}`, {
            headers: { Authorization: apiKey },
          });
          if (r.ok) {
            const j = await r.json().catch(() => ({}));
            detail = j?.session || j || s;
          }
        } catch {}
        enriched.push(detail);
      }
      const normalized = enriched.map((s) => normalizeDapiSession(s, empresaId));

      // Buscar todas conexões D-API ativas da empresa (por session_id)
      const existing = await base44.asServiceRole.entities.WhatsappConnection.filter(
        { provider_type: "dapi" },
        null,
        300,
      );
      const byEmpresa = empresaId ? existing.filter((c) => c.empresa_id === empresaId) : existing;

      const result: any[] = [];
      for (const ns of normalized) {
        if (!ns.sessionId) continue;
        const matched = byEmpresa.find((c) => c.session_id === ns.sessionId);
        const cfg = JSON.stringify({
          uuid: ns.uuid,
          readable_session_id: ns.sessionId,
          wabaId: ns.wabaId,
          phoneNumberId: ns.phoneNumberId,
          businessId: ns.businessId,
          provider: "dapi",
          mode: "cloud_api",
          isOfficial: true,
        });
        const nomeFinal = ns.verifiedName || ns.name || `Cloud API ${ns.displayPhoneNumber || ns.sessionId.slice(0, 12)}`;
        const base: any = {
          nome: nomeFinal,
          phone_number: ns.displayPhoneNumber || "",
          profile_name: ns.verifiedName || "",
          status: "conectado",
          is_active: true,
          config_json: cfg,
          last_health_check_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error_at: null,
          last_error_message: null,
        };
        if (matched) {
          await base44.asServiceRole.entities.WhatsappConnection.update(matched.id, base);
          matched.nome = nomeFinal;
          result.push({ ...matched, ...base });
        } else {
          const created = await base44.asServiceRole.entities.WhatsappConnection.create({
            empresa_id: empresaId || "",
            provider_type: "dapi",
            base_url: DAPI_BASE_URL,
            session_id: ns.sessionId,
            ...base,
          });
          result.push(created);
        }
      }
      return result;
    }

    // ----------------------------------------------------------------
    // list_connections — lista conexões oficiais (D-API Cloud API ou Meta
    // Embedded Signup) sincronizadas com o banco do CRM, prontas para uso
    // no gerenciador de templates.
    // ----------------------------------------------------------------
    if (action === "list_connections") {
      const ativas: any[] = [];

      // 1) Conexões D-API já salvas no CRM
      try {
        const connsDapi = await base44.entities.WhatsappConnection.filter({ provider_type: "dapi" } as any, null, 300);
        for (const c of connsDapi) {
          if (user.empresa_id && c.empresa_id !== user.empresa_id) continue;
          if (c.status !== "conectado") continue;
          let cfg: any = {};
          try { cfg = JSON.parse(c.config_json || "{}"); } catch {}
          ativas.push({
            id: c.id,
            nome: c.nome,
            phone_number: c.phone_number,
            status: c.status,
            provider_type: c.provider_type,
            session_id: cfg.readable_session_id || c.session_id || "",
            waba_id: cfg.wabaId || "",
            phone_number_id: cfg.phoneNumberId || "",
            config_json: c.config_json,
            is_official: true,
          });
        }
      } catch {}

      // 2) Conexão automática (Meta Embedded Signup) — fallback quando a empresa
      //    já tem credenciais salvas mas ainda não foi criada como WhatsappConnection.
      if (user.empresa_id) {
        try {
          const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: user.empresa_id });
          const emp = empresas?.[0];
          if (emp && emp.whatsapp_conectado && emp.whatsapp_access_token && emp.whatsapp_business_account_id && emp.whatsapp_phone_number_id) {
            const jaExiste = ativas.find((c) => {
              let cfg: any = {};
              try { cfg = JSON.parse(c.config_json || "{}"); } catch {}
              return cfg.wabaId === emp.whatsapp_business_account_id;
            });
            if (!jaExiste) {
              const cfg = JSON.stringify({ wabaId: emp.whatsapp_business_account_id, phoneNumberId: emp.whatsapp_phone_number_id, isOfficial: true });
              const nova = await base44.asServiceRole.entities.WhatsappConnection.create({
                empresa_id: user.empresa_id,
                nome: `WhatsApp Oficial — ${emp.meta_verified_name || emp.meta_display_phone_number || "Empresa"}`,
                provider_type: "meta_oficial",
                phone_number: emp.meta_display_phone_number || "",
                status: "conectado",
                config_json: cfg,
                is_active: true,
              });
              ativas.push({
                id: nova.id,
                nome: nova.nome,
                phone_number: nova.phone_number,
                status: nova.status,
                provider_type: "meta_oficial",
                session_id: "",
                waba_id: emp.whatsapp_business_account_id,
                phone_number_id: emp.whatsapp_phone_number_id,
                config_json: cfg,
                is_official: true,
              });
            }
          }
        } catch {}
      }

      return Response.json({ connections: ativas });
    }

    // ----------------------------------------------------------------
    // sync_dapi — força nova consulta à D-API e sincroniza o banco,
    // retornando as conexões oficiais atualizadas.
    // ----------------------------------------------------------------
    if (action === "sync_dapi") {
      let synced: any[] = [];
      let errorMsg: string | null = null;
      try {
        synced = await syncDapiSessionsIntoCrm(user.empresa_id);
      } catch (e: any) {
        if (e?.message === "AUTH_DAPI_INVALID") errorMsg = "Não foi possível autenticar na D-API. Verifique a API Key configurada no backend.";
        else if (e?.message === "DAPI_TEMP_FAILURE") errorMsg = "A D-API apresentou uma falha temporária.";
        else errorMsg = e?.message || "Erro ao sincronizar conexões da D-API.";
        return Response.json({ success: false, error: errorMsg, connections: [] }, { status: 502 });
      }
      // Reaproveitar o mesmo shape de list_connections
      const out = synced.map((c) => {
        let cfg: any = {};
        try { cfg = JSON.parse(c.config_json || "{}"); } catch {}
        return {
          id: c.id,
          nome: c.nome,
          phone_number: c.phone_number,
          status: c.status,
          provider_type: c.provider_type,
          session_id: cfg.readable_session_id || c.session_id || "",
          waba_id: cfg.wabaId || "",
          phone_number_id: cfg.phoneNumberId || "",
          config_json: c.config_json,
          is_official: true,
        };
      });
      return Response.json({
        success: true,
        connections: out,
        message: out.length > 0 ? "Conexões da API Oficial atualizadas." : "Nenhuma sessão Cloud API foi encontrada na conta da D-API.",
      });
    }

    // ----------------------------------------------------------------
    // debug_dapi_session — diagnóstico: retorna o payload bruto da sessão
    // ----------------------------------------------------------------
    if (action === "debug_dapi_session") {
      const apiKey = dapiKey();
      const listRes = await fetch(`${DAPI_BASE_URL}/api/v1/sessions`, { headers: { Authorization: apiKey } });
      const listJson = await listRes.json().catch(() => ({}));
      const list = listJson?.data || listJson?.sessions || listJson || [];
      const arr = Array.isArray(list) ? list : [];
      const out: any[] = [];
      for (const s of arr) {
        const sid = s?.id || s?.sessionId;
        if (!sid) continue;
        const r = await fetch(`${DAPI_BASE_URL}/api/v1/sessions/${encodeURIComponent(sid)}`, { headers: { Authorization: apiKey } });
        const j = await r.json().catch(() => ({}));
        const raw = j?.session || j;
        out.push({ sid, status: r.status, keys: Object.keys(raw || {}), phone: raw?.phoneNumber || raw?.phone_number || raw?.displayPhoneNumber || null, waba: raw?.wabaId || raw?.waba_id || null, meta: raw?.meta || null, business: raw?.business || raw?.businessId || null });
      }
      return Response.json({ details: out });
    }

    // ----------------------------------------------------------------
    // test_dapi — valida que a D-API responde e a API Key é válida.
    // ----------------------------------------------------------------
    if (action === "test_dapi") {
      try {
        const sessions = await fetchDapiSessions();
        return Response.json({ success: true, message: "D-API conectada com sucesso.", sessions: sessions.length });
      } catch (e: any) {
        if (e?.message === "AUTH_DAPI_INVALID") {
          return Response.json({ success: false, message: "API Key da D-API inválida ou sem permissão." }, { status: 401 });
        }
        return Response.json({ success: false, message: e?.message || "A D-API apresentou uma falha temporária." }, { status: 502 });
      }
    }

    // ----------------------------------------------------------------
    // check_name_duplicate — verifica nome+idioma dentro do WABA (CRM + Meta)
    // ----------------------------------------------------------------
    if (action === "check_name_duplicate") {
      const { name, language } = body;
      const normalized = normalizeName(name);
      const noCRM = await base44.entities.WhatsappTemplate.filter({
        empresa_id: user.empresa_id,
        name: normalized,
        language: language || "pt_BR",
      }, null, 200);
      // Verificamos também junto à Meta, na mesma WABA passada
      const waba_id = body.waba_id;
      if (waba_id) {
        const token = await getToken();
        const url = `${META_BASE_URL}/${META_API_VERSION}/${waba_id}/message_templates?name=${encodeURIComponent(normalized)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        const metaExiste = Array.isArray(data?.data) && data.data.length > 0;
        return Response.json({
          exists: noCRM.length > 0 || metaExiste,
          crm_exists: noCRM.length > 0,
          meta_exists: metaExiste,
          normalized,
        });
      }
      return Response.json({ exists: noCRM.length > 0, crm_exists: noCRM.length > 0, meta_exists: false, normalized });
    }

    // ----------------------------------------------------------------
    // Helper: diagnosticar fields da conexão para envio de template.
    // Retorna checks ✓/✗ de cada campo necessário + WABA/phoneNumberId
    // resolvidos (se possível) e a empresa como fallback.
    // ----------------------------------------------------------------
    async function diagnosticarConexao(template: any, b44: any) {
      const session_id = (template.session_id || "").trim();
      const connection_id = template.connection_id || "";

      let conn: any = null;
      if (connection_id) {
        try { conn = await b44.entities.WhatsappConnection.get(connection_id); } catch {}
      }
      const phone_number = (conn?.phone_number || template.phone_number || "").trim();
      const connStatus = (conn?.status || "").toLowerCase();

      let cfg: any = {};
      try { cfg = JSON.parse(conn?.config_json || "{}"); } catch {}

      // Tentativa 1: dados no template
      let waba_id = (template.waba_id || "").trim();
      let phone_number_id = (template.phone_number_id || "").trim();

      // Tentativa 2: múltiplas variações de nome (config + conexão)
      const lookupWaba = (src: any): string =>
        String(
          src?.wabaId ?? src?.waba_id ?? src?.whatsappBusinessAccountId ??
          src?.whatsapp_business_account_id ?? src?.metadata?.wabaId ??
          src?.metadata?.waba_id ?? src?.cloudApi?.wabaId ?? src?.cloudApi?.waba_id ?? ""
        ).trim();
      const lookupPhone = (src: any): string =>
        String(
          src?.phoneNumberId ?? src?.phone_number_id ?? src?.whatsappPhoneNumberId ??
          src?.whatsapp_phone_number_id ?? src?.metadata?.phoneNumberId ??
          src?.metadata?.phone_number_id ?? src?.cloudApi?.phoneNumberId ?? src?.cloudApi?.phone_number_id ?? ""
        ).trim();
      if (!waba_id) waba_id = lookupWaba(cfg) || lookupWaba(conn);
      if (!phone_number_id) phone_number_id = lookupPhone(cfg) || lookupPhone(conn);

      // Tentativa 3: empresa (Meta Embedded Signup)
      let empresa_waba = "";
      let empresa_phone = "";
      if (template.empresa_id) {
        try {
          const empresas = await b44.asServiceRole.entities.Empresa.filter({ id: template.empresa_id });
          const emp = empresas?.[0];
          if (emp?.whatsapp_business_account_id) empresa_waba = String(emp.whatsapp_business_account_id).trim();
          if (emp?.whatsapp_phone_number_id) empresa_phone = String(emp.whatsapp_phone_number_id).trim();
          if (!waba_id && empresa_waba) waba_id = empresa_waba;
          if (!phone_number_id && empresa_phone) phone_number_id = empresa_phone;
        } catch {}
      }
      // Tentativa 4: env fallback (META_WABA_ID / META_PHONE_NUMBER_ID) — usado quando
      // não há vínculo manual nem Embedded Signup.
      if (!waba_id) waba_id = Deno.env.get("META_WABA_ID") || "";
      if (!phone_number_id) phone_number_id = Deno.env.get("META_PHONE_NUMBER_ID") || "";

      const checks: { label: string; ok: boolean; valor: string }[] = [
        { label: "Sessão Cloud API", ok: !!session_id, valor: session_id || "não localizado" },
        { label: "Conexão ativa", ok: connStatus === "conectado", valor: connStatus ? `status=${connStatus}` : "sem registro de conexão" },
        { label: "Número encontrado", ok: !!phone_number, valor: phone_number || "não localizado" },
        { label: "WABA ID", ok: !!waba_id, valor: waba_id || "não localizado" },
        { label: "Phone Number ID", ok: !!phone_number_id, valor: phone_number_id || "não localizado" },
      ];

      return { waba_id, phone_number_id, conn, cfg, checks, empresa_waba, empresa_phone };
    }

    // ----------------------------------------------------------------
    // send_to_meta — cria o template na Meta e marca status em_analise.
    // Antes de chamar a Meta, garante waba_id/phone_number_id resolvidos:
    // template → config da conexão → empresa (Meta Embedded Signup).
    // Se ainda assim faltar WABA, devolve diagnóstico granular.
    // ----------------------------------------------------------------
    if (action === "send_to_meta" || action === "tentar_enviar_novamente") {
      const { template_id } = body;
      const template = await base44.entities.WhatsappTemplate.get(template_id);
      if (!template) return Response.json({ error: "Template não encontrado" }, { status: 404 });
      if (template.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master") {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }

      await base44.entities.WhatsappTemplate.update(template_id, {
        status: "enviando",
        submitted_at: new Date().toISOString(),
        rejection_reason: null,
      });

      // Passo 1: diagnóstico + resolução completa dos campos da conexão.
      const diag = await diagnosticarConexao(template, base44);
      let wabaId = diag.waba_id;
      let phoneNumberId = diag.phone_number_id;

      // Persiste no template os campos resolvidos (acelera próximos envios)
      const updatesCampos: any = {};
      if (wabaId && wabaId !== (template.waba_id || "")) updatesCampos.waba_id = wabaId;
      if (phoneNumberId && phoneNumberId !== (template.phone_number_id || "")) updatesCampos.phone_number_id = phoneNumberId;
      if (Object.keys(updatesCampos).length > 0) {
        try { await base44.entities.WhatsappTemplate.update(template_id, updatesCampos); } catch {}
      }

      // Passo 2: se ainda falta WABA, NÃO bloqueia em mensagem genérica —
      // devolve o diagnóstico com checks ✓/✗ para o usuário/suporte.
      if (!wabaId) {
        const faltando = diag.checks.filter((c) => !c.ok).map((c) => c.label);
        const motivo = `Falha ao criar template. Verificação da conexão: ${faltando.join(", ")} ausente(s). Clique em "Sincronizar conexão" para atualizar os dados.`;
        await base44.entities.WhatsappTemplate.update(template_id, {
          status: "erro_envio",
          rejection_reason: motivo,
        });
        await base44.entities.WhatsappTemplateLog.create({
          empresa_id: template.empresa_id,
          template_id,
          action: "enviar_aprovacao",
          previous_status: "enviando",
          new_status: "erro_envio",
          error_message: motivo,
          request_json: JSON.stringify({ checks: diag.checks }),
          user_id: user.id,
          user_name: user.full_name,
        });
        return Response.json(
          {
            error: "Conexão incompleta",
            http_status: 400,
            meta_message: motivo,
            diagnostico: {
              checks: diag.checks,
              fonte_waba: diag.empresa_waba ? " empresa (Embedded Signup)" : "",
              sugestao: "Abra 'Robôs e Integrações' → 'Meta (Embedded Signup)' para vincular a conta WhatsApp Business, ou sincronize a conexão D-API.",
            },
          },
          { status: 400 },
        );
      }

      const components = buildComponents(template);
      const payload = {
        name: template.name,
        language: template.language,
        category: template.category,
        components,
      };

      // token já declarado acima (preferência: token da conexão)
      try {
        const urlCriacao = `${META_BASE_URL}/${META_API_VERSION}/${wabaId}/message_templates`;
        const res = await fetch(urlCriacao, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        // Log completo da requisição (sem expor Authorization/Token)
        await base44.entities.WhatsappConnectionLog.create({
          empresa_id: template.empresa_id,
          connection_id: template.connection_id || null,
          event_type: "message.sent",
          direction: "outbound",
          payload_json: JSON.stringify({
            templateProvider, url: urlCriacao, method: "POST",
            waba_id: wabaId, http_status: res.status,
            template_id, template_name: template.name,
            user_id: user.id, user_name: user.full_name,
          }),
          response_json: JSON.stringify(data),
          error_message: res.ok ? null : (data?.error?.message || `HTTP ${res.status}`),
          created_at: new Date().toISOString(),
        }).catch(() => {});

        // --- Ramo de ERRO ---
        if (!res.ok) {
          const metaErr = data?.error || null;
          const metaMsg =
            (metaErr?.message && String(metaErr.message)) ||
            (data?.error?.error_user_msg && String(data.error.error_user_msg)) ||
            "";
          const metaCode = metaErr?.code ? Number(metaErr.code) : null;
          const subCode = metaErr?.error_subcode ? Number(metaErr.error_subcode) : null;
          // Conflito (nome/idioma duplicados) — Meta normalmente responde 400
          // com subcode 2312001, ou mensagem contendo "already existe"/"duplicate"/"já existe".
          const isDuplicate =
            (metaCode === 400 &&
              (/already exist|já existe|duplicate|duplicad|name has been used/i.test(metaMsg) ||
                subCode === 2312001)) ||
            (metaMsg || "").toLowerCase().includes("already exists");

          const httpStatus = isDuplicate
            ? 409
            : res.status === 401 || res.status === 400 || res.status === 500
              ? res.status
              : 502;

          const motivo = `HTTP ${httpStatus}${metaCode ? ` | META_CODE=${metaCode}` : ""}${subCode ? ` | SUBCODE=${subCode}` : ""} | ${metaMsg || "Sem mensagem da Meta"}`;

          await base44.entities.WhatsappTemplate.update(template_id, {
            status: "erro_envio",
            rejection_reason: motivo,
          });
          // Sempre registra request, response, código HTTP e mensagem da Meta
          await base44.entities.WhatsappTemplateLog.create({
            empresa_id: template.empresa_id,
            template_id,
            action: "enviar_aprovacao",
            previous_status: "enviando",
            new_status: "erro_envio",
            request_json: JSON.stringify(payload),
            response_json: JSON.stringify(data),
            error_message: motivo,
            user_id: user.id,
            user_name: user.full_name,
          });
          return Response.json(
            {
              error: metaMsg || "Não foi possível enviar o template para a Meta.",
              http_status: httpStatus,
              meta_code: metaCode,
              meta_subcode: subCode,
              meta_message: metaMsg,
              details: JSON.stringify(metaErr || data),
            },
            { status: httpStatus },
          );
        }

        // --- Ramo de SUCESSO ---
        await base44.entities.WhatsappTemplate.update(template_id, {
          meta_template_id: data.id,
          status: "em_analise",
          components_json: JSON.stringify(components),
        });
        await base44.entities.WhatsappTemplateLog.create({
          empresa_id: template.empresa_id,
          template_id,
          action: "enviar_aprovacao",
          previous_status: "enviando",
          new_status: "em_analise",
          request_json: JSON.stringify(payload),
          response_json: JSON.stringify(data),
          user_id: user.id,
          user_name: user.full_name,
        });

        // Sincroniza templates da Meta logo após o envio — caso o template
        // recém-criado precise "reaparecer" ou haja templates órfãos no CRM.
        try {
          await syncTemplatesFromMeta(template.empresa_id, base44);
        } catch {}

        return Response.json({
          success: true,
          meta_id: data.id,
          status: "em_analise",
          message: "Template enviado para análise da Meta.",
        });
      } catch (err) {
        const motivo = err?.message || "Erro de rede ao contatar a Meta.";
        await base44.entities.WhatsappTemplate.update(template_id, {
          status: "erro_envio",
          rejection_reason: motivo,
        });
        await base44.entities.WhatsappTemplateLog.create({
          empresa_id: template.empresa_id,
          template_id,
          action: "enviar_aprovacao",
          previous_status: "enviando",
          new_status: "erro_envio",
          request_json: JSON.stringify(payload),
          error_message: motivo,
          user_id: user.id,
          user_name: user.full_name,
        });
        return Response.json(
          {
            error: "Erro ao contatar a Meta (provável problema de rede).",
            http_status: 502,
            meta_message: motivo,
            details: motivo,
          },
          { status: 502 },
        );
      }
    }

    // ----------------------------------------------------------------
    // sync_status — consulta a Meta e atualiza o status interno
    // ----------------------------------------------------------------
    // ----------------------------------------------------------------
    // diagnostico_template — devolve checks ✓/✗ dos campos da conexão
    // sem tentar enviar à Meta. Usado pelo botão "Diagnóstico".
    // ----------------------------------------------------------------
    if (action === "diagnostico_template") {
      const { template_id } = body;
      const template = await base44.entities.WhatsappTemplate.get(template_id);
      if (!template) return Response.json({ error: "Template não encontrado" }, { status: 404 });
      const diag = await diagnosticarConexao(template, base44);
      return Response.json({
        success: true,
        checks: diag.checks,
        waba_id: diag.waba_id,
        phone_number_id: diag.phone_number_id,
        fonte_waba: diag.empresa_waba ? "empresa (Embedded Signup)" : "",
      });
    }

    // ----------------------------------------------------------------
    // vincular_dados_meta — admin insere WABA ID, Phone Number ID e Token
    // da Meta manualmente por conexão. Token salvo em token_encrypted,
    // nunca devolvido na resposta.
    // ----------------------------------------------------------------
    if (action === "vincular_dados_meta") {
      if (!["super_admin", "master", "admin"].includes(perfil)) {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      const { connection_id, waba_id, phone_number_id, meta_token } = body;
      if (!connection_id) return Response.json({ error: "connection_id obrigatório" }, { status: 400 });
      const wabaIdClean = String(waba_id || "").trim();
      const phoneNumberIdClean = String(phone_number_id || "").trim();
      const tokenClean = String(meta_token || "").trim();
      if (!/^\d+$/.test(wabaIdClean)) return Response.json({ error: "WABA ID deve conter somente números." }, { status: 400 });
      if (!tokenClean) return Response.json({ error: "Token da Meta é obrigatório." }, { status: 400 });

      const conn = await base44.entities.WhatsappConnection.get(connection_id);
      if (!conn || (conn.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master")) {
        return Response.json({ error: "Sem permissão para a conexão" }, { status: 403 });
      }

      // Valida o token consultando a Meta antes de salvar.
      let wabaFound = false;
      let canManage = false;
      let httpStatus = 0;
      let testError: string | null = null;
      try {
        const r = await fetch(`${META_BASE_URL}/${META_API_VERSION}/${wabaIdClean}?fields=name,id`, { headers: { Authorization: `Bearer ${tokenClean}` } });
        httpStatus = r.status;
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (j?.id && String(j.id) === String(wabaIdClean)) wabaFound = true;
          const r2 = await fetch(`${META_BASE_URL}/${META_API_VERSION}/${wabaIdClean}/message_templates?limit=1`, { headers: { Authorization: `Bearer ${tokenClean}` } });
          if (r2.ok) canManage = true;
          else testError = `WABA encontrado, mas sem permissão para gerenciar templates (HTTP ${r2.status}).`;
        } else {
          const j = await r.json().catch(() => ({}));
          testError = j?.error?.message || `HTTP ${r.status}`;
        }
      } catch (e: any) { testError = e?.message || "Erro de rede ao validar token."; }

      if (!wabaFound || !canManage) {
        return Response.json({ success: false, http_status: httpStatus || 400, meta_message: testError || "WABA não acessível pelo token. Verifique WABA ID e Token." }, { status: 400 });
      }

      let cfg: any = {};
      try { cfg = JSON.parse(conn.config_json || "{}"); } catch {}
      cfg.wabaId = wabaIdClean;
      if (phoneNumberIdClean) cfg.phoneNumberId = phoneNumberIdClean;
      cfg.linkedManuallyAt = new Date().toISOString();

      const updates: any = { config_json: JSON.stringify(cfg), token_encrypted: tokenClean };
      await base44.entities.WhatsappConnection.update(connection_id, updates);

      await base44.entities.WhatsappConnectionLog.create({
        empresa_id: conn.empresa_id, connection_id, event_type: "api.call", direction: "outbound",
        payload_json: JSON.stringify({ action: "vincular_dados_meta", waba_id: wabaIdClean, phone_number_id: phoneNumberIdClean || null }),
        response_json: JSON.stringify({ success: true, wabaFound, canManage, httpStatus }),
        created_at: new Date().toISOString(),
      }).catch(() => {});

      return Response.json({ success: true, wabaFound, canManageTemplates: canManage, message: "Dados da Meta vinculados à conexão." });
    }

    // ----------------------------------------------------------------
    // test_template_access — valida WABA ID + Token salvos na conexão.
    // Retorna diagnóstico seguro (sem expor o token).
    // ----------------------------------------------------------------
    if (action === "test_template_access") {
      const { connection_id } = body;
      if (!connection_id) return Response.json({ error: "connection_id obrigatório" }, { status: 400 });
      const conn = await base44.entities.WhatsappConnection.get(connection_id);
      if (!conn || (conn.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master")) {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      let cfg: any = {};
      try { cfg = JSON.parse(conn.config_json || "{}"); } catch {}
      const waba_id = String(cfg.wabaId || cfg.waba_id || "").trim();
      const tokenLocal = (conn.token_encrypted || "").trim();
      let token: string = tokenLocal;
      if (!token) { try { token = await getToken(conn.empresa_id, base44); } catch { token = ""; } }
      if (!token) token = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
      let wabaFound = false, canManage = false, httpStatus = 0;
      let errorMsg: string | null = null;
      const urlBase = `${META_BASE_URL}/${META_API_VERSION}/${waba_id}`;
      try {
        const r = await fetch(`${urlBase}?fields=name,id`, { headers: { Authorization: `Bearer ${token}` } });
        httpStatus = r.status;
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (j?.id && String(j.id) === String(waba_id)) wabaFound = true;
          const r2 = await fetch(`${META_BASE_URL}/${META_API_VERSION}/${waba_id}/message_templates?limit=1`, { headers: { Authorization: `Bearer ${token}` } });
          if (r2.ok) canManage = true;
          else errorMsg = `Sem permissão para gerenciar templates (HTTP ${r2.status}).`;
        } else {
          const j = await r.json().catch(() => ({}));
          errorMsg = j?.error?.message || `HTTP ${r.status}`;
        }
      } catch (e: any) { errorMsg = e?.message || "Erro de rede"; }
      await base44.entities.WhatsappConnectionLog.create({
        empresa_id: conn.empresa_id, connection_id, event_type: "health.check", direction: "outbound",
        payload_json: JSON.stringify({ action: "test_template_access", waba_id, url: urlBase, has_token: !!token, local_token: !!tokenLocal }),
        response_json: JSON.stringify({ wabaFound, canManage, httpStatus }),
        error_message: errorMsg, created_at: new Date().toISOString(),
      }).catch(() => {});
      return Response.json({ success: wabaFound && canManage, wabaFound, canManageTemplates: canManage, httpStatus, error: errorMsg, waba_id });
    }

    // ----------------------------------------------------------------
    // sync_status — consulta a Meta e atualiza o status interno
    // ----------------------------------------------------------------
    if (action === "sync_status") {
      const { template_id } = body;
      const template = await base44.entities.WhatsappTemplate.get(template_id);
      if (!template) return Response.json({ error: "Template não encontrado" }, { status: 404 });
      if (template.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master") {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      if (!template.meta_template_id) {
        return Response.json({ error: "Template ainda não enviado à Meta" }, { status: 400 });
      }
      const token = await getToken(template.empresa_id, base44);
      const res = await fetch(
        `${META_BASE_URL}/${META_API_VERSION}/${template.meta_template_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      const metaStatus = (data.status || "").toUpperCase();
      const mapping: Record<string, string> = {
        APPROVED: "aprovado",
        REJECTED: "rejeitado",
        PENDING: "em_analise",
        IN_APPEAL: "em_analise",
        PAUSED: "pausado",
        DISABLED: "desativado",
      };
      const newStatus = mapping[metaStatus] || "em_analise";
      const updates: any = {
        status: newStatus,
        last_synced_at: new Date().toISOString(),
      };
      if (data.quality_rating) updates.quality_rating = data.quality_rating;
      if (newStatus === "aprovado") updates.approved_at = new Date().toISOString();
      if (newStatus === "rejeitado") {
        updates.rejected_at = new Date().toISOString();
        let reasonParts = [];
        if (data.rejected_reason) reasonParts.push(data.rejected_reason);
        if (data.rejections) reasonParts.push(JSON.stringify(data.rejections));
        updates.rejection_reason = reasonParts.join(" | ");
      }
      await base44.entities.WhatsappTemplate.update(template_id, updates);
      await base44.entities.WhatsappTemplateLog.create({
        empresa_id: template.empresa_id,
        template_id,
        action: "sincronizar_status",
        previous_status: template.status,
        new_status: newStatus,
        response_json: JSON.stringify(data),
        user_id: user.id,
        user_name: user.full_name,
      });
      return Response.json({ success: true, status: newStatus, updates });
    }

    // ----------------------------------------------------------------
    // sync_all — sincroniza todos os templates em análise do usuário
    // ----------------------------------------------------------------
    if (action === "sync_all") {
      const all = await base44.entities.WhatsappTemplate.filter(
        user.empresa_id ? { empresa_id: user.empresa_id } : {},
        null,
        300,
      );
      const pendentes = all.filter((t) => ["em_analise", "enviando"].includes(t.status) && t.meta_template_id);
      let processados = 0;
      let aprovados = 0;
      let rejeitados = 0;
      for (const t of pendentes) {
        try {
          const token = await getToken(t.empresa_id, base44);
          const res = await fetch(
            `${META_BASE_URL}/${META_API_VERSION}/${t.meta_template_id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const data = await res.json();
          const mapping: Record<string, string> = {
            APPROVED: "aprovado", REJECTED: "rejeitado", PENDING: "em_analise",
            IN_APPEAL: "em_analise", PAUSED: "pausado", DISABLED: "desativado",
          };
          const newStatus = mapping[(data.status || "").toUpperCase()] || "em_analise";
          const updates: any = { status: newStatus, last_synced_at: new Date().toISOString() };
          if (newStatus === "aprovado") { updates.approved_at = new Date().toISOString(); aprovados++; }
          if (newStatus === "rejeitado") {
            updates.rejected_at = new Date().toISOString();
            updates.rejection_reason = (data.rejected_reason || "") + (data.rejections ? " | " + JSON.stringify(data.rejections) : "");
            rejeitados++;
          }
          await base44.entities.WhatsappTemplate.update(t.id, updates);
          processados++;
        } catch {}
      }
      return Response.json({ success: true, processados, aprovados, rejeitados });
    }

    // ----------------------------------------------------------------
    // sync_templates_from_meta — consulta todos os templates na WABA da
    // empresa e importa automaticamente qualquer template que exista na
    // Meta mas ainda não exista no CRM. Garante que a lista de templates
    // nunca fique vazia se houver templates aprovados na conta da Meta.
    // ----------------------------------------------------------------
    if (action === "sync_templates_from_meta") {
      try {
        const result = await syncTemplatesFromMeta(user.empresa_id, base44);
        return Response.json({ success: true, ...result });
      } catch (e: any) {
        return Response.json(
          { success: false, error: e?.message || "Falha ao sincronizar templates da Meta" },
          { status: 502 },
        );
      }
    }

    // ----------------------------------------------------------------
    // duplicate — cria uma cópia em rascunho (novo nome) e clona variáveis
    // ----------------------------------------------------------------
    if (action === "duplicate") {
      const { template_id, new_name, new_display_name } = body;
      const original = await base44.entities.WhatsappTemplate.get(template_id);
      if (!original || (original.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master")) {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      const novoNome = normalizeName(new_name || `${original.name}_copia`);
      const copy: any = {
        empresa_id: original.empresa_id,
        connection_id: original.connection_id,
        connection_nome: original.connection_nome,
        session_id: original.session_id,
        waba_id: original.waba_id,
        phone_number_id: original.phone_number_id,
        name: novoNome,
        display_name: new_display_name || `${original.display_name || original.name} (cópia)`,
        language: original.language,
        category: original.category,
        type: original.type,
        header_type: original.header_type,
        header_text: original.header_text,
        header_media_url: original.header_media_url,
        header_media_id: original.header_media_id,
        body_text: original.body_text,
        footer_text: original.footer_text,
        buttons_json: original.buttons_json,
        variables_json: original.variables_json,
        status: "rascunho",
        created_by_id: user.id,
        created_by_nome: user.full_name,
      };
      const novo = await base44.entities.WhatsappTemplate.create(copy);
      const vars = await base44.entities.WhatsappTemplateVariable.filter({ template_id, empresa_id: original.empresa_id }, null, 100);
      for (const v of vars) {
        await base44.entities.WhatsappTemplateVariable.create({
          empresa_id: v.empresa_id,
          template_id: novo.id,
          component: v.component,
          position: v.position,
          crm_field: v.crm_field,
          description: v.description,
          example_value: v.example_value,
        });
      }
      await base44.entities.WhatsappTemplateLog.create({
        empresa_id: original.empresa_id,
        template_id: novo.id,
        action: "duplicar",
        previous_status: original.status,
        new_status: "rascunho",
        user_id: user.id,
        user_name: user.full_name,
      });
      return Response.json({ success: true, template: novo });
    }

    // ----------------------------------------------------------------
    // delete_draft — exclui apenas templates em rascunho (+ variáveis)
    // ----------------------------------------------------------------
    if (action === "delete_draft") {
      const { template_id } = body;
      const t = await base44.entities.WhatsappTemplate.get(template_id);
      if (!t || (t.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master")) {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      if (!["rascunho", "erro_envio"].includes(t.status)) {
        return Response.json({ error: "Apenas rascunhos ou templates com erro de envio podem ser excluídos" }, { status: 400 });
      }
      const vars = await base44.entities.WhatsappTemplateVariable.filter({ template_id, empresa_id: t.empresa_id }, null, 100);
      for (const v of vars) {
        try { await base44.entities.WhatsappTemplateVariable.delete(v.id); } catch {}
      }
      await base44.entities.WhatsappTemplate.delete(template_id);
      await base44.entities.WhatsappTemplateLog.create({
        empresa_id: t.empresa_id,
        template_id,
        action: "excluir_rascunho",
        previous_status: t.status,
        new_status: "excluido",
        user_id: user.id,
        user_name: user.full_name,
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: "Ação inválida: " + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || "Erro inesperado" }, { status: 500 });
  }
});
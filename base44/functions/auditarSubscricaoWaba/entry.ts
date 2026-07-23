import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * Diagnostic ONLY — consulta a Meta Graph API para auditar a inscricao do App
 * da D-API no WABA (Api_Oficial). Nao grava nada; nao altera conversa/mensagem.
 *
 * Usa o secret META_WHATSAPP_ACCESS_TOKEN já configurado no app.
 * Endpoints consultados:
 *   /v19.0/<WABA>/subscribed_apps                  — apps inscritos no WABA
 *   /v19.0/<PHONE>?fields=...                       — status do número oficial
 *   /v19.0/<WABA>?fields=...                        — nome/estado do WABA
 *
 * Payload aceito:
 *   { waba_id?: "...", phone_number_id?: "...", override_callback_uri_check?: true }
 * Defaults hardcoded para WABA 1763691181671244 e Phone 1109683608896328 (a conexao Api_Oficial).
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({})) || {};
    const WABA = body.waba_id || "1763691181671244";
    const PHONE = body.phone_number_id || "1109683608896328";

    const token = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN");
    if (!token) {
      return Response.json({
        success: false,
        error: "META_WHATSAPP_ACCESS_TOKEN nao configurado nas secrets.",
      }, { status: 500 });
    }

    const base = "https://graph.facebook.com/v19.0";
    const mkHeaders = () => ({ Authorization: `Bearer ${token}` });

    async function get(path: string, fields?: string) {
      try {
        const url = `${base}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}${fields ? "&fields=" + encodeURIComponent(fields) : ""}`;
        const resp = await fetch(url, { headers: mkHeaders() });
        const t = await resp.text();
        let j: any = null;
        try { j = JSON.parse(t); } catch (_) {}
        return { status: resp.status, ok: resp.ok, json: j, raw: t.slice(0, 1500) };
      } catch (e: any) {
        return { status: 0, ok: false, erro: e.message };
      }
    }

    const [subApps, subAppsDetailed, phoneInfo, wabaInfo] = await Promise.all([
      get(`/${WABA}/subscribed_apps`),
      get(`/${WABA}/subscribed_apps`, "object,id,name,subscribed_fields"),
      get(
        `/${PHONE}`,
        "display_phone_number,verified_name,status,quality_rating,account_mode,messaging_limit_tier,name_status"
      ),
      get(`/${WABA}`, "name,onboarding_status,primary_phone_number,account_review_status,business_verification_status,currency"),
    ]);

    // 5a. Diagnosticar D-API: subscription + subscribed-apps + webhook + phone-numbers + logs recentes
    const DAPI_TOKEN = Deno.env.get("DAPI_USER_API_KEY");
    const DAPI_BASE = "https://api.d-api.cloud/api/v1";
    const dHeaders = { Authorization: DAPI_TOKEN || "", "content-type": "application/json" };
    async function dget(path: string) {
      if (!DAPI_TOKEN) return { erro: "DAPI_USER_API_KEY nao configurado" };
      try {
        const r = await fetch(`${DAPI_BASE}${path}`, { headers: dHeaders });
        const t = await r.text();
        let j: any = null;
        try { j = JSON.parse(t); } catch (_) {}
        return { status: r.status, ok: r.ok, json: j, raw: (t || "").slice(0, 700) };
      } catch (e: any) {
        return { erro: e.message };
      }
    }
    const dapiUuid = "b1add982-3eeb-4a24-bf3d-b88eb32a0b46";
    const dapiProbes = await Promise.all([
      dget(`/connections/cloud-api/${dapiUuid}`).then((r) => ({ path: "cloud_config", ...r })),
      dget(`/connections/cloud-api/${dapiUuid}/subscription`).then((r) => ({ path: "subscription", ...r })),
      dget(`/connections/cloud-api/${dapiUuid}/webhook`).then((r) => ({ path: "webhook_settings", ...r })),
      dget(`/connections/cloud-api/${dapiUuid}/phone-numbers`).then((r) => ({ path: "phone_numbers", ...r })),
      dget(`/connections/cloud-api/${dapiUuid}/subscribed-apps`).then((r) => ({ path: "subscribed_apps", ...r })),
      dget(`/connections/cloud-api/${dapiUuid}/logs?limit=5`).then((r) => ({ path: "logs_recentes", ...r })),
      dget(`/connections/cloud-api/${dapiUuid}/messages/received?limit=10`).then((r) => ({ path: "messages_received_recentes", ...r })),
    ]);

    // 5b. Logs do CRM (WhatsappConnectionLog) da Api_Oficial — datas do último e último em 24h
    const hoje24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let logsApiOficial: any[] = [];
    try {
      logsApiOficial = await base44.asServiceRole.entities.WhatsappConnectionLog.filter(
        { connection_id: "6a6178d304bb6b54efb27581", event_type: "messages.received" },
        "-created_date", 10
      );
    } catch (_) {}
    const ultimoMsgApiOficial = logsApiOficial[0];
    const ultimoMsgDe24h = logsApiOficial.find((l: any) => new Date(l.created_at) >= new Date(hoje24h));

    // 5. Diagnosticar o App da propria Meta (META_APP_ID) — para saber se nosso token enxerga o WABA
    const META_APP_ID = String(Deno.env.get("META_APP_ID") || "").trim();
    let envKeys = Object.keys(Deno.env.toObject()).filter((k: string) =>
      k.toUpperCase().includes("META") || k.toUpperCase().includes("WHATSAPP") || k.toUpperCase().includes("WABA") || k.toUpperCase().includes("FACEBOOK") || k.toUpperCase().includes("APP")
    );
    let appInfo: any = null;
    // So tentamos se META_APP_ID for uma string de digitos (ID real) — senao registramos que esta invalido
    if (/^\d+$/.test(META_APP_ID)) {
      try {
        const r = await get(`/${META_APP_ID}`, "id,name,category,app_domains,auth_dialog,aam_fields");
        appInfo = {
          meta_app_id: META_APP_ID,
          status: r.status, ok: r.ok,
          app_name: r?.json?.name,
          app_category: r?.json?.category,
          raw_excerpt: r?.raw?.slice(0, 400),
        };
      } catch (e: any) {
        appInfo = { erro: e.message, meta_app_id: META_APP_ID };
      }
    } else {
      appInfo = {
        erro: "META_APP_ID ausente ou invalido (nao numerico)",
        meta_app_id_valor: META_APP_ID ? META_APP_ID.slice(0, 20) : null,
        meta_app_id_tamanho: META_APP_ID ? META_APP_ID.length : 0,
      };
    }

    // Testar tentativa alternativa: token via business_managers do usuario logado
    let meInfo: any = null;
    try {
      const r = await get(`/me`, "id,name,first_name,last_name");
      meInfo = { name: r?.json?.name, id: r?.json?.id, status: r?.status, raw: r?.raw?.slice(0,200) };
    } catch (_) {}

    // Análise: itens que esperamos ver
    const subscribed_apps_list = subAppsDetailed?.json?.data || subApps?.json?.data || [];
    const appInscrito = Array.isArray(subscribed_apps_list) && subscribed_apps_list.length > 0;

    const phoneData = phoneInfo?.json || {};
    const phoneStatusOk = phoneData?.status === "READY" || phoneData?.status === "VERIFIED";
    const accountModeOk = phoneData?.account_mode === "LIVE" || phoneData?.account_mode === "live";

    // Verificar override_callback_uri (se o App tem override apontando para OUTRO webhook)
    let overrideCheck: any = null;
    try {
      const r = await get(`/${WABA}/webhooks`, "override_callback_uri,fields");
      overrideCheck = r;
    } catch (_) {}

    const problemas: string[] = [];
    if (!appInscrito) problemas.push("WABA sem nenhum app inscrito — Meta nao vai entregar messages.received para ninguem (D-API inclusive).");
    if (!phoneStatusOk && phoneData?.status) problemas.push(`Phone number status='${phoneData.status}' (esperado READY/VERIFIED).`);
    if (!accountModeOk && phoneData?.account_mode) problemas.push(`account_mode='${phoneData.account_mode}' — se DEVELOPMENT, o numero so recebe mensagens de testadores autorizados (window 24h).`);
    if (phoneData?.quality_rating && phoneData.quality_rating !== "GREEN" && phoneData.quality_rating !== "YELLOW") {
      problemas.push(`quality_rating='${phoneData.quality_rating}' abaixo do aceitavel.`);
    }

    const conclusao =
      problemas.length === 0
        ? "Inscricao Meta aparentemente OK. Se mensagens da Beatriz ainda nao chegam, o bloqueio pode ser: (a) modo DEVELOPMENT no App que requer testadores, (b) override_callback_uri da Meta apontando para outro endpoint, ou (c) o numero da Beatriz esta fora da janela de 24h/fora do Brasil."
        : problemas.join(" | ");

    return Response.json({
      success: true,
      auditado: {
        waba_id: WABA,
        phone_number_id: PHONE,
      },
      subscribed_apps: appInscrito
        ? {
            total_apps: subscribed_apps_list.length,
            apps: subscribed_apps_list.map((a: any) => ({
              id: a.id,
              name: a.name,
              object: a.object,
              subscribed_fields: a.subscribed_fields,
            })),
          }
        : {
            total_apps: 0,
            raw_excerpt: subApps?.raw,
          },
      phone_number_info: {
        display_phone_number: phoneData?.display_phone_number,
        verified_name: phoneData?.verified_name,
        status: phoneData?.status,
        account_mode: phoneData?.account_mode,
        quality_rating: phoneData?.quality_rating,
        messaging_limit_tier: phoneData?.messaging_limit_tier,
        name_status: phoneData?.name_status,
      },
      waba_info: {
        name: wabaInfo?.json?.name,
        onboarding_status: wabaInfo?.json?.onboarding_status,
        account_review_status: wabaInfo?.json?.account_review_status,
        business_verification_status: wabaInfo?.json?.business_verification_status,
        primary_phone_number: wabaInfo?.json?.primary_phone_number,
        currency: wabaInfo?.json?.currency,
        raw_excerpt: wabaInfo?.raw,
      },
      dapi_probes: dapiProbes.map((p: any) => {
        // Apenas compactar: status, ok, 1 champ relevante, 1 traceId/erro se houver
        const isErr = p?.status === 500 || p?.json?.success === false;
        const traceId = p?.json?.traceId || p?.json?.error || null;
        let chave = null;
        const d = p?.json?.data;
        if (typeof d === "object" && d) {
          chave = {
            webhookUrl: d.webhookUrl || null,
            status: d.status || null,
            phoneNumberId: d.phoneNumberId || null,
            events: d.events || null,
            enabled: d.enabled === undefined ? null : d.enabled,
            total: Array.isArray(d) ? d.length : (d.total ?? null),
          };
          // remove nulls
          chave = Object.fromEntries(Object.entries(chave).filter(([, v]) => v !== null));
        }
        return {
          path: p.path,
          status: p.status,
          ok: !isErr,
          erro: isErr ? (traceId || "Internal server error") : null,
          dados_uteis: !isErr ? chave : null,
        };
      }),
      logs_crm_api_oficial: {
        total_received_recentes: logsApiOficial.length,
        ultimo_received_data: ultimoMsgApiOficial?.created_at || null,
        ultimo_received_em24h: !!ultimoMsgDe24h,
      },
      override_callback_uri: { status: overrideCheck?.status, erro: overrideCheck?.json?.error?.message || null },
      meta_app: { status: appInfo?.status ?? appInfo?.erro, name: appInfo?.app_name, id_recebido: appInfo?.meta_app_id },
      quem_sou_eu_meta: meInfo?.name ? { name: meInfo.name, id: meInfo.id } : meInfo,
      problemas,
      conclusao,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
  }
});
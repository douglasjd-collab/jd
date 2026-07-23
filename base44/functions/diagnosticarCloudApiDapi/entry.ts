import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

/**
 * Diagnóstico completo da conexão Cloud API D-API.
 *
 * Verifica na D-API:
 *  - Phone Number ID e WABA ID persistidos na sessão
 *  - Status real da conexão (vs. o "conectado" cosmetic que vemos no CRM)
 *  - Webhook URL registrada na sessão
 *  - Metadados retornados pela Meta via D-API (authData, phoneNumberId, wabaId)
 *
 * Compara com o que temos no banco (WhatsappConnection) e retorna um relatório
 * estruturado com a próxima ação recomendada (refazer onboarding, contactar D-API,
 * forçar subscribed_apps, etc.).
 *
 * Payload esperado (opcional):
 *   { connection_id?: string }
 * Se omitido, usa a primeira conexão provider_type='dapi' com session_id começando por 'cloud'.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const { connection_id: connectionIdParam } = body || {};

    // Localizar a conexão CRM (Api_Oficial Cloud)
    let connection: any = null;
    if (connectionIdParam) {
      const c = await base44.entities.WhatsappConnection.get(connectionIdParam);
      connection = c as any;
    } else {
      const conns = await base44.entities.WhatsappConnection.filter({
        provider_type: "dapi",
      });
      const cloud = (conns as any[]).find((c) => (c.session_id || "").startsWith("cloud"));
      connection = cloud || null;
    }

    if (!connection) {
      return Response.json({
        success: false,
        error: "Nenhuma conexão Cloud API D-API encontrada. Conecte via 'Conectar Cloud (Oficial)'.",
      }, { status: 404 });
    }

    const sessionId = connection.session_id;
    const adminKey = Deno.env.get("DAPI_USER_API_KEY");
    if (!adminKey) {
      return Response.json({
        success: false,
        error: "DAPI_USER_API_KEY não configurado nas secrets.",
      }, { status: 500 });
    }

    const base = "https://api.d-api.cloud/api/v1";
    const headers = { Authorization: adminKey, "content-type": "application/json" };

    const tentar = async (path: string) => {
      try {
        const resp = await fetch(`${base}${path}`, { headers });
        const text = await resp.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { ok: resp.ok, status: resp.status, json, texto: text.substring(0, 2000) };
      } catch (e) {
        return { ok: false, erro: e.message };
      }
    };

    // D-API distingue dois IDs por sessão Cloud:
    //   id='cloud-abc...'  (vem no payload webhook como sessionId)
    //   connectionId=UUID   (usado nos endpoints /api/v1/sessions/{uuid} e /connections/cloud-api/{uuid})
    // Para encontrarmos o UUID vamos listar TODAS as sessões e casar por id.
    const listResp = await tentar(`/sessions`);
    const list = (listResp.json?.data || listResp.json?.sessions || listResp.json || []) as any[];
    const match = list.find((s: any) => s.id === sessionId);
    const uuid = match?.connectionId || match?.uuid || null;

    // Sondagens sequenciais na D-API para entender a sessão Cloud (usa UUID)
    const detalhes = uuid ? await tentar(`/sessions/${uuid}`) : await tentar(`/sessions/${sessionId}`);
    const cloudConfig = uuid ? await tentar(`/connections/cloud-api/${uuid}`) : { ok: false, motivo: "uuid não localizado" };
    const phoneNumbers = uuid ? await tentar(`/connections/cloud-api/${uuid}/phone-numbers`) : { ok: false, motivo: "uuid não localizado" };
    const subscribeStatus = uuid ? await tentar(`/connections/cloud-api/${uuid}/subscription`) : { ok: false, motivo: "uuid não localizado" };
    const webhookSettings = uuid ? await tentar(`/connections/cloud-api/${uuid}/webhook`) : { ok: false, motivo: "uuid não localizado" };

    // Inspecionar campos relevantes dentro do detalhe
    const djson = detalhes.json || {};
    const phone_number_id =
      djson.phoneNumberId || djson.phone_number_id || djson.metadata?.phone_number_id ||
      djson.authData?.phone_number_id || djson.settings?.phone_number_id || null;
    const waba_id =
      djson.wabaId || djson.waba_id || djson.metadata?.waba_id ||
      djson.authData?.waba_id || djson.settings?.waba_id || null;
    const webhookUrl =
      djson.webhookUrl || djson.settings?.webhook?.url || djson.settings?.webhookUrl || null;
    const authDataPresente = !!djson.authData || !!djson.metadata?.authData;

    // Verificar subscrição do App ao WABA na Meta — endpoint comum: subscribed_apps
    let metaSubscribeInfo: any = null;
    if (uuid) {
      metaSubscribeInfo = await tentar(`/connections/cloud-api/${uuid}/subscribed-apps`);
    }

    // Logs recentes no banco desta conexão (confirmar se webhook está vivo)
    const logsRecentes = await base44.entities.WhatsappConnectionLog.filter({
      connection_id: connection.id,
      event_type: "messages.received",
    }, "-created_date", 10);

    const ultimoReceivedReal = logsRecentes.find((l: any) =>
      !(l.payload_json || "").includes('"traceId":"test')
    );

    // Diagnóstico final
    const problemas: string[] = [];
    if (!phone_number_id) problemas.push("phone_number_id ausente — Meta não deveria conseguir rotear mensagens para essa sessão.");
    if (!waba_id) problemas.push("waba_id ausente — não tem como validar inscrição do app D-API no WABA.");
    if (!webhookUrl) problemas.push("webhookUrl ausente na sessão — D-API não sabe para onde entregar eventos.");
    if (!authDataPresente) problemas.push("authData ausente — provável que o Embedded Signup não completou; refazer onboarding.");
    if (ultimoReceivedReal) {
      // ok
    } else {
      problemas.push("Nenhum messages.received REAL da D-API para esta sessão — confirma que o webhook não está entregando.");
    }

    const recomendacao =
      problemas.length === 0
        ? "Configuração aparentemente OK. Se mensagens ainda não chegarem, o problema é a inscrição do app D-API no WABA (subscribed_apps) — abrir ticket D-API."
        : "Refazer o onboarding pelo botão 'Conectar Cloud (Oficial)' no CRM (recria authData e dispara subscribed_apps na Meta). Se persistir, abrir ticket com a D-API citando phone_number_id e waba_id deste diagnóstico.";

    return Response.json({
      success: true,
      connection: {
        crm_id: connection.id,
        session_id: sessionId,
        status_no_crm: connection.status,
        phone_number_no_crm: connection.phone_number,
      },
      meta: {
        phone_number_id,
        waba_id,
        webhook_url_dapi: webhookUrl,
        authData_presente: authDataPresente,
        uuid_da_sessao: uuid,
        session_id_crm: sessionId,
      },
      sondagens: {
        detalhes,
        cloud_config: cloudConfig,
        phone_numbers: phoneNumbers,
        subscription: subscribeStatus,
        webhook_settings: webhookSettings,
        subscribed_apps: metaSubscribeInfo,
      },
      logs_local: {
        total_received_recentes: logsRecentes.length,
        tem_received_real: !!(ultimoReceivedReal),
        data_ultimo_real: ultimoReceivedReal?.created_at || null,
      },
      problemas,
      recomendacao,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
  }
});
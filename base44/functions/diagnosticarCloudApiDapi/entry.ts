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

    // webhook-config por sessão (o que realmente ativa a entrega per-event na D-API)
    const webhookConfigPerSession = uuid ? await tentar(`/sessions/${uuid}/webhook-config`) : { ok: false };

    // Mensagens recentes armazenadas na D-API (prova se Meta está entregando lá)
    const recentMessagesDapi = uuid ? await tentar(`/sessions/${uuid}/messages?limit=10`) : { ok: false };

    // Tentar variantes de endpoint (descobrir o path correto para Cloud API)
    // Importante: Cloud API tem dois IDs — o id="cloud-abc..." (session_id)
    // e o connectionId=UUID (usado em /cloud-api/{uuid}). Testar ambos.
    const variantes = uuid ? [
      // Usando UUID
      `/connections/cloud-api/${uuid}/webhook-config`,
      `/connections/cloud-api/${uuid}/messages`,
      `/connections/cloud-api/${uuid}/messages/received`,
      `/sessions/${uuid}/chats`,
      `/sessions/${uuid}/messages/received`,
      // Usando session_id legível
      `/sessions/${sessionId}/webhook-config`,
      `/sessions/${sessionId}/chats`,
      `/sessions/${sessionId}/messages?limit=5`,
      // Webhook delivery log dump
      `/sessions/${sessionId}/webhooks/events-log?limit=20`,
      `/connections/cloud-api/${uuid}/webhooks/deliveries?limit=20`,
    ] : [];
    const sondagensVariantes: any[] = [];
    for (const p of variantes) {
      sondagensVariantes.push({ path: p, ...(await tentar(p)) });
    }

    // Ação opcional: apenas confirmar webhook-config atual com readable session_id
    let configStatus: any = null;
    if ((body as any)?.action === 'ver_webhook_config') {
      try {
        const resp = await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/webhook-config`, {
          method: 'GET',
          headers,
        });
        const t = await resp.text();
        let j: any = null;
        try { j = JSON.parse(t); } catch (_) {}
        configStatus = {
          status: resp.status,
          ok: resp.ok && j?.success !== false && !j?.error,
          excerpt: t.slice(0, 1500),
        };
      } catch (e) {
        configStatus = { erro: e.message };
      }
    }

    // Ação opcional: re-postar webhook-config per-event para forçar entrega
    let reWebhookResult: any = null;
    if ((body as any)?.action === 'forcar_webhook_config') {
      const webhookUrl = cloudConfig?.json?.data?.webhookUrl;
      if (uuid && webhookUrl) {
        const EVENTS_FORCAR = [
          'messages.received', 'messages.sent', 'message.delivered', 'message.read',
          'message.deleted', 'connection.status', 'contacts.upsert', 'contacts.update',
          'chats.upsert', 'chats.update', 'logged_out',
        ];

        // Tentar ambos identificadores: UUID (connectionId) E session_id legível
        const alvos = [
          { tipo: 'uuid', id: uuid },
          { tipo: 'session_id', id: sessionId },
        ];

        reWebhookResult = {};
        for (const alvo of alvos) {
          const eventsConfig: any = {};
          for (const ev of EVENTS_FORCAR) eventsConfig[ev] = { enabled: true, webhookUrl };

          try {
            const resp = await fetch(`${base}/sessions/${encodeURIComponent(alvo.id)}/webhook-config`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ enabled: true, type: 'per_event', events: eventsConfig }),
            });
            const t = await resp.text();
            let j: any = null;
            try { j = JSON.parse(t); } catch (_) {}
            reWebhookResult[alvo.tipo] = {
              path: `/sessions/${alvo.id.slice(0,12)}/webhook-config`,
              status: resp.status,
              ok: resp.ok && j?.success !== false,
              excerpt: t.slice(0, 800),
              json_classe: j?.success === true ? 'success' : (j?.error || 'outro'),
            };
          } catch (e) {
            reWebhookResult[alvo.tipo] = { erro: e.message };
          }
        }
      } else {
        reWebhookResult = { erro: 'sem uuid ou webhookUrl (precisava completar onboarding)' };
      }
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

    // Respostas enxutas para diagnóstico avançado (menor payload que o default)
    if ((body as any)?.action === 'probes_recentes' || (body as any)?.action === 'forcar_webhook_config') {
      const compactar = (s: any) => ({
        path: s.path,
        ok: s.ok,
        status: s.status,
        // só relevantes: se for 200, mostra os eventos/char_pos; se for erro, só traceId
        json_classe: s.json?.success === true ? 'success' : (s.json?.error || 'outro'),
        first_keys: s.json && typeof s.json === 'object' ? Object.keys(s.json).slice(0, 8) : '?',
        excerpt: (s.texto || s.erro || '').slice(0, 400),
      });
      if ((body as any)?.action === 'forcar_webhook_config') {
        return Response.json({
          success: true,
          uuid,
          webhook_url_dapi: cloudConfig?.json?.data?.webhookUrl || null,
          re_webhook_config: reWebhookResult,
        });
      }
      if ((body as any)?.action === 'ver_webhook_config') {
        return Response.json({
          success: true,
          uuid,
          session_id: sessionId,
          config_status: configStatus,
        });
      }
      return Response.json({
        success: true,
        uuid,
        webhook_config_per_session: compactar(webhookConfigPerSession),
        recent_messages_dapi: compactar(recentMessagesDapi),
        variantes_resumo: sondagensVariantes.map((s) => {
          const c = compactar(s);
          if (c.ok) return { path: c.path, status: c.status, ok: c.ok, excerpt: c.excerpt };
          return { path: c.path, status: c.status, ok: c.ok, classe: c.json_classe };
        }),
      });
    }

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
        webhook_config_per_session: webhookConfigPerSession,
        recent_messages_dapi: recentMessagesDapi
          ? {
              status: recentMessagesDapi.status,
              ok: recentMessagesDapi.ok,
              total_count: (recentMessagesDapi.json?.data || recentMessagesDapi.json?.messages || recentMessagesDapi.json || []).length,
              preview: (recentMessagesDapi.json?.data || recentMessagesDapi.json?.messages || []).slice(0, 3).map((m: any) => ({
                from: m.from || m.from_phone || m.data?.from?.jid || (m.direction === 'inbound' ? 'cliente' : 'vendedor'),
                direction: m.direction || m.fromMe ? (m.fromMe ? 'outbound' : 'inbound') : '?',
                tipo: m.type || m.message_type,
                preview: (m.message || m.text || m.body || m.content || '').slice(0, 50),
                timestamp: m.timestamp || m.createdAt || m.receivedAt,
              })),
              raw_excerpt: (recentMessagesDapi.texto || '').slice(0, 600),
            }
          : null,
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * dapiCloudConnect — Provisiona conexões WhatsApp Cloud API via D-API usando o
 * fluxo Embedded Signup hospedado (https://connect.d-api.cloud/connect).
 *
 * Ações:
 *   - get_publishable_key: cria (ou reaproveita do cache) uma publishable key
 *     pk_live_... do tipo Cloud API, necessária para abrir o popup da D-API.
 *   - save_connection: after onboarding conclude (connectionId, phoneNumber, status),
 *     verificou a sessão,-register o webhook-config (popula settings.webhook), e
 *     persistir como WhatsappConnection com provider_type='dapi'.
 *
 * A publishable key é PÚBLICA por design — só inicia o onboarding. A API key
 * SECRETA do parceiro (DAPI_USER_API_KEY) fica no backend, nunca no navegador.
 */

const DAPI_BASE = 'https://api.d-api.cloud';
const EVENTS = [
  'messages.received', 'messages.sent',
  'message.read', 'message.delivered', 'message.deleted', 'message.update',
  'connection.qrcode', 'connection.paircode', 'connection.status',
  'logged_out',
  'chats.update', 'chats.upsert',
  'contacts.update', 'contacts.upsert',
  'presence',
  'groups_participants.join', 'groups_participants.leave',
  'groups_participants.promote', 'groups_participants.demote',
  'group_participants.join-request',
  'group_participants.join-request.revoked',
  'group_participants.join-request.approved',
  'call.offer', 'call.accepted', 'call.rejected'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = ['master', 'super_admin', 'admin'].includes(user.perfil);
    if (!isAdmin) return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });

    const apiKey = Deno.env.get('DAPI_USER_API_KEY');
    if (!apiKey) return Response.json({ error: 'DAPI_USER_API_KEY não configurado' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---------------------------------------------------------------- get pk
    // GET webhook config
    if (action === 'get_webhook_config') {
      const { session_id } = body;
      if (!session_id) return Response.json({ error: 'session_id obrigatório' }, { status: 400 });
      const r = await fetch(`${DAPI_BASE}/api/v1/sessions/${encodeURIComponent(session_id)}`, {
        method: 'GET',
        headers: { 'Authorization': apiKey }
      });
      const data = await r.json().catch(() => ({}));
      return Response.json({
        success: r.ok,
        status: r.status,
        session: data?.session || data,
        settings_webhook: data?.session?.settings?.webhook || data?.session?.webhookSettings || data?.session?.webhook || null,
        root_webhook: data?.session?.webhookUrl || data?.session?.webhook_url || null
      });
    }

    // GET webhook event log (últimos eventos tentados)
    if (action === 'get_webhook_events_log') {
      const { session_id, limit = 20 } = body;
      if (!session_id) return Response.json({ error: 'session_id obrigatório' }, { status: 400 });
      const r = await fetch(`${DAPI_BASE}/api/v1/sessions/${encodeURIComponent(session_id)}/webhook-config/events-log?limit=${limit}`, {
        method: 'GET',
        headers: { 'Authorization': apiKey }
      });
      const data = await r.json().catch(() => ({}));
      return Response.json({ success: r.ok, status: r.status, data });
    }

    if (action === 'get_publishable_key') {
      // Reuso cache: pk é público e limitado por taxa; reaproveitar evita
      // пояснение кровообращение do limite e simplifica a UX.
      try {
        const cached = await base44.asServiceRole.entities.ConfiguracaoSistema.filter(
          { chave: 'dapi_publishable_key' },
          '-created_date',
          1
        );
        if (cached?.[0]?.valor) {
          return Response.json({ success: true, publishable_key: cached[0].valor, cached: true });
        }
      } catch (e) {
        console.log('Cache lookup falhou (ok, criando nova):', e.message);
      }

      const r = await fetch(`${DAPI_BASE}/api/v1/connections/cloud-api/publishable-keys`, {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'content-type': 'application/json' },
        body: '{}'
      });
      if (!r.ok) {
        const t = await r.text();
        return Response.json({ error: `D-API HTTP ${r.status}: ${t.slice(0, 500)}` }, { status: 500 });
      }
      const j = await r.json().catch(() => ({}));
      const pk = j?.data?.key || j?.key || j?.publishableKey || j?.pk;
      if (!pk) {
        return Response.json({ error: 'D-API não retornou a publishable key', response: j }, { status: 500 });
      }

      try {
        await base44.asServiceRole.entities.ConfiguracaoSistema.create({
          chave: 'dapi_publishable_key',
          valor: pk
        });
      } catch (e) {
        console.log('Falha ao cachear pk (ok, retorna sem cache):', e.message);
      }

      return Response.json({ success: true, publishable_key: pk, cached: false });
    }

    // ---------------------------------------------------------- save_connection
    if (action === 'save_connection') {
      const { connectionId, phoneNumber, status, mode, webhookUrl, empresa_id, nome } = body;
      if (!connectionId) return Response.json({ error: 'connectionId obrigatório' }, { status: 400 });
      if (!webhookUrl) return Response.json({ error: 'webhookUrl obrigatório' }, { status: 400 });
      if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });

      // 1. Verificar que a sessão existe na D-API
      const sResp = await fetch(`${DAPI_BASE}/api/v1/sessions/${encodeURIComponent(connectionId)}`, {
        method: 'GET',
        headers: { 'Authorization': apiKey }
      });
      const sData = await sResp.json().catch(() => ({}));
      if (!sResp.ok) {
        return Response.json({
          error: `Sessão ${connectionId} não encontrada na D-API (HTTP ${sResp.status})`,
          response: sData
        }, { status: 400 });
      }
      const session = sData.session || sData;
      const phoneFromSession = session.phoneNumber || session.phone_number ||
        session.displayPhoneNumber || phoneNumber || '';
      const profileName = session.profileName || session.verified_name || '';

      // 2. Registrar webhook-config completo (popula settings.webhook)
      const eventsConfig = {};
      for (const ev of EVENTS) eventsConfig[ev] = { enabled: true, webhookUrl };
      const wcBody = { enabled: true, type: 'per_event', events: eventsConfig };

      const wResp = await fetch(`${DAPI_BASE}/api/v1/sessions/${encodeURIComponent(connectionId)}/webhook-config`, {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(wcBody)
      });
      const wData = await wResp.json().catch(() => ({}));
      if (!wResp.ok) {
        return Response.json({
          error: `Falha ao configurar webhook (HTTP ${wResp.status})`,
          response: wData
        }, { status: 500 });
      }

      // 3. Criar ou atualizar o registro WhatsappConnection (api key em base64)
      const apiKeyEncrypted = btoa(apiKey);
      const nomeFinal = nome || `D-API Cloud ${phoneFromSession || connectionId.slice(0, 8)}`;

      const existing = await base44.asServiceRole.entities.WhatsappConnection.filter(
        { session_id: connectionId },
        null,
        1
      );
      let recordId;

      const base = {
        provider_type: 'dapi',
        base_url: DAPI_BASE,
        api_key_encrypted: apiKeyEncrypted,
        phone_number: phoneFromSession,
        profile_name: profileName,
        status: 'conectado',
        webhook_url: webhookUrl,
        is_active: true,
        last_health_check_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        last_error_at: null,
        last_error_message: null
      };

      if (existing?.[0]) {
        await base44.asServiceRole.entities.WhatsappConnection.update(existing[0].id, base);
        recordId = existing[0].id;
      } else {
        const created = await base44.asServiceRole.entities.WhatsappConnection.create({
          empresa_id,
          nome: nomeFinal,
          ...base
        });
        recordId = created?.id;
      }

      return Response.json({
        success: true,
        connection_id: recordId,
        session: {
          id: connectionId,
          status: session.status,
          provider: session.provider,
          connectionType: session.connectionType
        },
        phone_number: phoneFromSession,
        profile_name: profileName,
        webhook_configured: !!wData?.webhookConfig || !!wData?.message
      });
    }

    return Response.json({ error: 'Ação desconhecida' }, { status: 400 });
  } catch (e) {
    console.error('[dapiCloudConnect] Erro:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
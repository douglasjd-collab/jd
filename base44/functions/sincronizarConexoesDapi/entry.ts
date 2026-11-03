import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * sincronizarConexoesDapi — espelha na tabela WhatsappConnection todos os canais
 * que existem na conta D-API (criados/renomeados no painel da D-API).
 *
 * - Canal novo na D-API  → cria a conexão no CRM (nome = identificador do canal),
 *   já com o webhook do CRM registrado para receber mensagens.
 * - Canal já cadastrado  → apenas atualiza status e telefone (o nome escolhido
 *   no CRM é preservado).
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
  'call.offer', 'call.accepted', 'call.rejected', 'call.ended'
];

const statusDoCrm = (statusDapi: string) => {
  const s = String(statusDapi || '').toLowerCase();
  if (s === 'connected') return 'conectado';
  if (s === 'connecting' || s === 'qr' || s === 'qrcode') return 'aguardando_qr';
  if (s === 'reconnecting' || s === 'restarting') return 'reiniciando';
  return 'desconectado';
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = ['master', 'super_admin', 'admin'].includes(user.perfil);
    if (!isAdmin) return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || user.empresa_id;
    if (!empresaId) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });

    const apiKey = Deno.env.get('DAPI_USER_API_KEY');
    if (!apiKey) return Response.json({ error: 'DAPI_USER_API_KEY não configurado' }, { status: 500 });

    const webhookUrl = body.webhook_url || 'https://app.jdpromotora.com.br/functions/webhookDapi';

    // 1. Canais que existem hoje na D-API
    const resp = await fetch(`${DAPI_BASE}/api/v1/sessions`, {
      headers: { 'Authorization': apiKey },
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return Response.json({ error: `D-API HTTP ${resp.status}`, response: json }, { status: 500 });
    }
    const sessoes = Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.sessions) ? json.sessions
      : Array.isArray(json) ? json : [];

    // 2. Conexões já cadastradas no CRM
    const existentes = await base44.asServiceRole.entities.WhatsappConnection.filter(
      { empresa_id: empresaId }, '-created_date', 500
    );
    const porSessao = new Map((existentes || []).map((c: any) => [String(c.session_id || ''), c]));

    const criadas: string[] = [];
    const atualizadas: string[] = [];
    const falhas: string[] = [];

    for (const sessao of sessoes) {
      const sessionId = String(sessao?.id || '').trim();
      if (!sessionId) continue;

      const phone = String(sessao?.authData?.phone || sessao?.phoneNumber || '').trim();
      const status = statusDoCrm(sessao?.status);
      const existente: any = porSessao.get(sessionId);

      if (existente) {
        const dados: any = {};
        if (status && status !== existente.status) dados.status = status;
        if (phone && phone !== existente.phone_number) dados.phone_number = phone;
        if (Object.keys(dados).length) {
          dados.last_health_check_at = new Date().toISOString();
          await base44.asServiceRole.entities.WhatsappConnection.update(existente.id, dados);
          atualizadas.push(sessionId);
        }
        continue;
      }

      // 3. Canal novo: registrar webhook do CRM e cadastrar a conexão
      let webhookOk = false;
      try {
        const eventos: any = {};
        for (const ev of EVENTS) eventos[ev] = { enabled: true, webhookUrl };
        const wResp = await fetch(`${DAPI_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}/webhook-config`, {
          method: 'POST',
          headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true, type: 'per_event', events: eventos }),
        });
        const wData = await wResp.json().catch(() => ({}));
        webhookOk = wResp.ok && wData?.error !== 'Session not found' && wData?.success !== false;
      } catch (e) {
        console.error(`Falha ao configurar webhook de ${sessionId}:`, e.message);
      }

      try {
        await base44.asServiceRole.entities.WhatsappConnection.create({
          empresa_id: empresaId,
          nome: sessionId,
          session_id: sessionId,
          provider_type: 'dapi',
          base_url: DAPI_BASE,
          api_key_encrypted: btoa(apiKey),
          phone_number: phone,
          profile_name: String(sessao?.profileName || sessao?.metadata?.profileName || ''),
          status,
          webhook_url: webhookOk ? webhookUrl : '',
          is_active: true,
          is_default: false,
          config_json: JSON.stringify({
            uuid: sessao?.connectionId || sessao?.uuid || '',
            readable_session_id: sessionId,
            provider: sessao?.provider || '',
            mode: sessao?.connectionMode || '',
            isOfficial: sessao?.connectionType !== 'unofficial',
          }),
          last_health_check_at: new Date().toISOString(),
        });
        criadas.push(sessionId);
      } catch (e) {
        console.error(`Falha ao cadastrar canal ${sessionId}:`, e.message);
        falhas.push(sessionId);
      }
    }

    return Response.json({
      success: true,
      total_canais_dapi: sessoes.length,
      criadas,
      atualizadas,
      falhas,
    });
  } catch (e) {
    console.error('[sincronizarConexoesDapi] Erro:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
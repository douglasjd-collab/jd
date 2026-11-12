import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DOUGLAS = '6956d1f3d631cbba22ce3021';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.id !== DOUGLAS) return Response.json({ erro: 'Google Meet ainda não autorizado para este colaborador.' }, { status: 403 });
    const body = await req.json();
    const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id }, '-created_date', 30);
    if (!colabs.some((c: any) => c.empresa_id === body.empresa_id && c.status === 'ativo')) {
      return Response.json({ erro: 'Empresa não autorizada' }, { status: 403 });
    }
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    if (body.modo === 'descartar') {
      if (!body.evento_id || !/^[a-z0-9_-]{5,150}$/i.test(body.evento_id)) return Response.json({ erro: 'Evento inválido' }, { status: 400 });
      // Somente eventos provisórios identificados pelo CRM podem ser removidos.
      const check = await fetch(`${BASE}/${encodeURIComponent(body.evento_id)}`, { headers });
      if (check.status === 404 || check.status === 410) return Response.json({ descartado: true });
      if (!check.ok) return Response.json({ erro: 'Não foi possível conferir o evento' }, { status: 502 });
      const event = await check.json();
      if (event.extendedProperties?.private?.jd_meet_previa !== user.id) return Response.json({ erro: 'Evento não é uma prévia desta conta' }, { status: 403 });
      const del = await fetch(`${BASE}/${encodeURIComponent(body.evento_id)}`, { method: 'DELETE', headers });
      return Response.json({ descartado: del.ok || del.status === 404 });
    }
    const inicio = new Date(body.inicio);
    const fim = new Date(body.fim);
    if (!body.titulo?.trim() || !Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) {
      return Response.json({ erro: 'Informe título, início e término válidos.' }, { status: 400 });
    }
    const payload = {
      summary: body.titulo.trim(),
      description: body.descricao || '',
      location: body.local || 'Online',
      start: { dateTime: inicio.toISOString(), timeZone: 'America/Recife' },
      end: { dateTime: fim.toISOString(), timeZone: 'America/Recife' },
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      extendedProperties: { private: { jd_meet_previa: user.id } },
    };
    const url = `${BASE}?conferenceDataVersion=1`;
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return Response.json({ erro: `Google Calendar ${resp.status}: ${data.error?.message || 'Falha ao criar Meet'}` }, { status: 502 });
    const link = data.hangoutLink || data.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri;
    if (!link) {
      // Não deixar evento provisório órfão se a API não gerou conferência.
      await fetch(`${BASE}/${encodeURIComponent(data.id)}`, { method: 'DELETE', headers });
      return Response.json({ erro: 'Google não retornou o link do Meet. Tente novamente.' }, { status: 502 });
    }
    return Response.json({ link, evento_id: data.id });
  } catch (e: any) {
    return Response.json({ erro: e.message || 'Erro ao gerar Google Meet' }, { status: 500 });
  }
}

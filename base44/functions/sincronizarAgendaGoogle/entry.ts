import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const CONTA_GOOGLE = 'douglas.jdpromotora@gmail.com';
const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ erro: 'Não autorizado' }, { status: 401 });
    const body = await req.json();
    if (!body?.agenda_id) return Response.json({ erro: 'agenda_id obrigatório' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const registros = await db.Agenda.filter({ id: body.agenda_id }, '-created_date', 1);
    const agenda = registros?.[0];
    if (!agenda) return Response.json({ erro: 'Reunião não encontrada' }, { status: 404 });
    const colabs = await db.Colaborador.filter({ user_id: user.id }, '-created_date', 30);
    const colab = colabs.find((c: any) => c.empresa_id === agenda.empresa_id && c.status === 'ativo');
    if (!colab && user.role !== 'super_admin') return Response.json({ erro: 'Sem acesso à empresa' }, { status: 403 });
    // Uma conexão compartilhada não equivale a OAuth individual dos vendedores.
    // Só o titular da conta conectada pode publicar na agenda primária.
    if (user.id !== '6956d1f3d631cbba22ce3021') {
      return Response.json({ ignorado: true, motivo: 'Conta Google individual ainda não vinculada ao usuário' });
    }
    const participantes = (() => { try { return JSON.parse(agenda.participantes_json || '[]'); } catch { return []; } })();
    const dono = participantes.some((p: any) => p.user_id === user.id || p.id === colab?.id) ||
      (!participantes.length && agenda.usuario_id === user.id);
    if (!dono) return Response.json({ ignorado: true, motivo: 'Titular não participa da reunião' });
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const eventoId = agenda.google_event_id;
    if (agenda.status === 'cancelado') {
      if (eventoId) {
        const resp = await fetch(`${BASE}/${encodeURIComponent(eventoId)}`, { method: 'DELETE', headers });
        if (!resp.ok && resp.status !== 404 && resp.status !== 410) throw new Error(`Google Calendar: ${resp.status}`);
        await db.Agenda.update(agenda.id, { google_event_id: '', google_sync_status: 'cancelado' });
      }
      return Response.json({ sincronizado: true, cancelado: true });
    }
    const inicio = new Date(agenda.inicio);
    const fim = agenda.fim ? new Date(agenda.fim) : new Date(inicio.getTime() + 3600000);
    if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) {
      return Response.json({ erro: 'Intervalo de reunião inválido' }, { status: 400 });
    }
    const payload = {
      summary: agenda.titulo,
      description: [agenda.descricao, agenda.link_reuniao].filter(Boolean).join('\n'),
      location: agenda.local || '',
      start: { dateTime: inicio.toISOString(), timeZone: 'America/Recife' },
      end: { dateTime: fim.toISOString(), timeZone: 'America/Recife' },
      extendedProperties: { private: { jd_agenda_id: agenda.id } },
    };
    const resp = await fetch(eventoId ? `${BASE}/${encodeURIComponent(eventoId)}` : BASE, {
      method: eventoId ? 'PATCH' : 'POST', headers, body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const erro = await resp.text();
      return Response.json({ erro: `Google Calendar ${resp.status}: ${erro.slice(0,300)}` }, { status: 502 });
    }
    const evento = await resp.json();
    await db.Agenda.update(agenda.id, { google_event_id: evento.id, google_sync_status: 'sincronizado', google_sync_em: new Date().toISOString() });
    return Response.json({ sincronizado: true, google_event_id: evento.id, link: evento.htmlLink });
  } catch (e: any) {
    return Response.json({ erro: e.message || 'Erro de sincronização' }, { status: 500 });
  }
}

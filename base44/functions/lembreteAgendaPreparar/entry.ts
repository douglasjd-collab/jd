import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import {
  horaDoLembrete,
  temposDoConfig,
  JANELA_TOLERANCIA_MS,
} from '../../shared/lembretesAgendaShared.ts';

// Calcula quanto falta até o próximo lembrete deste compromisso.
// É o único ponto que decide "esperar X segundos" — o workflow dorme esse tempo
// e só então envia, sem consultar a agenda em intervalos fixos.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { agenda_id } = await req.json().catch(() => ({}));
    if (!agenda_id) return Response.json({ aguardar: false, motivo: 'sem_id' });

    const comp = await base44.asServiceRole.entities.Agenda.get(agenda_id).catch(() => null);
    if (!comp) return Response.json({ aguardar: false, motivo: 'nao_encontrada' });
    if (!['agendado', 'confirmado'].includes(comp.status)) {
      return Response.json({ aguardar: false, motivo: 'status_' + comp.status });
    }
    if (!comp.inicio) return Response.json({ aguardar: false, motivo: 'sem_inicio' });

    const inicioMs = new Date(comp.inicio).getTime();
    const now = Date.now();
    if (inicioMs <= now) return Response.json({ aguardar: false, motivo: 'compromisso_passado' });

    const configs = await base44.asServiceRole.entities.ConfiguracaoLembretesAgenda.filter({
      empresa_id: comp.empresa_id,
      ativo: true,
    });
    const config = configs?.[0];
    if (!config) return Response.json({ aguardar: false, motivo: 'sem_configuracao' });

    const enviados = await base44.asServiceRole.entities.AgendaLembretesEnviados.filter({
      agenda_id,
      status: 'enviado',
    });
    const temposEnviados = new Set((enviados || []).map((e: any) => Number(e.minutos_antes)));

    // Só entram os tempos ainda pendentes cuja janela não expirou (evita
    // disparar lembretes muito atrasados de compromissos criados em cima da hora).
    const pendentes = temposDoConfig(config).filter((tempo: number) => {
      if (temposEnviados.has(tempo)) return false;
      return horaDoLembrete(inicioMs, tempo) > now - JANELA_TOLERANCIA_MS;
    });

    if (!pendentes.length) return Response.json({ aguardar: false, motivo: 'nada_pendente' });

    const alvos = pendentes.map((tempo: number) => ({ minutos_antes: tempo, ms: horaDoLembrete(inicioMs, tempo) }));
    const futuro = alvos.filter((a: any) => a.ms > now).sort((a: any, b: any) => a.ms - b.ms)[0];
    const alvo = futuro || alvos[alvos.length - 1];
    const segundos = Math.max(0, Math.round((alvo.ms - now) / 1000));

    return Response.json({
      aguardar: true,
      minutos_antes: alvo.minutos_antes,
      alvo_iso: new Date(alvo.ms).toISOString(),
      segundos,
      pendentes,
    });
  } catch (e: any) {
    console.error('lembreteAgendaPreparar:', e);
    return Response.json({ error: e.message, aguardar: false }, { status: 500 });
  }
});
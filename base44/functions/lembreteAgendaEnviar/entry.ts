import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import {
  enviarLembretesDoTempo,
  horaDoLembrete,
  temposDoConfig,
  JANELA_TOLERANCIA_MS,
} from '../../shared/lembretesAgendaShared.ts';

// Envia os lembretes que já venceram para um compromisso. Chamado pelo workflow
// no instante exato de cada lembrete (nenhuma varredura periódica da agenda).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { agenda_id } = await req.json().catch(() => ({}));
    if (!agenda_id) return Response.json({ success: false, motivo: 'sem_id' });

    const comp = await base44.asServiceRole.entities.Agenda.get(agenda_id).catch(() => null);
    if (!comp) return Response.json({ success: true, motivo: 'nao_encontrada', enviados: 0, erros: 0 });
    if (!['agendado', 'confirmado'].includes(comp.status)) {
      return Response.json({ success: true, motivo: 'status_' + comp.status, enviados: 0, erros: 0 });
    }
    if (!comp.inicio) return Response.json({ success: true, motivo: 'sem_inicio', enviados: 0, erros: 0 });

    const inicioMs = new Date(comp.inicio).getTime();
    const now = Date.now();
    if (inicioMs <= now) {
      return Response.json({ success: true, motivo: 'compromisso_passado', enviados: 0, erros: 0 });
    }

    const configs = await base44.asServiceRole.entities.ConfiguracaoLembretesAgenda.filter({
      empresa_id: comp.empresa_id,
      ativo: true,
    });
    const config = configs?.[0];
    if (!config) return Response.json({ success: true, motivo: 'sem_configuracao', enviados: 0, erros: 0 });

    const enviados = await base44.asServiceRole.entities.AgendaLembretesEnviados.filter({
      agenda_id,
      status: 'enviado',
    });
    const temposEnviados = new Set((enviados || []).map((e: any) => Number(e.minutos_antes)));

    // Vencidos (já passou o horário) e ainda dentro da janela de tolerância.
    const devidos = temposDoConfig(config).filter((tempo: number) => {
      if (temposEnviados.has(tempo)) return false;
      const alvoMs = horaDoLembrete(inicioMs, tempo);
      return alvoMs <= now + 60000 && alvoMs > now - JANELA_TOLERANCIA_MS;
    });

    let totalEnviados = 0;
    let totalErros = 0;
    for (const tempo of devidos) {
      const r = await enviarLembretesDoTempo(base44, comp, config, tempo);
      totalEnviados += r.enviados;
      totalErros += r.erros;
    }

    return Response.json({ success: true, enviados: totalEnviados, erros: totalErros, tempos: devidos });
  } catch (e: any) {
    console.error('lembreteAgendaEnviar:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
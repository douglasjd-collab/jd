import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { enviarLembretesDoTempo } from '../../shared/lembretesAgendaShared.ts';

// Rede de segurança: confere se algum lembrete venceu e ainda não saiu
// (ex: o workflow do compromisso não executou). Usa a MESMA regra do envio
// principal, então o contato e todos os participantes da reunião são avisados.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const configs = await base44.asServiceRole.entities.ConfiguracaoLembretesAgenda.filter({ ativo: true });
    if (!configs || configs.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma configuração ativa encontrada' });
    }

    const now = new Date();
    let totalEnviados = 0;
    let totalErros = 0;

    for (const config of configs) {
      const empresaId = config.empresa_id;
      const tempos: number[] = (config.tempos_minutos?.length ? config.tempos_minutos : [60, 10])
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isFinite(n) && n >= 0);

      const maxMinutos = Math.max(...tempos, 60);
      const minMinutos = Math.min(...tempos);
      const inicioJanela = new Date(now.getTime() + Math.max(0, minMinutos - 3) * 60 * 1000);
      const fimJanela = new Date(now.getTime() + (maxMinutos + 3) * 60 * 1000);

      const compromissos = await base44.asServiceRole.entities.Agenda.filter({
        empresa_id: empresaId,
        status: { $in: ['agendado', 'confirmado'] },
        inicio: { $gte: inicioJanela.toISOString(), $lte: fimJanela.toISOString() },
      }, 'inicio', 100);

      for (const comp of (compromissos || [])) {
        const inicio = new Date(comp.inicio);
        const diffMin = (inicio.getTime() - now.getTime()) / 60000;

        for (const minAntes of tempos) {
          // Janela de seis minutos cobre a verificação automática a cada cinco minutos.
          if (diffMin > minAntes + 3 || diffMin < minAntes - 3) continue;
          const r = await enviarLembretesDoTempo(base44, comp, config, minAntes);
          totalEnviados += r.enviados;
          totalErros += r.erros;
        }
      }
    }

    return Response.json({ success: true, enviados: totalEnviados, erros: totalErros });
  } catch (e: any) {
    console.error('Erro processarLembretesAgendaWhatsApp:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
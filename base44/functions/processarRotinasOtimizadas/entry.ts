import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const agora = new Date();
    const agoraISO = agora.toISOString();
    const resultados: Record<string, unknown> = {};

    // Mensagens: só invoca o processador quando existe envio vencido.
    const mensagens = await base44.asServiceRole.entities.MensagemAgendada.filter({
      status: 'agendada',
      proxima_execucao: { $lte: agoraISO },
    }, 'proxima_execucao', 1);
    if (mensagens.length) {
      resultados.mensagens = await base44.asServiceRole.functions.invoke('processarMensagensAgendadas', {});
    }

    // Agenda: só verifica lembretes quando há compromisso dentro da maior janela usada (65 min).
    const configsAgenda = await base44.asServiceRole.entities.ConfiguracaoLembretesAgenda.filter({ ativo: true }, '-created_date', 10);
    if (configsAgenda.length) {
      const limiteAgenda = new Date(agora.getTime() + 65 * 60 * 1000).toISOString();
      const compromissos = await base44.asServiceRole.entities.Agenda.filter({
        status: { $in: ['agendado', 'confirmado'] },
        inicio: { $gte: agoraISO, $lte: limiteAgenda },
      }, 'inicio', 1);
      if (compromissos.length) {
        resultados.agenda = await base44.asServiceRole.functions.invoke('processarLembretesAgendaWhatsApp', {});
      }
    }

    // Fila/campanhas: evita chamar a rotina quando não há nada vencido.
    const [filaVencida, campanhaVencida] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter({
        responsavel_id: { $exists: true, $ne: null },
        responsavel_expira_em: { $lte: agoraISO },
        atendimento_prioritario: { $ne: true },
      }, 'responsavel_expira_em', 1),
      base44.asServiceRole.entities.Campanha.filter({
        status: 'agendada',
        canal: 'whatsapp_nao_oficial',
        agendada_para: { $lte: agoraISO },
      }, 'agendada_para', 1),
    ]);
    if (filaVencida.length || campanhaVencida.length) {
      resultados.fila = await base44.asServiceRole.functions.invoke('gerenciarFilaAtendimento', {});
    }

    // Propostas: consulta já inclui o limite de 3 horas para não carregar links novos.
    const limiteProposta = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const propostas = await base44.asServiceRole.entities.PropostaLinkSimulacao.filter({
      aberta: false,
      alerta_nao_abriu_enviado: false,
      created_date: { $lte: limiteProposta },
    }, 'created_date', 1);
    if (propostas.length) {
      resultados.propostas = await base44.asServiceRole.functions.invoke('verificarPropostasLinkNaoAbertas', {});
    }

    // Follow-ups do funil precisam apenas de precisão horária, não de varredura a cada 5 min.
    if (agora.getUTCMinutes() < 5) {
      const [automacoes, oportunidades] = await Promise.all([
        base44.asServiceRole.entities.AutomacaoFunil.filter({ ativo: true }, '-created_date', 1),
        base44.asServiceRole.entities.Oportunidade.filter({ status: 'aberta' }, '-created_date', 1),
      ]);
      if (automacoes.length && oportunidades.length) {
        resultados.funil = await base44.asServiceRole.functions.invoke('processarAutomacoesFunil', {});
      }
    }

    return Response.json({
      success: true,
      executadas: Object.keys(resultados),
      ociosas_puladas: 5 - Object.keys(resultados).length,
      timestamp: agoraISO,
    });
  } catch (error) {
    console.error('Erro no processador otimizado:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

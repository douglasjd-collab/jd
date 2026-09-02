import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  registrarConsumo,
  obterTrava,
  liberarTrava,
} from '../../shared/consumoControlShared.ts';

/**
 * Processador central otimizado — ponto único de agendamento.
 *
 * PRINCÍPIO: consulta primeiro uma fila/indicador leve de pendências.
 * Só invoca funções secundárias quando encontra trabalho real.
 * Sem pendências → não chama NENHUMA função secundária (0 integrações).
 *
 * Substitui as automações individuais de:
 *  - processarMensagensAgendadas (5 min)
 *  - gerenciarFilaAtendimento (5 min)
 *  - processarLembretesAgendaWhatsApp (5 min)
 *  - verificarPropostasLinkNaoAbertas (30 min)
 *  - processarAutomacoesFunil (15 min)
 *
 * Cada verificação usa limit=1 (existe/não existe) para minimizar leituras.
 */
Deno.serve(async (req) => {
  const inicio = Date.now();
  const base44 = createClientFromRequest(req);
  const agora = new Date();
  const agoraISO = agora.toISOString();
  const resultados: Record<string, unknown> = {};
  let integracoesFeitas = 0;

  // Trava contra execução simultânea do processador central
  const conseguiuTrava = await obterTrava(base44, 'processarRotinasOtimizadas', 5);
  if (!conseguiuTrava) {
    await registrarConsumo(base44, {
      funcao_nome: 'processarRotinasOtimizadas',
      origem: 'automacao',
      resultado: 'pulado',
      motivo: 'Trava: outra execução em andamento',
      duracao_ms: Date.now() - inicio,
    });
    return Response.json({ success: true, skipped: true, reason: 'lock' });
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1) MENSGENS AGENDADAS — só processa se existe envio vencido
    // ═══════════════════════════════════════════════════════════════
    const mensagensPendentes = await base44.asServiceRole.entities.MensagemAgendada.filter(
      { status: 'agendada', proxima_execucao: { $lte: agoraISO } },
      'proxima_execucao',
      1
    );
    if (mensagensPendentes.length > 0) {
      resultados.mensagens = await base44.asServiceRole.functions.invoke('processarMensagensAgendadas', {});
      integracoesFeitas++;
    }

    // ═══════════════════════════════════════════════════════════════
    // 2) FILA DE ATENDIMENTO — só se há responsável expirado OU campanha agendada
    // ═══════════════════════════════════════════════════════════════
    const [filaVencida, campanhaVencida] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter(
        {
          responsavel_id: { $exists: true, $ne: null },
          responsavel_expira_em: { $lte: agoraISO },
          atendimento_prioritario: { $ne: true },
        },
        'responsavel_expira_em',
        1
      ),
      base44.asServiceRole.entities.Campanha.filter(
        {
          status: 'agendada',
          canal: 'whatsapp_nao_oficial',
          agendada_para: { $lte: agoraISO },
        },
        'agendada_para',
        1
      ),
    ]);
    if (filaVencida.length > 0 || campanhaVencida.length > 0) {
      resultados.fila = await base44.asServiceRole.functions.invoke('gerenciarFilaAtendimento', {});
      integracoesFeitas++;
    }

    // ═══════════════════════════════════════════════════════════════
    // 3) LEMBRETES DE AGENDA — só se há config ativa E compromisso na janela
    // ═══════════════════════════════════════════════════════════════
    const configsAgenda = await base44.asServiceRole.entities.ConfiguracaoLembretesAgenda.filter(
      { ativo: true },
      '-created_date',
      1
    );
    if (configsAgenda.length > 0) {
      const limiteAgenda = new Date(agora.getTime() + 65 * 60 * 1000).toISOString();
      const compromissos = await base44.asServiceRole.entities.Agenda.filter(
        {
          status: { $in: ['agendado', 'confirmado'] },
          inicio: { $gte: agoraISO, $lte: limiteAgenda },
        },
        'inicio',
        1
      );
      if (compromissos.length > 0) {
        resultados.lembretes = await base44.asServiceRole.functions.invoke('processarLembretesAgendaWhatsApp', {});
        integracoesFeitas++;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 4) PROPOSTAS NÃO ABERTAS — só se há link com >3h não aberto
    // ═══════════════════════════════════════════════════════════════
    const limiteProposta = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const propostasPendentes = await base44.asServiceRole.entities.PropostaLinkSimulacao.filter(
      {
        aberta: false,
        alerta_nao_abriu_enviado: false,
        created_date: { $lte: limiteProposta },
      },
      'created_date',
      1
    );
    if (propostasPendentes.length > 0) {
      resultados.propostas = await base44.asServiceRole.functions.invoke('verificarPropostasLinkNaoAbertas', {});
      integracoesFeitas++;
    }

    // ═══════════════════════════════════════════════════════════════
    // 5) FOLLOW-UPS DO FUNIL — precisão horária, não a cada 5 min
    // Só executa no primeiro minuto de cada hora
    // ═══════════════════════════════════════════════════════════════
    if (agora.getUTCMinutes() < 5) {
      const [automacoes, oportunidades] = await Promise.all([
        base44.asServiceRole.entities.AutomacaoFunil.filter({ ativo: true }, '-created_date', 1),
        base44.asServiceRole.entities.Oportunidade.filter({ status: 'aberta' }, '-created_date', 1),
      ]);
      if (automacoes.length > 0 && oportunidades.length > 0) {
        resultados.funil = await base44.asServiceRole.functions.invoke('processarAutomacoesFunil', {});
        integracoesFeitas++;
      }
    }

    const duracao = Date.now() - inicio;
    const executadas = Object.keys(resultados);
    const houveTrabalho = executadas.length > 0;

    await registrarConsumo(base44, {
      funcao_nome: 'processarRotinasOtimizadas',
      origem: 'automacao',
      resultado: houveTrabalho ? 'util' : 'vazio',
      duracao_ms: duracao,
      motivo: houveTrabalho
        ? `Executadas: ${executadas.join(', ')}`
        : 'Nenhuma pendência — nenhuma função secundária chamada',
      integracoes_feitas: integracoesFeitas,
    });

    return Response.json({
      success: true,
      executadas: executadas,
      ociosas_puladas: 5 - executadas.length,
      integracoes_feitas: integracoesFeitas,
      timestamp: agoraISO,
      duracao_ms: duracao,
    });
  } catch (error) {
    console.error('Erro no processador otimizado:', error);
    await registrarConsumo(base44, {
      funcao_nome: 'processarRotinasOtimizadas',
      origem: 'automacao',
      resultado: 'erro',
      duracao_ms: Date.now() - inicio,
      motivo: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    await liberarTrava(base44, 'processarRotinasOtimizadas');
  }
});
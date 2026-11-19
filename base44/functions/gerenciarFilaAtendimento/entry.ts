import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Automações inteligentes da fila de atendimento do Bate-Papo:
// 1) Atendimento ativo com 30 minutos de inatividade: devolve para Esperando.
// 2) Inicia campanhas não oficiais cuja data/hora agendada já chegou.
// Executada periodicamente pela automação agendada existente.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    // Permite execução manual por admin ou por automação (sem user)
    if (user && !['admin', 'master', 'super_admin', 'gerente'].includes(user.perfil)) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const agora = new Date().toISOString();
    let totalLimpos = 0;
    let hasMore = true;

    // Atualiza individualmente apenas atendimentos ativos, nunca finalizados ou prioritários.
    // Evita operadores de atualização em massa incompatíveis com o SDK.
    while (hasMore) {
      const vencidas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { status: 'ativa', responsavel_expira_em: { $lte: agora } },
        'responsavel_expira_em', 100
      );
      const elegiveis = vencidas.filter(c => c.responsavel_id && !c.atendimento_prioritario);
      for (const conversa of elegiveis) {
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
          status: 'ativa', ultimo_remetente: 'cliente',
          responsavel_id: null, responsavel_nome: null, responsavel_user_id: null,
          responsavel_expira_em: null, atendimento_transferido_para_id: null,
        });
        totalLimpos++;
      }
      hasMore = vencidas.length === 100 && elegiveis.length > 0;
    }

    // Iniciar campanhas não oficiais agendadas cuja hora já chegou.
    const campanhasAgendadas = await base44.asServiceRole.entities.Campanha.filter(
      {
        status: 'agendada',
        canal: 'whatsapp_nao_oficial',
        agendada_para: { $lte: agora },
      },
      'agendada_para',
      50
    );

    let campanhasIniciadas = 0;
    for (const campanha of campanhasAgendadas || []) {
      try {
        // Reivindica a campanha antes de disparar para impedir duas execuções simultâneas.
        await base44.asServiceRole.entities.Campanha.update(campanha.id, {
          status: 'executando',
          inicio_execucao: campanha.inicio_execucao || agora,
        });
        await base44.asServiceRole.functions.invoke('dispararCampanhaNaoOficial', {
          campanha_id: campanha.id,
        });
        campanhasIniciadas++;
      } catch (error) {
        console.error('Erro ao iniciar campanha agendada:', campanha.id, error);
        await base44.asServiceRole.entities.Campanha.update(campanha.id, {
          status: 'erro',
          fim_execucao: new Date().toISOString(),
        });
      }
    }

    return Response.json({
      success: true,
      processados: totalLimpos,
      campanhas_iniciadas: campanhasIniciadas,
      mensagem: `${totalLimpos} conversa(s) retornaram para Esperando após 30 minutos de inatividade; ${campanhasIniciadas} campanha(s) agendada(s) iniciada(s).`,
    });
  } catch (error) {
    console.error('Erro em gerenciarFilaAtendimento:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
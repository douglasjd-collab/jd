import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Automações inteligentes da fila de atendimento do Bate-Papo:
// 1) Atendimento expirado (15 min sem interação): limpa responsavel → conversa volta para Esperando
// 2) Transferência sem resposta (5 min): reativa conversa encerrada → status='ativa', ultimo_remetente='cliente' (Esperando)
// Executada a cada 5 minutos via automação agendada.
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

    // Conversas (ativas ou encerradas) com responsavel expirado → volta para Esperando
    while (hasMore) {
      const resp = await base44.asServiceRole.entities.ConversaWhatsapp.updateMany(
        {
          responsavel_id: { $exists: true, $ne: null },
          responsavel_expira_em: { $lte: agora },
        },
        {
          $set: { status: 'ativa', ultimo_remetente: 'cliente' },
          $unset: { responsavel_id: '', responsavel_nome: '', responsavel_expira_em: '' },
        }
      );
      totalLimpos += resp?.modified_count || resp?.n || 0;
      hasMore = !!resp?.has_more;
    }

    return Response.json({
      success: true,
      processados: totalLimpos,
      mensagem: `${totalLimpos} conversa(s) retornaram para Esperando (atendimento/transferência expirados).`,
    });
  } catch (error) {
    console.error('Erro em gerenciarFilaAtendimento:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
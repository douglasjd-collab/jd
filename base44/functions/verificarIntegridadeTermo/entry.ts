import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CAMPOS_SENSIVEIS = [
  'cliente_nome', 'cliente_cpf', 'administradora_nome', 'contrato',
  'valor_credito', 'valor_liquido', 'emprestimo_valor_parcela', 'emprestimo_prazo', 'emprestimo_tipo',
];

const MOTIVO_PADRAO = 'Foi detectada alteração nos dados vinculados ao documento. Todas as assinaturas foram invalidadas. Uma nova versão deverá ser gerada e assinada novamente.';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data, old_data, payload_too_large, event } = body;

    if (!event || event.type !== 'update') return Response.json({ skipped: true });

    let proposta = data;
    let propostaAnterior = old_data;
    if (payload_too_large) {
      proposta = await base44.asServiceRole.entities.Proposta.get(event.entity_id);
      propostaAnterior = null;
    }
    if (!proposta || !propostaAnterior) return Response.json({ skipped: true });

    const mudou = CAMPOS_SENSIVEIS.some(
      (campo) => JSON.stringify(proposta[campo]) !== JSON.stringify(propostaAnterior[campo])
    );
    if (!mudou) return Response.json({ skipped: true });

    const termos = await base44.asServiceRole.entities.TermoAutorizacao.filter({
      proposta_id: proposta.id,
      status: 'assinado',
    });
    if (termos.length === 0) return Response.json({ skipped: true });

    for (const termo of termos) {
      await base44.asServiceRole.entities.TermoAutorizacao.update(termo.id, {
        status: 'invalidado',
        invalidado_em: new Date().toISOString(),
        invalidado_motivo: MOTIVO_PADRAO,
      });

      const solicitacoes = await base44.asServiceRole.entities.SolicitacaoAssinatura.filter({
        termo_autorizacao_id: termo.id,
      });

      for (const sol of solicitacoes) {
        if (sol.status !== 'cancelado') {
          await base44.asServiceRole.entities.SolicitacaoAssinatura.update(sol.id, { status: 'cancelado' });
        }
        await base44.asServiceRole.entities.AssinaturaLogs.create({
          solicitacao_id: sol.id,
          termo_autorizacao_id: termo.id,
          proposta_id: proposta.id,
          empresa_id: termo.empresa_id || '',
          evento: 'documento_invalidado',
          papel: '',
          usuario_nome: 'Sistema',
          resultado: 'invalidado',
          detalhes: 'Alteração detectada nos dados vinculados após a assinatura.',
          data_hora: new Date().toISOString(),
        });
      }
    }

    return Response.json({ success: true, termosInvalidados: termos.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
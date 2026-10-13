// Uma resposta confirma somente a leitura das mensagens anteriores a ela.
// Não altera recibos de entrega/leitura das mensagens enviadas ao cliente.
export async function marcarRecebidasAteResposta(entities, empresaId, conversaId, dataResposta) {
  if (!empresaId || !conversaId || !dataResposta) return 0;
  const corte = new Date(dataResposta);
  if (!Number.isFinite(corte.getTime())) return 0;
  const lidaEm = corte.toISOString();
  let total = 0;
  while (true) {
    const pendentes = await entities.MensagemWhatsapp.filter({
      empresa_id: empresaId,
      conversa_id: conversaId,
      remetente: 'cliente',
      status: { $ne: 'lida' },
      data_envio: { $lte: lidaEm }
    }, 'data_envio', 100);
    if (!pendentes.length) return total;
    for (let i = 0; i < pendentes.length; i += 5) {
      await Promise.all(pendentes.slice(i, i + 5).map(msg =>
        entities.MensagemWhatsapp.update(msg.id, { status: 'lida', lida_em: lidaEm })
      ));
    }
    total += pendentes.length;
  }
}

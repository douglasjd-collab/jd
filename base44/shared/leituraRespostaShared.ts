// Uma resposta confirma apenas as mensagens de cliente anteriores ao envio.
// Uma operação em lote evita que centenas de atualizações atrasem a confirmação.
export async function marcarRecebidasAteResposta(entities, empresaId, conversaId, dataResposta) {
  if (!empresaId || !conversaId || !dataResposta) return 0;
  const corte = new Date(dataResposta);
  if (!Number.isFinite(corte.getTime())) return 0;
  const lidaEm = corte.toISOString();
  const result = await entities.MensagemWhatsapp.updateMany({
    empresa_id: empresaId,
    conversa_id: conversaId,
    remetente: 'cliente',
    status: { $ne: 'lida' },
    data_envio: { $lte: lidaEm }
  }, { $set: { status: 'lida', lida_em: lidaEm } });
  return result.updated || 0;
}

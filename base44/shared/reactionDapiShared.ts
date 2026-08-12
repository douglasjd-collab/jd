/**
 * Processamento de reações WhatsApp recebidas via D-API.
 *
 * Reações (emoji aplicado a uma mensagem existente) NUNCA devem criar uma nova
 * bolha no chat — elas apenas atualizam o campo `reaction` da mensagem original.
 * Se o emoji for vazio, a reação foi removida no WhatsApp e o campo é limpo.
 *
 * Extraído para shared/ porque tanto `webhookDapi` quanto `receberWebhookDapi`
 * precisam da mesma lógica de interceptação.
 */

export async function processReactionDapi(base44, data, empresaId) {
  const tipo = String(
    data?.type || data?.messageType || data?.message_type ||
    data?.data?.type || ''
  ).toLowerCase();

  const reactionData =
    data?.reactionMessage ||
    data?.reaction_message ||
    data?.reaction ||
    data?.data?.reactionMessage ||
    data?.data?.reaction_message ||
    data?.data?.reaction ||
    data?.data ||
    {};

  const pareceReacao =
    tipo === 'reaction' ||
    tipo === 'reacao' ||
    tipo === 'reação' ||
    !!data?.reactionMessage ||
    !!data?.reaction_message ||
    !!data?.reaction ||
    !!data?.data?.reactionMessage ||
    !!data?.data?.reaction_message ||
    typeof data?.data?.reaction_text === 'string';

  if (!pareceReacao) return null;

  const targetId =
    reactionData?.key?.id ||
    reactionData?.message_id ||
    reactionData?.messageId ||
    reactionData?.reaction_message_id ||
    reactionData?.reactionMessageId ||
    reactionData?.target_message_id ||
    reactionData?.targetMessageId ||
    data?.contextInfo?.stanza_id ||
    data?.contextInfo?.stanzaId ||
    data?.contextInfo?.quoted_message_id ||
    data?.context_info?.stanza_id ||
    data?.context_info?.quoted_message_id ||
    '';

  const emojiRaw =
    reactionData?.text ??
    reactionData?.emoji ??
    reactionData?.reaction_text ??
    data?.data?.reaction_text ??
    data?.emoji ??
    (typeof data?.text === 'string' ? data.text : '') ??
    '';

  const emoji = String(emojiRaw || '').trim();

  if (!targetId) {
    console.warn('⚠️ [Webhook D-API] Reação recebida sem ID da mensagem original');
    return { handled: true, reaction: true, updated: false, reason: 'target message id ausente' };
  }

  const originais = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
    empresa_id: empresaId,
    whatsapp_message_id: String(targetId)
  }, '-created_date', 1);

  if (!originais?.length) {
    console.warn(`⚠️ [Webhook D-API] Mensagem original da reação não encontrada: ${targetId}`);
    return {
      handled: true,
      reaction: true,
      updated: false,
      targetId: String(targetId),
      reason: 'mensagem original não encontrada'
    };
  }

  const original = originais[0];
  await base44.asServiceRole.entities.MensagemWhatsapp.update(original.id, {
    // Emoji vazio significa que a reação foi removida no WhatsApp.
    reaction: emoji || null
  });

  console.log(`✅ [Webhook D-API] Reação "${emoji}" aplicada à mensagem ${original.id}`);
  return {
    handled: true,
    reaction: true,
    updated: true,
    messageId: original.id,
    targetId: String(targetId),
    emoji
  };
}
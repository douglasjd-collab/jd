import { base44 } from '@/api/base44Client';

/**
 * Marca todas as mensagens de cliente como lidas ao abrir a conversa
 */
export const marcarConversaComoLida = async (conversaId) => {
  try {
    const msgs = await base44.entities.MensagemWhatsapp.filter({
      conversa_id: conversaId,
      remetente: 'cliente',
      status: { $ne: 'lida' }
    }, null, 1000);

    for (const msg of msgs) {
      await base44.entities.MensagemWhatsapp.update(msg.id, { status: 'lida' }).catch(() => {});
    }
  } catch (e) {
    console.warn('Erro ao marcar conversa como lida:', e);
  }
};
import { base44 } from '@/api/base44Client';

export const marcarConversaComoLida = async (conversaId) => {
  const corte = new Date().toISOString();
  try {
    await base44.entities.MensagemWhatsapp.updateMany({
      conversa_id: conversaId,
      remetente: 'cliente',
      status: { $ne: 'lida' },
      data_envio: { $lte: corte }
    }, { $set: { status: 'lida', lida_em: corte } });
  } catch (e) {
    console.warn('Erro ao marcar conversa como lida:', e);
  }
};

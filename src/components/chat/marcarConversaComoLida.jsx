import { base44 } from '@/api/base44Client';

/** Confirma a leitura até a abertura, sem consumir mensagens novas posteriores. */
export const marcarConversaComoLida = async (conversaId) => {
  const corte = new Date().toISOString();
  try {
    while (true) {
      const msgs = await base44.entities.MensagemWhatsapp.filter({
        conversa_id: conversaId,
        remetente: 'cliente',
        status: { $ne: 'lida' },
        data_envio: { $lte: corte }
      }, 'data_envio', 100);
      if (!msgs.length) return;
      for (let i = 0; i < msgs.length; i += 5) {
        await Promise.all(msgs.slice(i, i + 5).map(msg =>
          base44.entities.MensagemWhatsapp.update(msg.id, { status: 'lida', lida_em: corte })
        ));
      }
    }
  } catch (e) {
    console.warn('Erro ao marcar conversa como lida:', e);
  }
};

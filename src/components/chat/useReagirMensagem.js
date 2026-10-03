import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Reagir a uma mensagem do WhatsApp (emoji único que fica "grudado" na mensagem
 * original — imagem, PDF, áudio ou texto).
 *
 * O backend enviarMensagemWhatsapp detecta o padrão (1 emoji + resposta_para_message_id),
 * envia a reação ao WhatsApp (D-API / Meta / Evolution) e grava o emoji no campo
 * `reaction` da mensagem original.
 */
export default function useReagirMensagem({ conversa, isGrupo = false }) {
  const queryClient = useQueryClient();

  const reagir = useCallback(async (mensagem, emoji) => {
    if (!conversa?.id || !mensagem?.whatsapp_message_id) {
      toast.error('Não foi possível reagir a esta mensagem.');
      return;
    }

    const queryKey = ['mensagens-whatsapp', conversa.id];
    const anteriores = queryClient.getQueryData(queryKey);

    // Otimista: a reação aparece no CRM imediatamente
    queryClient.setQueryData(queryKey, (old = []) =>
      old.map(m => (m.id === mensagem.id ? { ...m, reaction: emoji } : m))
    );

    try {
      const destinatario = isGrupo
        ? conversa.whatsapp_id
        : conversa.cliente_telefone;

      const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversa.id,
        mensagem_texto: emoji,
        numero_cliente: destinatario,
        empresa_id: conversa.empresa_id,
        resposta_para_message_id: mensagem.whatsapp_message_id,
        resposta_para_id: mensagem.id,
      });

      if (!resp?.data?.success) {
        throw new Error(resp?.data?.error || 'Erro ao enviar reação');
      }

      queryClient.refetchQueries({ queryKey, type: 'active' });
    } catch (e) {
      if (anteriores) queryClient.setQueryData(queryKey, anteriores);
      toast.error(e.message || 'Erro ao reagir à mensagem');
    }
  }, [conversa, isGrupo, queryClient]);

  return reagir;
}
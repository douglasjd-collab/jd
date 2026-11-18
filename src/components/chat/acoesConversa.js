import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

// Mesmas ações do menu da conversa, usadas pelos gestos de deslizar o card.
const atualizarLista = (queryClient, empresaId, conversaId, campos) => {
  queryClient?.setQueriesData({ queryKey: ['conversas-whatsapp', empresaId] }, (antiga) =>
    Array.isArray(antiga)
      ? antiga.map(cv => (cv.id === conversaId ? { ...cv, ...campos } : cv))
      : antiga
  );
};

export async function finalizarConversa(conversa, { empresaId, queryClient, refetchConversas }) {
  const campos = { status: 'encerrada', responsavel_id: null, responsavel_nome: null };
  atualizarLista(queryClient, empresaId, conversa.id, campos);
  await base44.entities.ConversaWhatsapp.update(conversa.id, campos);
  toast.success('Conversa finalizada');
  refetchConversas?.();
}

export async function reabrirConversa(conversa, { empresaId, queryClient, refetchConversas }) {
  const campos = {
    status: 'ativa',
    responsavel_id: null,
    responsavel_nome: null,
    responsavel_expira_em: null,
    atendimento_transferido_para_id: null,
  };
  atualizarLista(queryClient, empresaId, conversa.id, campos);
  await base44.entities.ConversaWhatsapp.update(conversa.id, campos);
  toast.success('Conversa reaberta');
  refetchConversas?.();
}
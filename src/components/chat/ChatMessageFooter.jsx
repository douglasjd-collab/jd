import React from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import EnviarMensagemForm from './EnviarMensagemForm';

export default function ChatMessageFooter({
  conversaSelecionada,
  mensagemParaResponder,
  setMensagemParaResponder,
  enviarMensagemMutation,
  user,
  empresaId,
  selecionarConversa,
}) {
  const queryClient = useQueryClient();

  if (conversaSelecionada?.status === 'encerrada') {
    return (
      <div className="bg-emerald-50 border-t border-emerald-200 px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">Conversa finalizada</p>
        </div>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-white"
          onClick={async () => {
            await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
              status: 'ativa',
              responsavel_id: null,
              responsavel_expira_em: null,
            });
            queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
            selecionarConversa({
              ...conversaSelecionada,
              status: 'ativa',
              responsavel_id: null,
              responsavel_expira_em: null,
            });
            toast.success('✅ Conversa reaberta!');
          }}
        >
          <Unlock className="w-4 h-4" />
          Reabrir conversa
        </Button>
      </div>
    );
  }

  return (
    <>
      {mensagemParaResponder && (
        <div className="bg-blue-50 border-l-4 border-blue-500 px-4 py-3 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-600 mb-1">Respondendo a:</p>
            <p className="text-sm text-slate-700 truncate">
              {mensagemParaResponder.texto || `[${mensagemParaResponder.tipo_conteudo}]`}
            </p>
          </div>
          <button
            onClick={() => setMensagemParaResponder(null)}
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
      <EnviarMensagemForm
        key={conversaSelecionada?.id}
        onEnviar={async ({ texto, arquivo }) => {
          await enviarMensagemMutation.mutateAsync({ texto, arquivo, mensagemParaResponder });
          setMensagemParaResponder(null);
        }}
        isLoading={enviarMensagemMutation.isPending}
        nomeUsuario={user?.full_name || ''}
        empresaId={empresaId}
        telefoneDestino={conversaSelecionada?.cliente_telefone}
        conversaId={conversaSelecionada?.id}
        onTemplateEnviado={() => {
          const qKey = ['mensagens-whatsapp', conversaSelecionada?.id];
          queryClient.invalidateQueries({ queryKey: qKey });
          setTimeout(() => queryClient.refetchQueries({ queryKey: qKey }), 1000);
        }}
      />
    </>
  );
}
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, X, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import EnviarMensagemForm from './EnviarMensagemForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ChatMessageFooter({
  conversaSelecionada,
  mensagemParaResponder,
  setMensagemParaResponder,
  enviarMensagemMutation,
  dispatchEnvio,
  user,
  empresaId,
  selecionarConversa,
  scriptExterno,
  coachIAOpen,
  setCoachIAOpen,
  nomeCliente,
}) {
  const queryClient = useQueryClient();
  const [canalReabrir, setCanalReabrir] = useState(conversaSelecionada?.tipo_conexao === 'dapi' ? 'dapi' : 'meta_oficial');

  // Sincronizar canal ao trocar de conversa
  React.useEffect(() => {
    setCanalReabrir(conversaSelecionada?.tipo_conexao === 'dapi' ? 'dapi' : 'meta_oficial');
  }, [conversaSelecionada?.id]);

  const canaisDisponiveis = [
    { value: 'meta_oficial', label: '📱 Meta Oficial (API)' },
    { value: 'dapi', label: '🟦 D-API' },
  ];

  if (conversaSelecionada?.status === 'encerrada') {
    const canalLabel = canaisDisponiveis.find(c => c.value === canalReabrir)?.label || canalReabrir;

    return (
      <div className="bg-emerald-50 border-t border-emerald-200 px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">Conversa finalizada</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-emerald-700 whitespace-nowrap">Canal ao reabrir:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs border-emerald-300 bg-white">
                  {canalLabel}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {canaisDisponiveis.map(c => (
                  <DropdownMenuItem key={c.value} onClick={() => setCanalReabrir(c.value)}>
                    {c.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-white shrink-0"
            onClick={async () => {
              const dadosCanal = canalReabrir === 'dapi'
                ? { tipo_conexao: 'dapi', canal_origem: 'dapi', provider: 'dapi' }
                : { tipo_conexao: 'meta_oficial', canal_origem: 'meta', provider: 'whatsapp_meta' };
              await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
                status: 'ativa',
                ...dadosCanal,
                responsavel_id: null,
                responsavel_expira_em: null,
              });
              queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
              selecionarConversa({
                ...conversaSelecionada,
                status: 'ativa',
                ...dadosCanal,
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
        onEnviar={({ texto, arquivo }) => {
          // Envio assíncrono: a bolha é adicionada no cache imediatamente com
          // um tempId; upload e chamada ao backend rodam em background. O
          // campo de digitação e os botões ficam liberados para o próximo envio.
          if (!dispatchEnvio) {
            // Fallback legado (ex.: outro fluxo sem dispatcher)
            enviarMensagemMutation?.mutateAsync({ texto, arquivo, mensagemParaResponder });
            setMensagemParaResponder(null);
            return;
          }
          const ok = dispatchEnvio({ texto, arquivo, mensagemParaResponder });
          // Limpa a citação SOMENTE se o dispatcher aceitou (não dispara toast de erro
          // em validação de envio — o erro já é exibido dentro do hook/store).
          if (ok !== false) setMensagemParaResponder(null);
        }}
        isLoading={false}
        nomeUsuario={user?.full_name || ''}
        empresaId={empresaId}
        telefoneDestino={conversaSelecionada?.cliente_telefone}
        nomeCliente={nomeCliente}
        conversaId={conversaSelecionada?.id}
        scriptExterno={scriptExterno}
        coachIAOpen={coachIAOpen}
        setCoachIAOpen={setCoachIAOpen}
        onTemplateEnviado={() => {
          const qKey = ['mensagens-whatsapp', conversaSelecionada?.id];
          queryClient.invalidateQueries({ queryKey: qKey });
          setTimeout(() => queryClient.refetchQueries({ queryKey: qKey }), 1000);
        }}
      />
    </>
  );
}
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
  const [canalReabrir, setCanalReabrir] = useState('dapi');
  const [permissoesCanal, setPermissoesCanal] = useState(null);
  React.useEffect(() => {
    if (!empresaId || !user) return;
    let ativo = true;
    base44.functions.invoke('permissoesWhatsapp', { modo: 'minhas', empresa_id: empresaId })
      .then(({data}) => {
        if (!ativo) return;
        if (data?.error) { setPermissoesCanal([]); return; }
        setPermissoesCanal(data?.conexoes || []);
      }).catch(() => { if (ativo) setPermissoesCanal([]); });
    return () => { ativo = false; };
  }, [empresaId, user?.id, user?.colaborador_id]);

  // Sincronizar canal ao trocar de conversa
  React.useEffect(() => {
    setCanalReabrir('dapi');
  }, [conversaSelecionada?.id]);

  const canaisDisponiveis = (permissoesCanal || []).map(c => ({
    value: c.id,
    label: c.nome || c.name || c.instance_name || 'Canal WhatsApp',
    tipo: /meta|oficial/i.test([c.tipo_conexao, c.provider_type, c.tipo, c.nome].join(' ')) ? 'meta_oficial' : 'dapi',
  }));
  const canalSelecionado = canaisDisponiveis.find(c => c.value === canalReabrir) || canaisDisponiveis[0];
  const verificandoCanais = permissoesCanal === null;

  if (conversaSelecionada?.status === 'encerrada') {
    const canalLabel = canalSelecionado?.label || (verificandoCanais ? 'Verificando canais autorizados' : 'Nenhum canal autorizado');

    return (
      <div className="bg-emerald-50 border-t border-emerald-200 px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">Conversa finalizada</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-emerald-700 whitespace-nowrap">Canal ao reabrir:</span>
            {canaisDisponiveis.length > 1 ? <DropdownMenu>
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
            </DropdownMenu> : <span className="text-xs font-medium text-emerald-800">{canalLabel}</span>}
          </div>
          <Button
            size="sm"
            disabled={!canalSelecionado}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-white shrink-0"
            onClick={async () => {
              if (!canalSelecionado) { toast.error('Nenhum canal autorizado disponível.'); return; }
              const dadosCanal = canalSelecionado.tipo === 'dapi'
                ? { tipo_conexao: 'dapi', canal_origem: 'dapi', provider: 'dapi', connection_id: canalSelecionado.value }
                : { tipo_conexao: 'meta_oficial', canal_origem: 'meta', provider: 'whatsapp_meta', connection_id: canalSelecionado.value };
              await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
                status: 'ativa',
                ...dadosCanal,
                responsavel_id: null,
                responsavel_nome: null,
                responsavel_expira_em: null,
                atendimento_transferido_para_id: null,
              });
              queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
              selecionarConversa({
                ...conversaSelecionada,
                status: 'ativa',
                ...dadosCanal,
                responsavel_id: null,
                responsavel_nome: null,
                responsavel_expira_em: null,
                atendimento_transferido_para_id: null,
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
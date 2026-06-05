import React from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check, ArrowRightLeft, MoreVertical, RefreshCw, Tag, Clock,
  Contact, Pencil, BellOff, Pin, X, AlignJustify, CalendarClock, TrendingUp,
  PhoneCall, PhoneOff,
} from "lucide-react";
import AvatarContato from './AvatarContato';
import { toast } from 'sonner';

export default function ChatHeader({
  conversaSelecionada,
  contatosWhatsapp,
  empresaId,
  user,
  infoLeadAberto,
  setInfoLeadAberto,
  setTransferirModal,
  abrirSalvarCrm,
  setContatoParaTags,
  setTagsModalOpen,
  setCriarTarefaOpen,
  refetchMensagens,
  queryClient,
  setConversaSelecionada,
  onAgendarMensagem,
  setFunilModalOpen,
  oportunidadeAtual,
  tagsDB = [],
  onLigar,
  sipStatus,
  chamadaAtiva,
  erroSip,
}) {
  // Canal override local: permite que o usuário troque o canal sem ser revertido pelo polling
  const [canalOverride, setCanalOverride] = React.useState(null);

  // Resetar override ao trocar de conversa
  React.useEffect(() => {
    setCanalOverride(null);
  }, [conversaSelecionada?.id]);

  if (!conversaSelecionada) return null;

  const ehInstagram =
    conversaSelecionada.tipo_conexao === 'instagram' ||
    conversaSelecionada.instancia === 'INSTAGRAM' ||
    String(conversaSelecionada.cliente_telefone || '').startsWith('ig_');

  // ── CANAL FIXO: lido do banco, NÃO recalculado ──────────────────────────
  // Prioridade: 1) override manual local, 2) provider (mais confiável), 3) canal_origem, 4) campos legados
  const providerBanco = conversaSelecionada.provider || null;
  const canalOrigemBanco = conversaSelecionada.canal_origem || null;

  // Override local só se usuário trocou manualmente
  const tipoConexaoEfetivo = canalOverride || conversaSelecionada.tipo_conexao;

  const ehMeta =
    !ehInstagram && (
      canalOverride === 'meta_oficial' ||
      providerBanco === 'whatsapp_meta' ||
      canalOrigemBanco === 'meta' ||
      (!canalOverride && (
        tipoConexaoEfetivo === 'meta_oficial' ||
        conversaSelecionada.instancia === 'META_OFICIAL'
      ))
    );

  // Troca MANUAL de canal — única forma legítima de alterar canal_origem
  const alternarApi = async () => {
    if (ehMeta) {
      setCanalOverride('empresa');
      await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
        tipo_conexao: 'empresa', instancia: '',
        canal_origem: 'evolution', provider: 'evolution', locked_provider: true
      });
      setConversaSelecionada(prev => ({
        ...prev, tipo_conexao: 'empresa', instancia: '',
        canal_origem: 'evolution', provider: 'evolution'
      }));
      toast.success('Alterado para Evolution API');
    } else {
      setCanalOverride('meta_oficial');
      await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
        tipo_conexao: 'meta_oficial', instancia: 'META_OFICIAL',
        canal_origem: 'meta', provider: 'whatsapp_meta', locked_provider: true
      });
      setConversaSelecionada(prev => ({
        ...prev, tipo_conexao: 'meta_oficial', instancia: 'META_OFICIAL',
        canal_origem: 'meta', provider: 'whatsapp_meta'
      }));
      toast.success('Alterado para API Oficial Meta');
    }
    queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
  };

  const contatoAtual = contatosWhatsapp[conversaSelecionada?.id];
  const tagsDoContato = tagsDB.filter(t => (contatoAtual?.tags_ids || []).includes(t.id));

  return (
    <div className="flex flex-col border-b bg-white px-3 sm:px-5 py-2 sm:py-2.5 shrink-0">
      {/* Linha 1: avatar + nome + botões */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <AvatarContato
              contato={contatoAtual || conversaSelecionada.contato || { nome: conversaSelecionada.cliente_telefone, telefone: conversaSelecionada.cliente_telefone, foto_url: conversaSelecionada.foto_url }}
              className="h-9 w-9 sm:h-11 sm:w-11"
            />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight truncate">
              {contatoAtual?.nome || conversaSelecionada.cliente_telefone}
            </p>
            <div className="flex items-center gap-1 sm:gap-2 mt-0.5 flex-wrap">
              {ehInstagram ? (
                <span className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-gradient-to-r from-purple-500 to-pink-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 inline-block" />
                  Instagram
                </span>
              ) : ehMeta ? (
                <span
                  title="Respondendo via Meta Oficial"
                  className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-green-500 cursor-default"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 inline-block" />
                  Meta Oficial
                </span>
              ) : (
                <button
                  onClick={alternarApi}
                  title="Respondendo via Evolution — clique para trocar para Meta Oficial"
                  className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105 hover:opacity-80 active:scale-95 bg-blue-500"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 inline-block" />
                  Evolution
                </button>
              )}
              <p className="text-[11px] text-slate-500 truncate max-w-[120px] sm:max-w-none">{conversaSelecionada.cliente_telefone}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {onLigar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={chamadaAtiva ? "destructive" : "outline"}
                  size="sm"
                  className={`gap-1 sm:gap-1.5 rounded-md text-xs font-semibold px-2 sm:px-3 ${chamadaAtiva ? 'bg-red-500 hover:bg-red-600 border-red-500 text-white animate-pulse' : 'border-green-300 text-green-700 hover:text-green-800 hover:border-green-400 hover:bg-green-50'}`}
                  onClick={onLigar}
                  disabled={!chamadaAtiva && sipStatus && sipStatus !== 'registrado'}
                >
                  {chamadaAtiva ? <PhoneOff className="h-3.5 w-3.5" /> : <PhoneCall className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{chamadaAtiva ? 'Em ligação' : 'Ligar'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {chamadaAtiva ? `Chamada ativa com ${chamadaAtiva.destino} — clique para encerrar` : sipStatus === 'registrado' ? 'Ligar para este contato' : `Ramal SIP: ${sipStatus || 'não configurado'}`}
              </TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1 sm:gap-1.5 rounded-md border-slate-200 text-xs font-medium text-red-600 hover:text-red-700 hover:border-red-300 px-2 sm:px-3"
          onClick={async () => {
            const idFinalizar = conversaSelecionada.id;
            queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
              old.map(c => c.id === idFinalizar ? { ...c, status: 'encerrada', responsavel_id: null, responsavel_nome: null } : c)
            );
            setConversaSelecionada(null);
            toast.success('Conversa finalizada');
            base44.entities.ConversaWhatsapp.update(idFinalizar, { status: 'encerrada', responsavel_id: null, responsavel_nome: null }).catch(() => {});
          }}
        >
          <Check className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Finalizar</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1 sm:gap-1.5 rounded-md border-slate-200 text-xs font-medium text-purple-600 hover:text-purple-700 hover:border-purple-300 px-2 sm:px-3"
          onClick={() => setTransferirModal(conversaSelecionada)}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Transferir</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-md border-slate-300 hover:bg-slate-100">
              <MoreVertical className="h-4 w-4 text-slate-900" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="z-[200]">
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const resp = await base44.functions.invoke('importarMensagensConversa', {
                    empresa_id: empresaId,
                    telefone: conversaSelecionada.cliente_telefone,
                    conversa_id: conversaSelecionada.id
                  });
                  toast.success(`✅ ${resp?.data?.message || 'Mensagens sincronizadas!'}`);
                  queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id] });
                  setTimeout(() => refetchMensagens?.(), 100);
                } catch (e) {
                  toast.error('Erro ao sincronizar: ' + e.message);
                }
              }}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Carregar Mensagens
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Tag className="mr-2 h-3.5 w-3.5" />
              Criar Proposta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCriarTarefaOpen(true)}>
              <Clock className="mr-2 h-3.5 w-3.5" />
              Criar Tarefa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAgendarMensagem?.(conversaSelecionada)}>
              <CalendarClock className="mr-2 h-3.5 w-3.5" />
              Agendar mensagem
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFunilModalOpen?.(true)}>
              <TrendingUp className="mr-2 h-3.5 w-3.5" />
              {oportunidadeAtual ? 'Ver no Funil' : 'Adicionar ao Funil'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => abrirSalvarCrm(conversaSelecionada)}>
              <Contact className="mr-2 h-3.5 w-3.5" />
              {contatosWhatsapp[conversaSelecionada?.id]?.id ? 'Editar contato no CRM' : 'Salvar contato no CRM'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => abrirSalvarCrm(conversaSelecionada)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Alterar nome do contato
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setContatoParaTags(conversaSelecionada);
              setTagsModalOpen(true);
            }}>
              <Tag className="mr-2 h-3.5 w-3.5" />
              Gerenciar Tags
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, { status: 'ativa' });
              queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
              toast.success('Conversa reaberta');
            }}>
              <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
              Reabrir conversa
            </DropdownMenuItem>
            {!ehInstagram && !ehMeta && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => alternarApi()}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Usar Meta Oficial nesta conversa
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast.info('Em desenvolvimento')}>
              <BellOff className="mr-2 h-3.5 w-3.5" />
              Silenciar conversa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.info('Em desenvolvimento')}>
              <Pin className="mr-2 h-3.5 w-3.5" />
              Fixar conversa
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                if (confirm('Tem certeza que deseja excluir esta conversa e todas as mensagens?')) {
                  const mensagensParaExcluir = await base44.entities.MensagemWhatsapp.filter({ conversa_id: conversaSelecionada.id });
                  for (const msg of mensagensParaExcluir) {
                    await base44.entities.MensagemWhatsapp.delete(msg.id);
                  }
                  await base44.entities.ConversaWhatsapp.delete(conversaSelecionada.id);
                  queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
                  queryClient.removeQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id] });
                  setConversaSelecionada(null);
                  toast.success('Conversa excluída');
                }
              }}
              className="text-red-600 hover:bg-red-50"
            >
              <X className="mr-2 h-3.5 w-3.5" />
              Excluir conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={infoLeadAberto ? "secondary" : "outline"}
                size="icon"
                className="h-8 w-8 rounded-md border-slate-200"
                onClick={() => setInfoLeadAberto(!infoLeadAberto)}
              >
                <AlignJustify className="h-4 w-4 text-slate-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{infoLeadAberto ? 'Fechar' : 'Abrir'} informações do lead</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Aviso de erro SIP / microfone */}
      {erroSip && erroSip.includes('microfone') && (
        <div className="mt-1.5 flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 text-xs text-red-700">
          <span>🎤</span>
          <span>{erroSip}</span>
        </div>
      )}

      {/* Linha 2: Tags + botão gerenciar */}
      {(tagsDoContato.length > 0 || true) && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {tagsDoContato.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: tag.cor + '22', color: tag.cor, borderColor: tag.cor + '66' }}
            >
              {tag.nome}
            </span>
          ))}
          <button
            onClick={() => { setContatoParaTags(conversaSelecionada); setTagsModalOpen(true); }}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
          >
            <Tag className="w-3 h-3" />
            {tagsDoContato.length === 0 ? 'Adicionar tag' : '+'}
          </button>
        </div>
      )}
    </div>
  );
}
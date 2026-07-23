import React, { useState, useEffect } from 'react';
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
  PhoneCall, PhoneOff, UserPlus,
} from "lucide-react";
import AvatarContato from './AvatarContato';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

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
  coachIAOpen,
  setCoachIAOpen,
  onAbrirCadastroIA,
}) {
  const navigate = useNavigate();
  const [canalOverride, setCanalOverride] = useState(null);
  const [fotoModalOpen, setFotoModalOpen] = useState(false);
  const [conexoesAtivas, setConexoesAtivas] = useState([]);
  const [conexaoDapiAtiva, setConexaoDapiAtiva] = useState(null);
  const [ehDapi, setEhDapi] = useState(false);

  // Buscar conexões ativas ao montar
  useEffect(() => {
    if (!empresaId) return;
    
    const buscarConexoes = async () => {
      try {
        const todas = await base44.entities.WhatsappConnection.filter({
          empresa_id: empresaId,
          is_active: true
        }, '-created_date', 50);
        
        setConexoesAtivas(todas || []);
        
        const dapi = todas.find(c => c.provider_type === 'dapi' && c.is_active);
        setConexaoDapiAtiva(dapi || null);
      } catch (e) {
        console.error('Erro ao buscar conexões:', e.message);
      }
    };
    
    buscarConexoes();
  }, [empresaId]);

  // Verificar se conversa atual é D-API
  useEffect(() => {
    if (!conversaSelecionada) {
      setEhDapi(false);
      return;
    }
    
    const isDapi = 
      conversaSelecionada.provider === 'dapi' ||
      conversaSelecionada.provider_type === 'dapi' ||
      conversaSelecionada.tipo_conexao === 'dapi' ||
      (conversaSelecionada.connection_id && conexaoDapiAtiva?.id === conversaSelecionada.connection_id);
    
    setEhDapi(isDapi);
  }, [conversaSelecionada, conexaoDapiAtiva]);

  // Resetar override ao trocar de conversa
  useEffect(() => {
    setCanalOverride(null);
  }, [conversaSelecionada?.id]);

  // Alternar para uma conexão específica
  const alternarParaConexao = async (conexao) => {
    if (!conexao) return;
    
    const isAdmin = user?.perfil === 'master' || user?.perfil === 'super_admin' || user?.perfil === 'admin';
    if (!isAdmin) {
      toast.error('Apenas administradores podem alterar o canal de atendimento');
      return;
    }
    
    try {
      const updateData = {
        connection_id: conexao.id,
        provider_type: conexao.provider_type,
        locked_provider: true,
      };
      
      if (conexao.provider_type === 'dapi') {
        updateData.tipo_conexao = 'dapi';
        updateData.canal_origem = 'dapi';
        updateData.provider = 'dapi';
        updateData.instancia = conexao.session_id || 'D-API';
      } else if (conexao.provider_type === 'meta_oficial') {
        updateData.tipo_conexao = 'meta_oficial';
        updateData.canal_origem = 'meta';
        updateData.provider = 'whatsapp_meta';
        updateData.instancia = 'META_OFICIAL';
      } else if (conexao.provider_type === 'evolution') {
        updateData.tipo_conexao = 'empresa';
        updateData.canal_origem = 'evolution';
        updateData.provider = 'evolution';
        updateData.instancia = conexao.session_id || conexao.nome || '';
      }
      
      await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, updateData);
      
      setConversaSelecionada(prev => ({
        ...prev,
        ...updateData,
      }));
      
      setCanalOverride(updateData.tipo_conexao);
      
      toast.success(`Canal alterado para ${conexao.provider_type === 'dapi' ? `D-API - ${conexao.nome || conexao.session_id}` : conexao.provider_type === 'meta_oficial' ? 'Meta Oficial' : `Evolution - ${conexao.nome || conexao.session_id}`}`);
      
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
    } catch (e) {
      console.error('Erro ao alternar canal:', e);
      toast.error('Erro ao alternar canal: ' + e.message);
    }
  };

  if (!conversaSelecionada) return null;

  const ehInstagram =
    conversaSelecionada.tipo_conexao === 'instagram' ||
    conversaSelecionada.instancia === 'INSTAGRAM' ||
    String(conversaSelecionada.cliente_telefone || '').startsWith('ig_');

  const providerBanco = conversaSelecionada.provider || null;
  const canalOrigemBanco = conversaSelecionada.canal_origem || null;
  const tipoConexaoEfetivo = canalOverride || conversaSelecionada.tipo_conexao;

  // Conexão amarrada à conversa (multi-D-API). Usamos a conexão correspondente
  // ao connection_id gravado na conversa; só caímos no fallback (primeira D-API
  // ativa) quando a conversa ainda não tem uma conexão específica amarrada.
  const conexaoAtivaConversa =
    conexoesAtivas.find(c => c.id === conversaSelecionada.connection_id) ||
    conexaoDapiAtiva;
  
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

  const contatoAtual = contatosWhatsapp[conversaSelecionada?.id];
  const tagsDoContato = tagsDB.filter(t => (contatoAtual?.tags_ids || []).includes(t.id));

  return (
    <div className="flex flex-col border-b bg-white px-3 sm:px-5 py-2 sm:py-2.5 shrink-0">
      {/* Linha 1: avatar + nome + botões */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <div
              className="cursor-pointer"
              onClick={() => {
                const foto = contatoAtual?.foto_url || conversaSelecionada.foto_url;
                if (foto) setFotoModalOpen(true);
              }}
            >
              <AvatarContato
                contato={contatoAtual || conversaSelecionada.contato || { nome: conversaSelecionada.cliente_telefone, telefone: conversaSelecionada.cliente_telefone, foto_url: conversaSelecionada.foto_url }}
                className="h-9 w-9 sm:h-11 sm:w-11 hover:opacity-80 transition-opacity"
              />
            </div>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          </div>

          {/* Modal foto ampliada */}
          {fotoModalOpen && (
            <div
              className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
              onClick={() => setFotoModalOpen(false)}
            >
              <div className="relative" onClick={e => e.stopPropagation()}>
                <img
                  src={contatoAtual?.foto_url || conversaSelecionada.foto_url}
                  alt="Foto do contato"
                  className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl object-contain"
                />
                <button
                  onClick={() => setFotoModalOpen(false)}
                  className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center text-slate-700 hover:text-slate-900 font-bold text-sm"
                >
                  ✕
                </button>
                <p className="text-center text-white/80 text-sm mt-3 font-medium">
                  {contatoAtual?.nome || conversaSelecionada.cliente_telefone}
                </p>
              </div>
            </div>
          )}
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
              ) : ehDapi && conexaoDapiAtiva ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title={`Respondendo via D-API - ${conexaoAtivaConversa?.nome || conexaoAtivaConversa?.session_id || ''} — clique para trocar`}
                      className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105 hover:opacity-80 active:scale-95 bg-cyan-600"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 inline-block" />
                      D-API - {conexaoAtivaConversa?.nome || conexaoAtivaConversa?.session_id || 'D-API'}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="bottom" className="z-[200]">
                    {conexoesAtivas
                      .filter(c => c.is_active)
                      .map((conexao) => (
                        <DropdownMenuItem
                          key={conexao.id}
                          onClick={() => alternarParaConexao(conexao)}
                          className="cursor-pointer"
                        >
                          {conexao.provider_type === 'dapi' && '🟦'}
                          {conexao.provider_type === 'meta_oficial' && '🟢'}
                          {conexao.provider_type === 'evolution' && '🟣'}
                          {' '}
                          {conexao.provider_type === 'dapi' ? `D-API - ${conexao.nome || conexao.session_id}` :
                           conexao.provider_type === 'meta_oficial' ? 'Meta Oficial' :
                           `${conexao.provider_type.toUpperCase()} - ${conexao.nome || conexao.session_id}`}
                          {conexao.id === conversaSelecionada.connection_id && ' ✓'}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : ehMeta ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Respondendo via Meta Oficial — clique para trocar"
                      className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105 hover:opacity-80 active:scale-95 bg-green-500"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 inline-block" />
                      Meta Oficial
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="bottom" className="z-[200]">
                    {conexoesAtivas
                      .filter(c => c.is_active)
                      .map((conexao) => (
                        <DropdownMenuItem
                          key={conexao.id}
                          onClick={() => alternarParaConexao(conexao)}
                          className="cursor-pointer"
                        >
                          {conexao.provider_type === 'dapi' && '🟦'}
                          {conexao.provider_type === 'meta_oficial' && '🟢'}
                          {conexao.provider_type === 'evolution' && '🟣'}
                          {' '}
                          {conexao.provider_type === 'dapi' ? `D-API - ${conexao.nome || conexao.session_id}` :
                           conexao.provider_type === 'meta_oficial' ? 'Meta Oficial' :
                           `${conexao.provider_type.toUpperCase()} - ${conexao.nome || conexao.session_id}`}
                          {conexao.id === conversaSelecionada.connection_id && ' ✓'}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Respondendo via Evolution — clique para trocar"
                      className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105 hover:opacity-80 active:scale-95 bg-blue-500"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 inline-block" />
                      Evolution
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="bottom" className="z-[200]">
                    {conexoesAtivas
                      .filter(c => c.is_active)
                      .map((conexao) => (
                        <DropdownMenuItem
                          key={conexao.id}
                          onClick={() => alternarParaConexao(conexao)}
                          className="cursor-pointer"
                        >
                          {conexao.provider_type === 'dapi' && '🟦'}
                          {conexao.provider_type === 'meta_oficial' && '🟢'}
                          {conexao.provider_type === 'evolution' && '🟣'}
                          {' '}
                          {conexao.provider_type === 'dapi' ? `D-API - ${conexao.nome || conexao.session_id}` :
                           conexao.provider_type === 'meta_oficial' ? 'Meta Oficial' :
                           `${conexao.provider_type.toUpperCase()} - ${conexao.nome || conexao.session_id}`}
                          {conexao.id === conversaSelecionada.connection_id && ' ✓'}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <p className="text-[11px] text-slate-500 truncate max-w-[120px] sm:max-w-none">{conversaSelecionada.cliente_telefone}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {onLigar && (
            chamadaAtiva ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1 sm:gap-1.5 rounded-md text-xs font-semibold px-2 sm:px-3 bg-red-500 hover:bg-red-600 border-red-500 text-white animate-pulse"
                    onClick={() => onLigar()}
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Em ligação</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {`Chamada ativa com ${chamadaAtiva.destino} — clique para encerrar`}
                </TooltipContent>
              </Tooltip>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 sm:gap-1.5 rounded-md text-xs font-semibold px-2 sm:px-3 border-green-300 text-green-700 hover:text-green-800 hover:border-green-400 hover:bg-green-50"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Ligar</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="z-[200]">
                  <DropdownMenuItem onClick={() => onLigar('whatsapp')}>
                    Ligar via WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onLigar('operadora')}>
                    Ligar via Operadora
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
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
              <DropdownMenuItem onClick={() => onAbrirCadastroIA?.()}>
                <UserPlus className="mr-2 h-3.5 w-3.5" />
                Solicitar cadastro de cliente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCriarTarefaOpen(true)}>
                <Clock className="mr-2 h-3.5 w-3.5" />
                Criar Tarefa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAgendarMensagem?.(conversaSelecionada)}>
                <CalendarClock className="mr-2 h-3.5 w-3.5" />
                Agendar mensagem
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                if (oportunidadeAtual) {
                  navigate(`/FunilVendas?oportunidade_id=${oportunidadeAtual.id}`);
                } else {
                  setFunilModalOpen?.(true);
                }
              }}>
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
              {!ehInstagram && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    if (ehMeta) {
                      if (conexaoDapiAtiva) {
                        alternarParaConexao(conexaoDapiAtiva);
                      } else {
                        alternarParaConexao(conexoesAtivas.find(c => c.provider_type === 'evolution'));
                      }
                    } else {
                      alternarParaConexao(conexoesAtivas.find(c => c.provider_type === 'meta_oficial'));
                    }
                  }}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Alternar canal
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
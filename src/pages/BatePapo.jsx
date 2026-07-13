import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { marcarConversaComoLida } from '@/components/chat/marcarConversaComoLida';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search, Plus, MoreVertical, PhoneCall, PhoneOff, Tag, ArrowRightLeft,
  BellOff, Pin, Check, Clock, Loader2, MessageCircle, AlignJustify,
  X, Trash2, RefreshCw, Contact, Pencil, Lock, Unlock, TrendingUp, BarChart2,
  User, ClipboardList, Phone, Users,
} from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessageFooter from '@/components/chat/ChatMessageFooter';
import ConversaContextMenu from '@/components/chat/ConversaContextMenu';
import { toast } from 'sonner';
import MensagemItem from '@/components/chat/MensagemItem';
import GrupoImagens from '@/components/chat/GrupoImagens';
import ListaMensagens from '@/components/chat/ListaMensagens';
import NovaConversaModal from '@/components/chat/NovaConversaModal';
import AvatarContato from '@/components/chat/AvatarContato';
import TarefaFormModal from '@/components/tarefas/TarefaFormModal';
import { useTarefaFormData } from '@/hooks/useTarefaFormData';
import TransferirAtendimentoModal from '@/components/chat/TransferirAtendimentoModal';
import TagsModal from '@/components/chat/TagsModal';
import TagsGerenciamentoModal from '@/components/chat/TagsGerenciamentoModal';
import FunilSelectionModal from '@/components/chat/FunilSelectionModal';
import FunilInfoPanel from '@/components/chat/FunilInfoPanel';
import PainelInfoLead from '@/components/chat/PainelInfoLead';
import BatePapoMenu from '@/components/chat/BatePapoMenu';
import AgendarMensagemModal from '@/components/chat/AgendarMensagemModal';
import MensagensAgendadasModal from '@/components/chat/MensagensAgendadasModal';
import AgendarReuniaoModal from '@/components/chat/AgendarReuniaoModal';
import useSoftphone from '@/components/callcenter/useSoftphone';
import useDapiCall from '@/components/chat/useDapiCall';
import ChamadaAtivaBar from '@/components/chat/ChamadaAtivaBar.jsx';
import DapiCallBar from '@/components/chat/DapiCallBar.jsx';
import DashboardProdutividade from '@/components/chat/DashboardProdutividade';
import CoachIAPanel from '@/components/chat/CoachIAPanel';
import MobileBottomNav from '@/components/chat/MobileBottomNav';
import MobileConversationActions from '@/components/chat/MobileConversationActions';
import ImageEditorModal from '@/components/chat/image-editor/ImageEditorModal';

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function BatePapo() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);

  const conversaSelecionadaId = conversaSelecionada?.id || null;
  const isInstagram = (c) => c?.cliente_telefone?.startsWith('ig_') || c?.instancia === 'INSTAGRAM' || c?.tipo_conexao === 'instagram';

  const selecionarConversa = async (conversa, forcarSync = true, abrirMobile = true) => {
     setConversaSelecionada(conversa);
     // Só ativar mobileViewChat se for dispositivo mobile E abrirMobile for true
     if (abrirMobile && window.innerWidth < 1024) setMobileViewChat(true);
     localStorage.setItem('ultimaConversaId', conversa.id);
     // Zerar contador de não lidas ao abrir a conversa — garantir que não reapareça
     setNaoLidasPorConversa(prev => {
       const nova = { ...prev };
       nova[conversa.id] = 0;
       return nova;
     });
    // Remover da lista de marcadas manualmente como não lido
    setMarcadasNaoLidasManual(prev => {
      const nova = new Set(prev);
      nova.delete(conversa.id);
      return nova;
    });

    // Marcar conversa como lida (background)
    marcarConversaComoLida(conversa.id);

    // Invalida cache e força refetch IMEDIATO
    queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversa.id] });

    // Buscar oportunidade associada ao contato
    try {
      const ops = await base44.entities.Oportunidade.filter({
        empresa_id: empresaId,
        cliente_telefone: conversa.cliente_telefone
      }, '-updated_date', 1);
      if (ops?.length > 0) {
        setOportunidadeAtual(ops[0]);
      } else {
        setOportunidadeAtual(null);
      }
    } catch (_) {
      setOportunidadeAtual(null);
    }

    // Instagram: sincronizar perfil (nome/foto/username) automaticamente
    if (isInstagram(conversa)) {
      const sid = (conversa.cliente_telefone || '').replace('ig_', '');
      if (sid && empresaId) {
        const ck = `ig_ps_${sid}`;
        const ls = localStorage.getItem(ck);
        const temFoto = contatosWhatsapp[conversa.id]?.foto_url || conversa.foto_url;
        if (!ls || (Date.now() - Number(ls)) > 604800000 || !temFoto) {
          base44.functions.invoke('sincronizarPerfilInstagram', { empresa_id: empresaId, sender_id: sid }).then(r => {
            if (r?.data?.success) {
              localStorage.setItem(ck, String(Date.now()));
              const { nome, foto_url, username } = r.data;
              setContatosWhatsapp(prev => ({ ...prev, [conversa.id]: { ...(prev[conversa.id] || {}), nome: nome || prev[conversa.id]?.nome || conversa.cliente_nome, telefone: conversa.cliente_telefone, foto_url: foto_url || prev[conversa.id]?.foto_url || conversa.foto_url, username } }));
            }
          }).catch(() => {});
        }
      }
      return;
    }

    // Buscar foto com múltiplas tentativas — rigoroso
    if (!empresaId) return;

    try {
      if (isGrupo(conversa)) {
        // Grupo: buscar foto via Evolution API
        const grupoJid = conversa.whatsapp_id;
        if (grupoJid && grupoJid.includes('@g.us')) {
          const resp = await base44.functions.invoke('buscarFotoContatoAPI', {
            empresa_id: empresaId,
            contato_id: grupoJid
          });
          if (resp?.data?.foto_url) {
            setContatosWhatsapp(prev => ({
              ...prev,
              [conversa.id]: { nome: conversa.cliente_nome, telefone: conversa.whatsapp_id, foto_url: resp.data.foto_url }
            }));
          }
        }
      } else if (conversa?.cliente_telefone) {
        // Contato: tentar TODAS as variações de telefone + buscar via API se necessário
        const telefoneLimpo = conversa.cliente_telefone.replace(/\D/g, '');
        const variacoes = new Set([
          telefoneLimpo,
          telefoneLimpo.slice(-11),  // Apenas 11 últimos dígitos
          '55' + telefoneLimpo.slice(-11),  // Com 55
        ]);
        
        // Se começar com 55, adicionar variações
        if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
          variacoes.add(telefoneLimpo.slice(2));  // Sem 55
          variacoes.add('55' + '9' + telefoneLimpo.slice(4));  // Com 9 inserido
        }

        let encontrou = false;
        for (const tel of variacoes) {
          if (encontrou) break;
          const contatos = await base44.entities.ContatoWhatsapp.filter({
            empresa_id: empresaId,
            telefone: tel
          }, '-created_date', 1);

          if (contatos?.length > 0) {
            setContatosWhatsapp(prev => ({ ...prev, [conversa.id]: contatos[0] }));
            encontrou = true;
            break;
          }
        }

        // Se não encontrou no CRM, tentar buscar foto via API Evolution
        if (!encontrou) {
          try {
            const resp = await base44.functions.invoke('buscarFotoContatoAPI', {
              empresa_id: empresaId,
              contato_id: conversa.cliente_telefone
            });
            if (resp?.data?.foto_url) {
              setContatosWhatsapp(prev => ({
                ...prev,
                [conversa.id]: { nome: conversa.cliente_nome, telefone: conversa.cliente_telefone, foto_url: resp.data.foto_url }
              }));
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error('Erro ao carregar foto:', e);
    }
  };
  const [searchConversas, setSearchConversas] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('ativa');
  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [contatosWhatsapp, setContatosWhatsapp] = useState({});
  const [infoLeadAberto, setInfoLeadAberto] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagemParaResponder, setMensagemParaResponder] = useState(null);
  const [salvarCrmModal, setSalvarCrmModal] = useState(null); // { conversa, contato? }
  const [nomeContatoEdit, setNomeContatoEdit] = useState('');
  const [salvandoCrm, setSalvandoCrm] = useState(false);
  const queryClient = useQueryClient();

  const abrirSalvarCrm = (conversa) => {
    const contatoAtual = contatosWhatsapp[conversa.id];
    setNomeContatoEdit(contatoAtual?.nome || conversa.cliente_nome || '');
    setSalvarCrmModal({ conversa, contato: contatoAtual || null });
  };

  const salvarContatoCrm = async () => {
    if (!salvarCrmModal) return;
    setSalvandoCrm(true);
    const { conversa, contato } = salvarCrmModal;
    const telefoneLimpo = conversa.cliente_telefone.replace(/\D/g, '');
    try {
      let contatoSalvo;
      if (contato?.id) {
        // Atualizar nome do contato existente — marcar como fixo para não ser sobrescrito por sincronizações
        await base44.entities.ContatoWhatsapp.update(contato.id, { nome: nomeContatoEdit, nome_fixo: true });
        contatoSalvo = { ...contato, nome: nomeContatoEdit, nome_fixo: true };
      } else {
        // Criar novo contato no CRM — marcar como fixo
        contatoSalvo = await base44.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          telefone: telefoneLimpo,
          nome: nomeContatoEdit,
          nome_fixo: true,
        });
      }
      // Atualizar nome na conversa também
      await base44.entities.ConversaWhatsapp.update(conversa.id, { cliente_nome: nomeContatoEdit });
      // Sincronizar estado local
      setContatosWhatsapp(prev => ({ ...prev, [conversa.id]: contatoSalvo }));
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      setSalvarCrmModal(null);
      toast.success(contato?.id ? 'Contato atualizado no CRM!' : 'Contato salvo no CRM!');
    } catch (e) {
      toast.error('Erro ao salvar contato: ' + e.message);
    } finally {
      setSalvandoCrm(false);
    }
  };

  const [corrigindo, setCorrigindo] = useState(false);
  const [limpandoTudo, setLimpandoTudo] = useState(false);
  const [empresas, setEmpresas] = useState([]); // apenas para super_admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [criarTarefaOpen, setCriarTarefaOpen] = useState(false);
  const [conversaTarefa, setConversaTarefa] = useState(null); // conversa para pré-preencher tarefa

  // Memoizar para evitar que re-renders do BatePapo recriem o objeto e disparem o useEffect do modal
  const tarefaPreenchida = React.useMemo(() => {
    if (!conversaTarefa) return null;
    return {
      cliente_nome: contatosWhatsapp[conversaTarefa.id]?.nome || conversaTarefa.cliente_nome || '',
      cliente_telefone: conversaTarefa.cliente_telefone || '',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaTarefa?.id]);
  const [transferirModal, setTransferirModal] = useState(null); // conversa a transferir
  const [naoLidasPorConversa, setNaoLidasPorConversa] = useState({}); // { conversaId: count }
  const [marcadasNaoLidasManual, setMarcadasNaoLidasManual] = useState(new Set()); // IDs marcadas manualmente como não lido
  const [gruposBloqueadosOpen, setGruposBloqueadosOpen] = useState(false);
  const [gruposBloqueadosLista, setGruposBloqueadosLista] = useState([]);
  const [loadingGruposBloqueados, setLoadingGruposBloqueados] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [contatoParaTags, setContatoParaTags] = useState(null);
  const [gerenciamentoTagsOpen, setGerenciamentoTagsOpen] = useState(false);
  const [funilModalOpen, setFunilModalOpen] = useState(false);
  const [oportunidadeAtual, setOportunidadeAtual] = useState(null);
  const [agendarMensagemModal, setAgendarMensagemModal] = useState(null); // conversa
  const [agendadasOpen, setAgendadasOpen] = useState(false);
  const [agendarReuniaoModal, setAgendarReuniaoModal] = useState(null); // conversa
  const [mobileViewChat, setMobileViewChat] = useState(false); // mobile: false=lista, true=chat
  const [nvoipConfig, setNvoipConfig] = useState(null);
  const [produtividadeOpen, setProdutividadeOpen] = useState(false);
  const [coachIAOpen, setCoachIAOpen] = useState(false);
  const [scriptCoach, setScriptCoach] = useState(null);
  const [mobileActionSheet, setMobileActionSheet] = useState({ open: false, conversa: null });
  const [editorReenvioUrl, setEditorReenvioUrl] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    base44.entities.ConfiguracaoNvoipUsuario.filter({ user_id: user.id }, '-created_date', 1)
      .then(configs => { if (configs?.length > 0) setNvoipConfig(configs[0]); })
      .catch(() => {});
  }, [user?.id]);

  const { sipStatus, erroMsg: erroSip, chamadaAtiva, realizarChamada, encerrarChamada } = useSoftphone(nvoipConfig);
  const dapiCall = useDapiCall();

  const ligarParaContato = async (telefone) => {
    if (!nvoipConfig) { toast.error('Configure seu ramal em Call Center > Meu Ramal'); return; }
    if (sipStatus !== 'registrado') { toast.error(`Ramal SIP não registrado (${sipStatus}). Aguarde a conexão ou acesse Call Center → Meu Ramal.`); return; }
    const numLimpo = (telefone || '').replace(/\D/g, '');
    if (!numLimpo) { toast.error('Número inválido'); return; }
    const ok = await realizarChamada(numLimpo);
    if (!ok && erroSip) toast.error(erroSip);
  };

  // Botão "Ligar" do chat: sempre pergunta se é via WhatsApp ou via Operadora (ambas usam D-API)
  const dapiChamadaAtivaVisivel = ['calling', 'ringing', 'connected'].includes(dapiCall.status);

  const ligarViaWhatsapp = async () => {
    if (!conversaSelecionada?.cliente_telefone) return;
    let connectionId = conversaSelecionada.connection_id;
    if (!connectionId) {
      try {
        const conexoes = await base44.entities.WhatsappConnection.filter(
          { empresa_id: empresaId, provider_type: 'dapi', is_active: true }, '-created_date', 1
        );
        connectionId = conexoes?.[0]?.id;
      } catch (_) {}
    }
    if (!connectionId) { toast.error('Nenhuma conexão D-API ativa encontrada'); return; }
    await dapiCall.iniciar('whatsapp', connectionId, conversaSelecionada.cliente_telefone);
  };

  const ligarViaOperadora = async () => {
    if (!conversaSelecionada?.cliente_telefone) return;
    await dapiCall.iniciar('operadora', null, conversaSelecionada.cliente_telefone);
  };

  const abrirGruposBloqueados = async () => {
    setGruposBloqueadosOpen(true);
    setLoadingGruposBloqueados(true);
    try {
      const todos = await base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId, bloqueado: true }, '-updated_date', 200);
      setGruposBloqueadosLista(todos);
    } catch (e) { toast.error('Erro ao carregar grupos bloqueados'); }
    finally { setLoadingGruposBloqueados(false); }
  };

  const [encerrandoTransferidos, setEncerrandoTransferidos] = useState(false);
  const encerrarTodosTransferidos = async () => {
    if (!confirm(`Encerrar todas as ${contadores.transferida} conversas transferidas?`)) return;
    setEncerrandoTransferidos(true);
    try {
      let hasMore = true;
      while (hasMore) {
        const resp = await base44.entities.ConversaWhatsapp.updateMany(
          { empresa_id: empresaId, status: 'encerrada', responsavel_id: { $exists: true, $ne: null } },
          { $unset: { responsavel_id: "", responsavel_nome: "", responsavel_expira_em: "" } }
        );
        hasMore = !!resp?.has_more;
      }
      toast.success('✅ Conversas transferidas encerradas');
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      refetchConversas();
    } catch (e) {
      toast.error('Erro ao encerrar: ' + e.message);
    } finally {
      setEncerrandoTransferidos(false);
    }
  };

  const handleTransferir = async (conversa, colaborador) => {
    try {
      await base44.entities.ConversaWhatsapp.update(conversa.id, {
        responsavel_id: colaborador.id,
        responsavel_nome: colaborador.nome,
        responsavel_expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
        status: 'encerrada',
        ultimo_remetente: 'vendedor',
      });
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      if (conversaSelecionada?.id === conversa.id) setConversaSelecionada(null);
      toast.success(`✅ Atendimento transferido para ${colaborador.nome}`);
    } catch (e) {
      toast.error('Erro ao transferir: ' + e.message);
    }
  };

  const limparHistoricoCompleto = async () => {
    const confirmacao = window.confirm(
      `🔴 LIMPAR TUDO?\n\n${conversas.length} conversas + mensagens serão deletadas.\n\nClique OK para confirmar.`
    );
    if (!confirmacao) return;

    setLimpandoTudo(true);
    try {
      toast.message('🗑️ Limpando histórico...', { duration: 30000 });
      
      // 1. Apagar todas as conversas da empresa
      const convsFiltro = await base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000);
      for (const conv of convsFiltro) {
        await base44.entities.ConversaWhatsapp.delete(conv.id).catch(() => {});
      }
      console.log(`✅ ${convsFiltro.length} conversas deletadas`);

      // 2. Apagar todas as mensagens da empresa
      const msgsFiltro = await base44.entities.MensagemWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000);
      for (const msg of msgsFiltro) {
        await base44.entities.MensagemWhatsapp.delete(msg.id).catch(() => {});
      }
      console.log(`✅ ${convsFiltro.length} conversas deletadas`);
      
      toast.success(`✅ Histórico limpo! ${convsFiltro.length} conversas + ${msgsFiltro.length} msgs deletadas`);
      refetchConversas();
      setConversaSelecionada(null);
    } catch (e) {
      toast.error('Erro ao limpar: ' + e.message);
    } finally {
      setLimpandoTudo(false);
    }
  };

  const sincronizarTodosContatosEvolution = async () => {
    setSincronizando(true);
    try {
      const resp = await base44.functions.invoke('sincronizarTodosChatsCompleto', { empresa_id: empresaId });
      const data = resp?.data;
      if (data?.ok) {
        toast.success(`✅ ${data.totalConversasAgora} conversas total | ${data.criadasNovasConversas} novas | ${data.criadosNovosContatos} contatos CRM`);
        refetchConversas();
      } else {
        toast.error('Erro ao sincronizar: ' + (data?.erro || 'Desconhecido'));
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSincronizando(false);
    }
  };
  const mensagensEndRef = React.useRef(null);

  useEffect(() => {
    loadUser();
  }, []);

  // Sincronizar histórico de TODAS as conversas (agressivo)
  const sincronizarHistoricoTodasConversas = async () => {
    if (!empresaId) return;
    setSincronizando(true);
    try {
      toast.message('🔄 Sincronizando histórico de TODAS as conversas (paralelo)...', { duration: 60000 });
      
      const resp = await base44.functions.invoke('sincronizarHistoricoAgressivo', {
        empresa_id: empresaId
      });

      if (resp?.data?.ok) {
        toast.success(`✅ ${resp.data.mensagem}`);
        
        // Refetch conversas e invalidar todas as mensagens
        refetchConversas();
        conversas.forEach(c => {
          queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', c.id] });
        });
      } else {
        toast.error('Erro: ' + (resp?.data?.error || 'Desconhecido'));
      }
    } catch (e) {
      toast.error('Erro ao sincronizar: ' + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  useEffect(() => {
    if (empresaId) {
      console.log(`🏢 EmpresaId definido: ${empresaId}`);
      refetchConversas();
    }
  }, [empresaId]);



  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      console.log(`👤 Usuário carregado:`, me);
      setUser(me);

      const isSuper = me.role === 'super_admin' || me.perfil === 'super_admin';

      if (isSuper) {
        setIsSuperAdmin(true);
        // Carregar todas as empresas para o seletor
        const todasEmpresas = await base44.entities.Empresa.filter({}, '-created_date', 50);
        setEmpresas(todasEmpresas);

        // Identificar a empresa própria do super_admin estritamente pelo email
        const empDoAdmin = todasEmpresas.find(e => 
          e.email === me.email || 
          e.email_admin === me.email
        );
        if (empDoAdmin) {
          console.log(`✅ Super admin: empresa própria: ${empDoAdmin.id} (${empDoAdmin.nome})`);
          setEmpresaId(empDoAdmin.id);
          return;
        }

        // Sem empresa vinculada — super_admin seleciona manualmente no dropdown
        console.log(`ℹ️ Super admin: nenhuma empresa vinculada ao email ${me.email}. Selecione no dropdown.`);
        return;
      }

      // 1. Tentar empresa_id do usuário autenticado
      if (me.empresa_id) {
        console.log(`✅ Empresa encontrada no User: ${me.empresa_id}`);
        setEmpresaId(me.empresa_id);
        return;
      }

      // 2. Buscar Colaborador ativo
      const colabs = await base44.entities.Colaborador.filter({ 
        user_id: me.id, 
        status: 'ativo' 
      }, '-created_date', 1);
      
      if (colabs && colabs.length > 0 && colabs[0].empresa_id) {
        console.log(`✅ Colaborador encontrado, empresa: ${colabs[0].empresa_id}`);
        setEmpresaId(colabs[0].empresa_id);
        return;
      }

      // 3. Buscar Colaborador inativo como fallback
      const colabsInativos = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date', 1);
      if (colabsInativos && colabsInativos.length > 0 && colabsInativos[0].empresa_id) {
        console.log(`⚠️ Colaborador inativo, empresa: ${colabsInativos[0].empresa_id}`);
        setEmpresaId(colabsInativos[0].empresa_id);
        return;
      }

      console.error(`❌ Não foi possível determinar empresa_id`);
    } catch (e) {
      console.error('❌ Erro ao carregar usuário:', e);
    }
  };

  const { data: tagsDB = [] } = useQuery({
    queryKey: ['tags-crm', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try { return await base44.entities.ContatoTag.filter({ empresa_id: empresaId }); }
      catch { return []; }
    },
  });

  // Dados para o modal de criar tarefa
  const { colaboradores: colaboradoresTarefa, clientes: clientesTarefa, statusList: statusListTarefa, setores: setoresTarefa, subsetores: subsetoresTarefa } = useTarefaFormData(empresaId);
  const tiposListTarefa = [];

  const { data: conversas = [], refetch: refetchConversas } = useQuery({
    queryKey: ['conversas-whatsapp', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: async () => {
      if (!empresaId) return [];
      console.log(`📞 Buscando conversas para empresa: ${empresaId}`);
      const resp = await base44.functions.invoke('buscarConversasComContatos', { empresa_id: empresaId, limit: 10000 });
      const data = resp?.data?.conversas || [];
      
      // Atualizar cache de contatos — incluir foto_url da conversa como fallback
      const novoCache = {};
      data.forEach(conversa => {
        if (conversa.contato) {
          // Garantir que a foto_url da conversa seja usada se o contato não tiver
          const fotoFinal = conversa.contato.foto_url || conversa.foto_url || null;
          novoCache[conversa.id] = { ...conversa.contato, foto_url: fotoFinal };
        } else if (conversa.foto_url) {
          // Se não tem contato CRM mas tem foto_url na conversa, usar ela
          novoCache[conversa.id] = {
            nome: conversa.cliente_nome || conversa.cliente_telefone,
            telefone: conversa.cliente_telefone,
            foto_url: conversa.foto_url
          };
        }
      });
      setContatosWhatsapp(prev => {
        const merged = { ...prev };
        Object.entries(novoCache).forEach(([id, n]) => {
          merged[id] = { ...n, tags_ids: n.tags_ids?.length ? n.tags_ids : (prev[id]?.tags_ids || []) };
        });
        return merged;
      });
      const filtradas = data.filter(c => c.id && c.cliente_telefone);
      // Sincronizar fotos apenas 1x por sessão (não a cada 15s)
      const fotosSyncKey = `fotos_sync_${empresaId}`;
      if (!sessionStorage.getItem(fotosSyncKey)) {
        sessionStorage.setItem(fotosSyncKey, '1');
        setTimeout(async () => {
          try {
            await base44.functions.invoke('sincronizarFotosContatosAgressivoFinal', { empresa_id: empresaId });
          } catch (e) {}
        }, 5000);
      }

      return filtradas;
    },
    refetchInterval: 15000,  // Polling da lista de conversas a cada 15 segundos
    placeholderData: (prev) => prev,
  });

  const { data: mensagens = [], isLoading: loadingMensagens, refetch: refetchMensagens } = useQuery({
    queryKey: ['mensagens-whatsapp', conversaSelecionadaId],
    enabled: !!conversaSelecionadaId,
    queryFn: async () => {
      if (!conversaSelecionadaId) return [];
      const msgs = await base44.entities.MensagemWhatsapp.filter(
        { conversa_id: conversaSelecionadaId },
        '-data_envio',
        1000
      );
      console.log(`✅ Carregadas ${msgs.length} mensagens para conversa ${conversaSelecionadaId}`);
      // Remover msgs temp_ do cache ao fazer o fetch real (evita duplicatas)
      const ordenadas = [...msgs].reverse();
      return ordenadas;
    },
    staleTime: 0,
    refetchInterval: 5000,
    placeholderData: (prev) => {
      // Manter dados anteriores mas remover msgs temp_ se já tiver dados reais
      if (!prev) return prev;
      return prev.filter(m => !m.id?.startsWith('temp_'));
    },
  });

  // Buscar mensagens não lidas do banco e montar contadores por conversa
  useEffect(() => {
    if (!empresaId || conversas.length === 0) return;

    const conversaIds = conversas.filter(c => c.id).map(c => c.id);
    const abertaId = conversaSelecionadaId;

    base44.entities.MensagemWhatsapp.filter(
      { remetente: 'cliente' },
      '-data_envio',
      5000
    ).then(msgs => {
      const contadores = {};
      msgs.forEach(m => {
        if (!m.conversa_id) return;
        if (m.conversa_id === abertaId) return; // conversa aberta não conta
        if (!conversaIds.includes(m.conversa_id)) return; // só desta empresa
        if (m.status === 'lida') return; // já lida, não conta
        contadores[m.conversa_id] = (contadores[m.conversa_id] || 0) + 1;
      });
      // Manter contadores zerados para conversa aberta
      setNaoLidasPorConversa(prev => ({ ...contadores, [abertaId]: 0 }));
    }).catch(() => {});
  }, [empresaId, conversas, conversaSelecionadaId]);

  // Selecionar conversa inicial quando a lista carrega
  useEffect(() => {
    if (conversas.length === 0) return;
    if (!conversaSelecionada) {
      // Verificar se há conversa_id na URL (vindo do botão "Conversar" de contato compartilhado)
      const urlParams = new URLSearchParams(window.location.search);
      const conversaIdUrl = urlParams.get('conversa_id');
      const mensagemInicialUrl = urlParams.get('mensagem_inicial');
      const conversaPorUrl = conversaIdUrl ? conversas.find(c => c.id === conversaIdUrl) : null;
      
      const ultimaId = localStorage.getItem('ultimaConversaId');
      const ultimaConversa = ultimaId ? conversas.find(c => c.id === ultimaId) : null;
      // No mobile, não abrir chat automaticamente (usuário deve clicar)
      const isMobileDevice = window.innerWidth < 1024;
      const conversaParaAbrir = conversaPorUrl || ultimaConversa || conversas[0];
      // No desktop, não ativar mobileViewChat (coluna esquerda deve permanecer visível)
      selecionarConversa(conversaParaAbrir, true, isMobileDevice ? true : false);

      // Pré-preencher o campo de mensagem (ex: vindo do popup de chamada recebida)
      if (mensagemInicialUrl && conversaPorUrl) {
        setScriptCoach(mensagemInicialUrl);
        setTimeout(() => setScriptCoach(null), 500);
      }
      
      // Se veio por URL mas conversa ainda não está na lista, aguardar refetch
      if (conversaIdUrl && !conversaPorUrl) {
        refetchConversas().then(() => {});
      }
      // Limpar o parâmetro da URL sem recarregar
      if (conversaIdUrl) {
        window.history.replaceState({}, '', window.location.pathname);
        // Salvar no localStorage para que o próximo ciclo de useEffect pegue
        localStorage.setItem('ultimaConversaId', conversaIdUrl);
      }
    } else {
      // Conversa já selecionada: apenas sincronizar dados atualizados sem trocar nem re-selecionar
      const conversaAtualizada = conversas.find(c => c.id === conversaSelecionada.id);
      if (conversaAtualizada) {
        // Atualizar silenciosamente os dados da conversa selecionada (status, última mensagem, etc.)
        setConversaSelecionada(prev => prev ? { ...prev, status: conversaAtualizada.status, ultima_mensagem: conversaAtualizada.ultima_mensagem, data_ultima_mensagem: conversaAtualizada.data_ultima_mensagem, ultimo_remetente: conversaAtualizada.ultimo_remetente, tipo_conexao: conversaAtualizada.tipo_conexao, instancia: conversaAtualizada.instancia, phone_number_id_meta: conversaAtualizada.phone_number_id_meta, canal_atendimento: conversaAtualizada.canal_atendimento, canal_preferencial: conversaAtualizada.canal_preferencial, canal_origem: conversaAtualizada.canal_origem, provider: conversaAtualizada.provider, locked_provider: conversaAtualizada.locked_provider, last_inbound_provider: conversaAtualizada.last_inbound_provider } : prev);
      } else {
        // Conversa não existe mais — tentar encontrar pelo telefone
        const mesmTelefone = conversas.find(c =>
          c.cliente_telefone === conversaSelecionada.cliente_telefone
        );
        if (mesmTelefone) {
          setConversaSelecionada(mesmTelefone);
          queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', mesmTelefone.id] });
        }
      }
    }
  }, [conversas]);

  const oportunidadeAtualRef = React.useRef(oportunidadeAtual);
  React.useEffect(() => { oportunidadeAtualRef.current = oportunidadeAtual; }, [oportunidadeAtual]);
  useEffect(() => {
    if (!conversaSelecionada?.id || !oportunidadeAtual?.id) return;

    const unsub = base44.entities.Oportunidade.subscribe((event) => {
      if (event.id === oportunidadeAtualRef.current?.id && (event.type === 'update' || event.type === 'create')) {
        setOportunidadeAtual(event.data);
      }
    });
    return unsub;
  }, [conversaSelecionada?.id, oportunidadeAtual?.id]);

  // Real-time: atualizar lista de conversas quando chegar nova mensagem ou conversa criada
  const refetchConversasRef = React.useRef(refetchConversas);
  React.useEffect(() => { refetchConversasRef.current = refetchConversas; }, [refetchConversas]);

  // Debounce para evitar múltiplos refetches simultâneos (causa 429)
  const refetchConversasDebounced = React.useRef(null);
  const refetchConversasComDebounce = React.useCallback(() => {
    if (refetchConversasDebounced.current) clearTimeout(refetchConversasDebounced.current);
    refetchConversasDebounced.current = setTimeout(() => {
      refetchConversasRef.current?.().catch(e => console.error('Erro ao refetch:', e));
    }, 3000);
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    const unsub = base44.entities.ConversaWhatsapp.subscribe((event) => {
      console.log(`🔔 ConversaWhatsapp ${event.type}:`, event.id);
      if (['create', 'update'].includes(event.type)) {
        refetchConversasComDebounce();
      }
    });
    return unsub;
  }, [empresaId, refetchConversasComDebounce]);



  // Solicitar permissão para notificações do browser na primeira vez
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Real-time: atualizar mensagens quando chegar nova mensagem no banco
  // Usar ref para ter acesso ao valor atual sem re-criar a subscription
  const conversaSelecionadaIdRef = React.useRef(conversaSelecionadaId);
  const conversasRef = React.useRef(conversas);
  const notificadasRef = React.useRef(new Set()); // IDs já notificados — evita duplicatas
  const empresaIdRef = React.useRef(empresaId);
  React.useEffect(() => { conversaSelecionadaIdRef.current = conversaSelecionadaId; }, [conversaSelecionadaId]);
  React.useEffect(() => { conversasRef.current = conversas; }, [conversas]);
  React.useEffect(() => { empresaIdRef.current = empresaId; }, [empresaId]);

  // Subscription para updates de status de mensagens (ACKs/leitura) em tempo real
  useEffect(() => {
    if (!empresaId) return;
    const unsub = base44.entities.MensagemWhatsapp.subscribe((event) => {
      if (event.type !== 'update') return;
      const msgData = event.data;
      if (!msgData?.id || !msgData?.conversa_id) return;

      console.log(`🟢 Update msg via subscription: ${msgData.id} → status: ${msgData.status}`);

      // Atualizar cache LOCAL imediatamente — mesclar todos os campos atualizados (status, reaction, etc.)
      queryClient.setQueryData(['mensagens-whatsapp', msgData.conversa_id], (old) => {
        if (!old || !Array.isArray(old)) return old;
        const idx = old.findIndex(m => m.id === msgData.id);
        if (idx === -1) return old;
        const nova = [...old];
        // Mesclar com prioridade para status (nunca fazer downgrade)
        const statusPriority = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0 };
        const novoStatus = msgData.status && (statusPriority[msgData.status] ?? -1) >= (statusPriority[nova[idx].status] ?? -1)
          ? msgData.status
          : nova[idx].status;
        nova[idx] = { ...nova[idx], ...msgData, status: novoStatus };
        return nova;
      });
    });
    return unsub;
  }, [empresaId, queryClient]);

  useEffect(() => {
    if (!empresaId || !refetchConversas) return;
    console.log(`🔌 Conectando subscription de mensagens...`);
    const unsub = base44.entities.MensagemWhatsapp.subscribe((event) => {
      console.log(`📨 Event recebido:`, { type: event.type, conversa_id: event.data?.conversa_id });
      if (event.type !== 'create') return;

      const msgData = event.data;
      const conversaAtualId = conversaSelecionadaIdRef.current;

      console.log(`🔄 Nova mensagem: ${msgData?.id} para conversa ${msgData?.conversa_id}, conversa aberta: ${conversaAtualId}`);

      // Sempre refetch conversas para atualizar última mensagem (com debounce para evitar 429)
      refetchConversasComDebounce();

      // Refetch mensagens da conversa aberta — apenas 1 vez, sem duplicatas
      if (conversaAtualId) {
        queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaAtualId] });
        // Scroll para o final após refetch
        setTimeout(() => {
          if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTop = viewport.scrollHeight;
          }
        }, 800);
      }

      // Atualizar contador de não lidas e marcar último remetente como cliente
      if (msgData?.remetente === 'cliente' && msgData?.conversa_id) {
        const conversaAtualId = conversaSelecionadaIdRef.current;
        if (msgData.conversa_id !== conversaAtualId) {
          setNaoLidasPorConversa(prev => {
            const nova = { ...prev };
            nova[msgData.conversa_id] = (nova[msgData.conversa_id] || 0) + 1;
            // Garantir que conversa aberta mantenha contador = 0
            nova[conversaAtualId] = 0;
            return nova;
          });
        } else {
          // Conversa aberta: garantir que o contador seja 0
          setNaoLidasPorConversa(prev => ({ ...prev, [conversaAtualId]: 0 }));
        }
        // Marcar último remetente como cliente (conversa volta para "em espera" se responsável expirou)
        base44.entities.ConversaWhatsapp.update(msgData.conversa_id, {
          ultimo_remetente: 'cliente',
        }).catch(() => {});

        const conversaEncerrada = conversasRef.current.find(c => c.id === msgData.conversa_id && c.status === 'encerrada');
        if (conversaEncerrada) {
        const nomeContato = conversaEncerrada.cliente_nome || conversaEncerrada.cliente_telefone || 'Cliente';
        toast.message(`📩 Nova mensagem de ${nomeContato}`, { description: 'Esta conversa está finalizada. Deseja reabri-la?', duration: 15000, action: { label: 'Abrir conversa', onClick: async () => { const eid = empresaIdRef.current; queryClient.setQueryData(['conversas-whatsapp', eid], (old = []) => old.map(c => c.id === conversaEncerrada.id ? { ...c, status: 'ativa', ultimo_remetente: 'cliente', responsavel_id: null, responsavel_expira_em: null } : c)); selecionarConversa({ ...conversaEncerrada, status: 'ativa' }); base44.entities.ConversaWhatsapp.update(conversaEncerrada.id, { status: 'ativa', ultimo_remetente: 'cliente', responsavel_id: null, responsavel_expira_em: null }).catch(() => {}); toast.success('Conversa reaberta!'); } } });
        }
      }

      // Notificação apenas para mensagens de cliente — apenas UMA VEZ por mensagem
      if (msgData?.remetente === 'cliente' && msgData?.id) {
        // Checar se já notificou esta mensagem
        if (notificadasRef.current.has(msgData.id)) return;
        notificadasRef.current.add(msgData.id);

        // Só notificar mensagens recentes (menos de 60 segundos)
        const dataEnvio = msgData.data_envio ? new Date(msgData.data_envio) : null;
        const agora = new Date();
        const diffSegundos = dataEnvio ? (agora - dataEnvio) / 1000 : 0;
        if (diffSegundos > 60) return;

        const conversa = conversasRef.current.find(c => c.id === msgData.conversa_id);
        const nomeRemetente = conversa?.cliente_nome || conversa?.cliente_telefone || 'Cliente';
        const textoMsg = msgData.texto || '📎 Arquivo recebido';

        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          const notif = new Notification(`💬 ${nomeRemetente}`, {
            body: textoMsg, icon: '/favicon.ico', tag: msgData.id,
          });
          notif.onclick = () => { window.focus(); if (conversa) selecionarConversa(conversa); notif.close(); };
        }
      }
    });
    return unsub;
  }, [empresaId, refetchConversas, refetchMensagens]);

  const criarConversaMutation = useMutation({
    mutationFn: async ({ telefone, nome }) => {
      // Novas conversas devem usar a D-API por padrão (Evolution não está mais em uso)
      let dadosCanal = { tipo_conexao: 'empresa' };
      try {
        const conexoesDapi = await base44.entities.WhatsappConnection.filter({
          empresa_id: empresaId,
          provider_type: 'dapi',
          is_active: true
        }, '-created_date', 1);
        const conexaoDapi = conexoesDapi?.[0];
        if (conexaoDapi) {
          dadosCanal = {
            tipo_conexao: 'dapi',
            canal_origem: 'dapi',
            provider: 'dapi',
            instancia: conexaoDapi.session_id || 'D-API',
            connection_id: conexaoDapi.id,
            locked_provider: true,
          };
        }
      } catch (_) {}

      return await base44.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: '',
        cliente_nome: nome,
        cliente_telefone: telefone,
        whatsapp_id: `conv_${Date.now()}`,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        ...dadosCanal
      });
    },
    onSuccess: (conversa) => {
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      refetchConversas();
      selecionarConversa(conversa);
      setNovaConversaOpen(false);
      toast.success('Conversa criada! Envie a primeira mensagem.');
    },
    onError: (error) => {
      toast.error('Erro ao criar conversa: ' + error.message);
    }
  });

  const enviarMensagemMutation = useMutation({
    mutationFn: async ({ texto, arquivo, mensagemParaResponder }) => {
      if (!texto?.trim() && !arquivo) {
        throw new Error('Mensagem ou arquivo obrigatório');
      }
      // Para grupos usar o whatsapp_id (JID @g.us), para individuais usar o telefone
      const destinatario = isGrupo(conversaSelecionada)
        ? conversaSelecionada.whatsapp_id
        : conversaSelecionada.cliente_telefone;
      // NÃO passar forcar_api — o backend decide automaticamente pelo tipo_conexao da conversa
      const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversaSelecionada.id,
        mensagem_texto: texto,
        numero_cliente: destinatario,
        empresa_id: empresaId,
        arquivo: arquivo,
        resposta_para_texto: mensagemParaResponder?.texto || null,
        resposta_para_nome: mensagemParaResponder ? (mensagemParaResponder.remetente === 'vendedor' ? (mensagemParaResponder.usuario_nome || 'Você') : (conversaSelecionada?.cliente_nome || 'Cliente')) : null,
        resposta_para_message_id: mensagemParaResponder?.whatsapp_message_id || null,
      });
      if (!resp?.data?.success) {
        throw new Error(resp?.data?.error || 'Erro ao enviar mensagem');
      }
      return resp.data;
    },
    onMutate: async ({ texto, arquivo, mensagemParaResponder }) => {
      // Mensagem otimista — aparece imediatamente
      const queryKey = ['mensagens-whatsapp', conversaSelecionadaId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      
      let tipoConteudo = 'texto';
      let textoExibicao = texto;
      
      if (arquivo) {
        if (arquivo.tipo?.includes('image')) tipoConteudo = 'imagem';
        else if (arquivo.tipo?.includes('audio')) tipoConteudo = 'audio';
        else if (arquivo.tipo?.includes('video')) tipoConteudo = 'video';
        else if (arquivo.tipo?.includes('pdf')) tipoConteudo = 'pdf';
        
        textoExibicao = texto || arquivo.nome || 'Arquivo';
      }
      
      queryClient.setQueryData(queryKey, (old = []) => [
        ...old,
        {
          id: `temp_${Date.now()}`,
          conversa_id: conversaSelecionadaId,
          remetente: 'vendedor',
          tipo_conteudo: tipoConteudo,
          texto: textoExibicao,
          arquivo_nome: arquivo?.nome || null,
          data_envio: new Date().toISOString(),
          status: 'pendente',
          resposta_para_texto: mensagemParaResponder?.texto || null,
          resposta_para_nome: mensagemParaResponder ? (mensagemParaResponder.remetente === 'vendedor' ? (mensagemParaResponder.usuario_nome || 'Você') : (conversaSelecionada?.cliente_nome || 'Cliente')) : null,
        }
      ]);
      return { previous, queryKey };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      let errorMsg = error.message || 'Erro ao enviar mensagem';
      if (error?.response?.data?.error) {
        errorMsg = error.response.data.error;
      }
      toast.error(errorMsg);
    },
    onSuccess: async (data, variables) => {
      if (conversaSelecionada) {
        const msgExibicao = variables.texto || (variables.arquivo ? variables.arquivo.nome : '');
        const expira = new Date(Date.now() + TEMPO_ATENDIMENTO_MS).toISOString();

        // 1. Atualizar cache LOCAL imediatamente — move conversa para "Em Atendimento"
        queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
          old.map(c => c.id === conversaSelecionada.id
            ? { ...c, ultimo_remetente: 'vendedor', ultima_mensagem: msgExibicao, data_ultima_mensagem: new Date().toISOString(), responsavel_id: user?.colaborador_id || user?.id, responsavel_nome: user?.nome_perfil || user?.full_name || user?.email || 'Atendente', responsavel_expira_em: expira }
            : c
          )
        );

        // 2. Salvar no banco em background (sem bloquear a UI)
        base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
          ultima_mensagem: msgExibicao,
          data_ultima_mensagem: new Date().toISOString(),
          ultimo_remetente: 'vendedor',
          responsavel_id: user?.colaborador_id || user?.id || 'atendente',
          responsavel_nome: user?.nome_perfil || user?.full_name || user?.email || 'Atendente',
          responsavel_expira_em: expira,
        }).then(() => refetchConversas()).catch(() => {});
      }

      // 3. Buscar mensagem real do banco imediatamente e substituir o temp_
      queryClient.refetchQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionadaId], type: 'active' });

      // 4. Após 3s, forçar busca de status atualizado na Evolution (ACK pode demorar)
      setTimeout(() => {
        base44.functions.invoke('forcarStatusMensagensRecentes', {
          conversa_id: conversaSelecionadaId,
          empresa_id: empresaId
        }).then(() => {
          queryClient.refetchQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionadaId], type: 'active' });
        }).catch(() => {});
      }, 3000);

      toast.success('Mensagem enviada');
    }
  });

  const scrollAreaRef = React.useRef(null);

  // Scroll automático para última mensagem
  const fazerScrollParaFim = React.useCallback(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        // Usar requestAnimationFrame para garantir que o DOM foi atualizado
        requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight;
        });
      }
    }
  }, []);

  React.useEffect(() => {
    if (!mensagens.length) return;
    fazerScrollParaFim();
  }, [mensagens, fazerScrollParaFim]);

  // Ao abrir conversa, forçar refetch do histórico e forçar atualização de status
  React.useEffect(() => {
    if (!conversaSelecionada?.id || !empresaId) return;

    // Invalidar query para forçar novo fetch
    queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id] });
    
    setTimeout(() => {
      refetchMensagens?.().catch(e => console.error('Erro no refetch:', e));
      setTimeout(fazerScrollParaFim, 300);
    }, 100);

    // Forçar atualização de status das mensagens enviadas via Evolution API
    const atualizarStatus = () => {
      base44.functions.invoke('forcarStatusMensagensRecentes', {
        conversa_id: conversaSelecionada.id,
        empresa_id: empresaId
      }).then(() => {
        queryClient.refetchQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id], type: 'active' });
      }).catch(() => {});
    };

    atualizarStatus();
    // Polling a cada 60s (reduzido de 10s) para pegar status atualizados — ACKs vêm via subscription
    const intervalo = setInterval(atualizarStatus, 60000);
    return () => clearInterval(intervalo);
  }, [conversaSelecionada?.id, empresaId]);

  // Normalizar telefone para +55 DD NNNNNNNNN
  const normalizarTelefone = (tel) => {
    if (!tel) return null;
    const n = tel.replace(/\D/g, '');
    if (n.startsWith('55') && (n.length === 12 || n.length === 13)) {
      return '+' + n;
    }
    return null;
  };

  // Validação estrita: só números BR válidos (55 + DDD + número = 12 ou 13 dígitos)
  const isTelefoneValido = (tel) => {
    return normalizarTelefone(tel) !== null;
  };

  // Helper: detectar se é grupo
  const isGrupo = (c) => {
    const tel = (c.cliente_telefone || '');
    const wid = (c.whatsapp_id || '');
    return (
      tel.includes('@g.us') ||
      tel.includes('@broadcast') ||
      wid.includes('@g.us') ||
      wid.includes('@broadcast')
    );
  };

  // ── Lógica de responsabilidade por 10 minutos ────────────────────────────
  // Quando atendente responde → marcar conversa com responsavel_id + responsavel_expira_em
  // Se expirar → conversa volta para "em_espera"

  const TEMPO_ATENDIMENTO_MS = 10 * 60 * 1000; // 10 minutos

  // Verificar se a conversa tem atendente ativo (responsável não expirado)
  const temAtendente = (c) => {
    if (!c.responsavel_id || !c.responsavel_expira_em) return false;
    return new Date(c.responsavel_expira_em) > new Date();
  };

  // Em espera: último remetente foi o CLIENTE AND NÃO há atendente ativo
  // Só mostra bolinha quando cliente enviou mensagem E ninguém respondeu ainda
  const estaEmEspera = (c) => {
    if (!c || !c.id) return false;
    if (c.status === 'arquivada' || c.status === 'encerrada') return false;
    if (c.status !== 'ativa') return false;
    if (c.ultimo_remetente !== 'cliente') return false;
    // NÃO está em espera se há um atendente ativo responsável
    return !temAtendente(c);
  };

  // Em atendimento: atendente respondeu recentemente (dentro dos 10 min) E NÃO está em espera
  const estaEmAtendimento = (c) => {
    if (!c || !c.id) return false;
    if (c.status === 'arquivada' || c.status === 'encerrada') return false;
    if (estaEmEspera(c)) return false; // se está em espera, não está em atendimento
    return temAtendente(c) && c.status === 'ativa';
  };

  // Ao enviar mensagem, marcar responsabilidade por 10min
  const marcarResponsabilidade = async (conversaId) => {
    const expira = new Date(Date.now() + TEMPO_ATENDIMENTO_MS).toISOString();
    try {
      await base44.entities.ConversaWhatsapp.update(conversaId, {
        responsavel_id: user?.colaborador_id || user?.id || 'atendente',
        responsavel_expira_em: expira,
        ultimo_remetente: 'vendedor',
      });
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
    } catch (_) {}
  };

  // Conversas válidas — exclui grupos, broadcast e LID (apenas contatos individuais)
  const conversasValidas = React.useMemo(() => conversas.filter(c => {
    if (!c || !c.id || !c.cliente_telefone) return false;
    if (isGrupo(c)) return false;
    const tel = (c.cliente_telefone || '').replace(/\D/g, '');
    if (c.cliente_telefone?.includes('@lid') || tel.startsWith('lid_')) return false;
    return tel.length >= 8;
  }), [conversas]);

  // Conversas de grupos
  const conversasGrupos = React.useMemo(() => conversas.filter(c => isGrupo(c) && c.bloqueado !== true && c.bloqueado !== 'true'), [conversas]);

  // Verifica se ainda há atendente ativo (dentro dos 10 minutos)
  const atendenteDentroDoTempo = (c) => {
    if (!c.responsavel_expira_em) return false;
    return new Date(c.responsavel_expira_em) > new Date();
  };

  // Conversa está em espera: cliente enviou mensagem E não há atendente ativo no tempo de 10 min
  const estaEmEsperaFiltro = (c) => {
    if (c.status !== 'ativa') return false;
    if (atendenteDentroDoTempo(c)) return false; // ainda em atendimento, não vai para espera
    return (naoLidasPorConversa[c.id] > 0 || c.ultimo_remetente === 'cliente');
  };
  // Conversa está em atendimento: atendente respondeu nos últimos 10 min OU sem remetente definido
  const estaEmAtendimentoFiltro = (c) => c.status === 'ativa' && !estaEmEsperaFiltro(c);

  // Contadores por aba — cada um reflete exatamente o que será exibido naquele filtro
  const contadores = {
    todas: conversas.filter(c => !isGrupo(c)).length,
    espera: conversasValidas.filter(c => estaEmEsperaFiltro(c)).length,
    ativa: conversasValidas.filter(c => estaEmAtendimentoFiltro(c)).length,
    encerrada: conversas.filter(c => !isGrupo(c) && c.status === 'encerrada' && !c.responsavel_id).length,
    transferida: conversas.filter(c => !isGrupo(c) && c.status === 'encerrada' && !!c.responsavel_id).length,
    meu: conversasValidas.filter(c => c.status === 'ativa' && atendenteDentroDoTempo(c) && c.responsavel_id === (user?.colaborador_id || user?.id)).length,
    grupos: conversasGrupos.length,
    campanhas: conversas.filter(c => !isGrupo(c) && c.status === 'campanha').length,
  };



  const conversasFiltradas = conversas
    .filter(c => {
      if (!c || !c.id) return false;
      const temIdentificador = c.cliente_telefone || c.whatsapp_id;
      if (!temIdentificador) return false;

      // Pesquisa dentro do filtro ativo
      if (searchConversas) {
        const q = searchConversas.toLowerCase();
        const match =
          (c.cliente_nome || '').toLowerCase().includes(q) ||
          (c.cliente_telefone || '').includes(searchConversas);
        if (!match) return false;
      }

      // Grupos: só aparecem no filtro 'grupos'
      if (isGrupo(c)) {
        if (filtroStatus === 'grupos') return c.bloqueado !== true && c.bloqueado !== 'true';
        if (filtroStatus === 'todas') return false; // grupos ficam fora do "Todos"
        return false;
      }

      // Conversas individuais (não-grupo)
      if (filtroStatus === 'todas')      return true; // 100% das conversas individuais
      if (filtroStatus === 'espera')     return estaEmEsperaFiltro(c);
      if (filtroStatus === 'ativa')      return estaEmAtendimentoFiltro(c);
      if (filtroStatus === 'encerrada')  return c.status === 'encerrada' && !c.responsavel_id;
      if (filtroStatus === 'transferida') return c.status === 'encerrada' && !!c.responsavel_id;
      if (filtroStatus === 'meu')        return c.status === 'ativa' && atendenteDentroDoTempo(c) && c.responsavel_id === (user?.colaborador_id || user?.id);
      if (filtroStatus === 'campanhas')  return c.status === 'campanha';
      if (filtroStatus === 'grupos')     return false; // individuais fora de 'grupos'

      return false;
    })
    .sort((a, b) =>
      new Date(b.data_ultima_mensagem || 0) - new Date(a.data_ultima_mensagem || 0)
    );

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Dashboard de Produtividade — fora do batepapo-root para z-index correto */}
      {produtividadeOpen && (
        <DashboardProdutividade
          empresaId={empresaId}
          currentUser={user}
          onClose={() => setProdutividadeOpen(false)}
          onAbrirConversa={(conversaId) => {
            setProdutividadeOpen(false);
            const conv = conversas.find(c => c.id === conversaId);
            if (conv) selecionarConversa(conv);
          }}
        />
      )}
      <div id="batepapo-root" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, display: 'flex', flexDirection: 'column', padding: '8px', boxSizing: 'border-box', backgroundColor: '#F0EBE0' }}>
        <style>{`
          @media (min-width: 1024px) { #batepapo-root { left: 18rem !important; } }
          @media (max-width: 1023px) { #batepapo-root { top: 3.5rem !important; padding: 0 !important; } }
          #batepapo-root > div > div { border-radius: 0 !important; }
          .jd-messenger-sidebar {
            width: 100%;
            max-width: 340px;
            min-width: 300px;
            height: 100%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          @media (max-width: 1023px) {
            .jd-messenger-sidebar {
              max-width: 100% !important;
              min-width: 100% !important;
              width: 100% !important;
            }
            #batepapo-root { padding: 0 !important; }
            .jd-chat-card { min-height: 64px; padding: 8px 10px; }
            .jd-chat-name { font-size: 14px; }
            .jd-chat-avatar { width: 46px; height: 46px; min-width: 46px; }
          }
          .jd-messenger-top {
            flex-shrink: 0;
          }
          .jd-conversation-list {
            overflow-y: auto;
            overflow-x: hidden;
          }
          .jd-chat-list {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            padding: 8px 10px;
            box-sizing: border-box;
          }
          .jd-chat-card {
            width: 100%;
            max-width: 100%;
            min-height: 76px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            margin-bottom: 6px;
            background: #f7f7f7;
            border-radius: 14px;
            overflow: hidden;
            cursor: pointer;
            transition: background-color 150ms;
            flex-shrink: 0;
          }
          .jd-chat-card:hover {
            background: #efefef;
          }
          .jd-chat-card.selected {
            background: #d1e9ff;
            box-shadow: inset 3px 0 0 #2563eb;
          }
          .jd-chat-avatar {
            width: 52px;
            height: 52px;
            min-width: 52px;
            border-radius: 50%;
            overflow: hidden;
            position: relative;
            flex-shrink: 0;
          }
          .jd-chat-content {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .jd-chat-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            width: 100%;
            min-width: 0;
            overflow: hidden;
          }
          .jd-chat-name {
            flex: 1;
            min-width: 0;
            font-size: 15px;
            font-weight: 600;
            color: #111827;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
          }
          .jd-chat-time {
            flex-shrink: 0;
            font-size: 12px;
            color: #6b7280;
            white-space: nowrap;
          }
          .jd-chat-bottom {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            width: 100%;
            min-width: 0;
            margin-top: 3px;
            overflow: hidden;
          }
          .jd-chat-message {
            flex: 1;
            min-width: 0;
            font-size: 13px;
            color: #6b7280;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
            line-height: 20px;
            max-height: 20px;
          }
          .jd-chat-badge {
            flex-shrink: 0;
            min-width: 20px;
            height: 20px;
            padding: 0 5px;
            border-radius: 999px;
            background: #22c55e;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .jd-chat-menu {
            flex-shrink: 0;
            color: #9ca3af;
            opacity: 1;
          }
        `}</style>
        <NovaConversaModal
          open={novaConversaOpen}
          onOpenChange={setNovaConversaOpen}
          onCriar={(dados) => criarConversaMutation.mutate(dados)}
          isLoading={criarConversaMutation.isPending}
        />

        {/* Modal Transferir Atendimento */}
        <TransferirAtendimentoModal
          open={!!transferirModal}
          onOpenChange={(v) => !v && setTransferirModal(null)}
          conversa={transferirModal}
          empresaId={empresaId}
          onTransferir={handleTransferir}
        />

        {/* Modal Criar Tarefa */}
        <TarefaFormModal
          open={criarTarefaOpen}
          onOpenChange={(v) => { setCriarTarefaOpen(v); if (!v) setConversaTarefa(null); }}
          tarefa={tarefaPreenchida}
          onSave={async (data) => {
            try {
              await base44.entities.Tarefa.create({
                ...data,
                empresa_id: empresaId,
                cliente_telefone: data.cliente_telefone || conversaTarefa?.cliente_telefone || conversaSelecionada?.cliente_telefone || '',
                cliente_nome: data.cliente_nome || contatosWhatsapp[conversaTarefa?.id]?.nome || conversaTarefa?.cliente_nome || '',
              });
              toast.success('Tarefa criada com sucesso!');
              setCriarTarefaOpen(false);
              setConversaTarefa(null);
            } catch (e) {
              toast.error('Erro ao criar tarefa: ' + e.message);
            }
          }}
          colaboradores={colaboradoresTarefa}
          clientes={clientesTarefa}
          statusList={statusListTarefa}
          templates={[]}
          tiposList={tiposListTarefa}
          setoresList={setoresTarefa}
          subsetoresList={subsetoresTarefa}
          currentUser={user}
          empresaId={empresaId}
        />

        {/* Modal Tags - Atribuir a Contato */}
        <TagsModal
          open={tagsModalOpen}
          onOpenChange={setTagsModalOpen}
          contato={contatoParaTags}
          empresaId={empresaId}
          onTagsChange={(novasTags) => {
            if (!contatoParaTags?.id) return;
            setContatosWhatsapp(prev => ({
              ...prev,
              [contatoParaTags.id]: { ...(prev[contatoParaTags.id] || {}), tags_ids: novasTags },
            }));
          }}
        />

        {/* Modal Gerenciar Tags */}
        <TagsGerenciamentoModal
          open={gerenciamentoTagsOpen}
          onOpenChange={setGerenciamentoTagsOpen}
          empresaId={empresaId}
        />

        <MensagensAgendadasModal open={agendadasOpen} onOpenChange={setAgendadasOpen} empresaId={empresaId} />

        {/* Modal Agendar Mensagem */}
        <AgendarMensagemModal
          open={!!agendarMensagemModal}
          onOpenChange={(v) => !v && setAgendarMensagemModal(null)}
          conversa={agendarMensagemModal}
          currentUser={user}
        />

        {/* Modal Agendar Reunião */}
        <AgendarReuniaoModal
          open={!!agendarReuniaoModal}
          onOpenChange={(v) => !v && setAgendarReuniaoModal(null)}
          conversa={agendarReuniaoModal}
          user={user}
        />


        {/* Modal Funil de Vendas */}
        <FunilSelectionModal
          open={funilModalOpen}
          onOpenChange={setFunilModalOpen}
          contato={contatosWhatsapp[conversaSelecionada?.id] || conversaSelecionada}
          empresaId={empresaId}
          existingOportunidade={oportunidadeAtual}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
            selecionarConversa(conversaSelecionada);
          }}
        />

        {/* Modal Grupos Bloqueados */}
        <Dialog open={gruposBloqueadosOpen} onOpenChange={setGruposBloqueadosOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-500" />
                Grupos Bloqueados
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">
              {loadingGruposBloqueados ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : gruposBloqueadosLista.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                  <Unlock className="w-10 h-10 opacity-40" />
                  <p className="text-sm">Nenhum grupo bloqueado</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {gruposBloqueadosLista.map(c => {
                    const nome = contatosWhatsapp[c.id]?.nome || c.cliente_nome || c.whatsapp_id || c.cliente_telefone;
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                        <div className="relative flex-shrink-0">
                          <AvatarContato
                            contato={contatosWhatsapp[c.id] || { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url }}
                            className="h-10 w-10"
                          />
                          <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-orange-500 flex items-center justify-center">
                            <Lock className="w-2 h-2 text-white" />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{nome}</p>
                          <p className="text-xs text-slate-500 truncate">{c.cliente_telefone || c.whatsapp_id}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0 gap-1.5 text-xs text-green-600 border-green-300 hover:bg-green-50"
                          onClick={async () => {
                            await base44.entities.ConversaWhatsapp.update(c.id, { bloqueado: false });
                            setGruposBloqueadosLista(prev => prev.filter(g => g.id !== c.id));
                            queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
                              old.map(cv => cv.id === c.id ? { ...cv, bloqueado: false } : cv)
                            );
                            toast.success('🔓 Grupo desbloqueado');
                          }}
                        >
                          <Unlock className="w-3 h-3" />
                          Desbloquear
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGruposBloqueadosOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Editor de imagem — fluxo "Editar e reenviar" de imagem recebida */}
        <ImageEditorModal
          open={!!editorReenvioUrl}
          onClose={() => setEditorReenvioUrl(null)}
          imagensIniciais={editorReenvioUrl ? [{ url: editorReenvioUrl }] : []}
          nomeCliente={contatosWhatsapp[conversaSelecionada?.id]?.nome || conversaSelecionada?.cliente_nome}
          empresaId={empresaId}
          conversaId={conversaSelecionada?.id}
          user={user}
          onEnviar={async ({ texto, arquivo }) => {
            await enviarMensagemMutation.mutateAsync({ texto, arquivo, mensagemParaResponder: null });
          }}
        />

        {/* Modal Salvar/Editar Contato CRM */}
        <Dialog open={!!salvarCrmModal} onOpenChange={(v) => !v && setSalvarCrmModal(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Contact className="w-4 h-4" />
                {salvarCrmModal?.contato?.id ? 'Editar contato no CRM' : 'Salvar contato no CRM'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs text-slate-600">Telefone</Label>
                <p className="text-sm font-medium mt-0.5">{salvarCrmModal?.conversa?.cliente_telefone}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Nome do contato</Label>
                <Input
                  value={nomeContatoEdit}
                  onChange={e => setNomeContatoEdit(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="mt-1"
                  onKeyDown={e => e.key === 'Enter' && salvarContatoCrm()}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSalvarCrmModal(null)}>Cancelar</Button>
              <Button onClick={salvarContatoCrm} disabled={salvandoCrm || !nomeContatoEdit.trim()} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
                {salvandoCrm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {salvarCrmModal?.contato?.id ? 'Salvar alterações' : 'Salvar no CRM'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', overflow: 'hidden', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '100%' }}>
          {/* Coluna esquerda - Conversas */}
          <Card className={`jd-messenger-sidebar shrink-0 flex-col overflow-hidden rounded-none rounded-l-xl border-r-0 [&_[data-radix-scroll-area-scrollbar]]:hidden lg:flex lg:w-auto ${mobileViewChat ? '!hidden' : 'flex w-full'}`} style={{ width: '420px', maxWidth: '420px', minWidth: '380px', flexShrink: 0, flexGrow: 0, height: '100%', boxSizing: 'border-box' }}>
            <CardHeader className="jd-messenger-top flex flex-row items-center justify-between gap-2 pb-2 px-4 py-3 flex-shrink-0">
              <p className="text-lg font-semibold">Conversas</p>
              <div className="flex items-center gap-1">
                {['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setProdutividadeOpen(true)}>
                        <BarChart2 className="h-5 w-5 text-emerald-600" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Painel de Produtividade</TooltipContent>
                  </Tooltip>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setNovaConversaOpen(true)}>
                  <Plus className="h-5 w-5" />
                </Button>
                <BatePapoMenu
                  empresaId={empresaId}
                  sincronizando={sincronizando}
                  setSincronizando={setSincronizando}
                  setGerenciamentoTagsOpen={setGerenciamentoTagsOpen}
                  setGruposBloqueadosOpen={setGruposBloqueadosOpen}
                  limparHistoricoCompleto={limparHistoricoCompleto}
                  limpandoTudo={limpandoTudo}
                  refetchConversas={refetchConversas}
                  sincronizarTodosContatosEvolution={sincronizarTodosContatosEvolution}
                  sincronizarHistoricoTodasConversas={sincronizarHistoricoTodasConversas}
                  setAgendadasOpen={setAgendadasOpen}
                />
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 pt-3 px-4 overflow-hidden" style={{ flex: '1 1 0', minHeight: 0, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
              {/* Seletor de empresa — apenas super_admin */}
              {isSuperAdmin && empresas.length > 0 && (
                <Select value={empresaId || ''} onValueChange={(val) => {
                  setEmpresaId(val);
                  setConversaSelecionada(null);
                }}>
                  <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200 bg-slate-50">
                    <SelectValue placeholder="Selecionar empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => (
                      <SelectItem key={e.id} value={e.id} className="text-xs">
                        {e.nome} {e.evolution_instance_name ? `(${e.evolution_instance_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <Input
                  className="h-9 rounded-full bg-slate-100 pl-10 text-sm border-0 placeholder:text-slate-500"
                  placeholder="Pesquisar ou começar uma nova conve..."
                  value={searchConversas}
                  onChange={(e) => setSearchConversas(e.target.value)}
                />
              </div>

              {/* Status badges com abas — 2 linhas de 4 */}
              <div className="space-y-1.5">
                {/* Linha 1: Em Atend. | Esperando | Responsável | Transferidos */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button onClick={() => setFiltroStatus('ativa')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'ativa' ? 'bg-slate-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'ativa' ? 'text-white' : 'text-slate-700'}`}>{contadores.ativa}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'ativa' ? 'text-white' : 'text-slate-600'}`}>Em Atend.</span>
                  </button>

                  <button onClick={() => setFiltroStatus('espera')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'espera' ? 'bg-red-500' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'espera' ? 'text-white' : 'text-red-500'}`}>{contadores.espera}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'espera' ? 'text-white' : 'text-slate-600'}`}>Esperando</span>
                  </button>

                  <button onClick={() => setFiltroStatus('meu')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'meu' ? 'bg-emerald-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'meu' ? 'text-white' : 'text-emerald-500'}`}>{contadores.meu}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'meu' ? 'text-white' : 'text-slate-600'}`}>Responsável</span>
                  </button>

                  <button onClick={() => setFiltroStatus('transferida')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'transferida' ? 'bg-purple-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'transferida' ? 'text-white' : 'text-purple-500'}`}>{contadores.transferida}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'transferida' ? 'text-white' : 'text-slate-600'}`}>Transferidos</span>
                  </button>
                </div>

                {/* Linha 2: Grupos | Finalizados | Todos | Campanhas */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button onClick={() => setFiltroStatus('grupos')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'grupos' ? 'bg-emerald-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'grupos' ? 'text-white' : 'text-emerald-500'}`}>{contadores.grupos}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'grupos' ? 'text-white' : 'text-slate-600'}`}>Grupos</span>
                  </button>

                  <button onClick={() => setFiltroStatus('encerrada')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'encerrada' ? 'bg-slate-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'encerrada' ? 'text-white' : 'text-slate-700'}`}>{contadores.encerrada}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'encerrada' ? 'text-white' : 'text-slate-600'}`}>Finalizados</span>
                  </button>

                  <button onClick={() => setFiltroStatus('todas')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'todas' ? 'bg-slate-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'todas' ? 'text-white' : 'text-slate-700'}`}>{contadores.todas}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'todas' ? 'text-white' : 'text-slate-600'}`}>Todos</span>
                  </button>

                  <button onClick={() => setFiltroStatus('campanhas')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'campanhas' ? 'bg-cyan-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'campanhas' ? 'text-white' : 'text-cyan-600'}`}>{contadores.campanhas}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'campanhas' ? 'text-white' : 'text-slate-600'}`}>Campanhas</span>
                  </button>
                </div>
              </div>

              {filtroStatus === 'transferida' && contadores.transferida > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50"
                  onClick={encerrarTodosTransferidos}
                  disabled={encerrandoTransferidos}
                >
                  {encerrandoTransferidos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Encerrar todos os {contadores.transferida} transferidos
                </Button>
              )}

              <div className="jd-conversation-list mt-1" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', width: '100%' }}>
                <div className="jd-chat-list pb-4" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
                  {conversasFiltradas.length === 0 && filtroStatus === 'espera' ? (
                    <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2 px-2">
                      <MessageCircle className="w-8 h-8 opacity-40" />
                      <p className="text-xs text-center text-slate-400">
                        {conversasValidas.filter(c => !isGrupo(c)).length} conversas verificadas.<br/>
                        Com último remetente cliente: {conversasValidas.filter(c => !isGrupo(c) && c.ultimo_remetente === 'cliente').length}<br/>
                        Com msgs não lidas: {conversasValidas.filter(c => !isGrupo(c) && naoLidasPorConversa[c.id] > 0).length}
                      </p>
                    </div>
                  ) : conversasFiltradas.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-400">
                      <MessageCircle className="w-8 h-8 opacity-40" />
                    </div>
                  ) : conversasFiltradas.map((c) => {
                      const naoLidas = naoLidasPorConversa[c.id] ?? 0;
                       const isSelecionada = conversaSelecionada?.id === c.id;
                       const mostrarBadge = !isSelecionada && c.status !== 'encerrada' && (naoLidas > 0 || estaEmEspera(c));
                      const cache = contatosWhatsapp[c.id];
                      const nomeEhId = !cache?.nome || cache?.nome?.startsWith('Instagram ') || cache?.nome === c.cliente_telefone;
                      const nome = (!nomeEhId && cache?.nome) || c.cliente_nome || c.cliente_telefone;
                      const igUsername = isInstagram(c) ? (cache?.username || (cache?.observacoes?.startsWith('@') ? cache.observacoes.slice(1) : null)) : null;
                      const ultimaMsg = c.ultima_mensagem && c.ultima_mensagem !== 'Carregando histórico...' ? c.ultima_mensagem : '';
                      const hora = c.data_ultima_mensagem
                        ? format(new Date(c.data_ultima_mensagem), "HH:mm", { locale: ptBR })
                        : '';
                      const statusDotColor = estaEmEspera(c) ? '#f59e0b' : estaEmAtendimento(c) ? '#22c55e' : '#cbd5e1';
                      return (
                        <div
                          key={c.id}
                          className={classNames('jd-chat-card', conversaSelecionada?.id === c.id && 'selected')}
                          onClick={(e) => {
                            if (e.target.closest('.jd-chat-menu') || e.target.closest('[data-radix-dropdown-menu-trigger]')) return;
                            selecionarConversa(c);
                          }}
                        >
                          {/* Avatar */}
                          <div className="jd-chat-avatar">
                          <AvatarContato
                            contato={(() => {
                              const cache = contatosWhatsapp[c.id];
                              const base = { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url };
                              if (!cache) return base;
                              return { ...cache, foto_url: cache.foto_url || c.foto_url };
                            })()}
                            className="h-full w-full"
                          />
                            {c.bloqueado ? (
                              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-orange-500 flex items-center justify-center">
                                <Lock className="w-2 h-2 text-white" />
                              </span>
                            ) : (
                              <span style={{ backgroundColor: statusDotColor }} className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white" />
                            )}
                            {/* Badge de API no topo direito do avatar */}
                            {(() => {
                              const isIg = c.cliente_telefone?.startsWith('ig_') || c.instancia === 'INSTAGRAM' || c.tipo_conexao === 'instagram';
                              if (isIg) return null;
                              const isMeta = c.provider === 'whatsapp_meta' || c.canal_origem === 'meta' || c.tipo_conexao === 'meta_oficial' || c.instancia === 'META_OFICIAL';
                              if (!isMeta) return null;
                              return (
                                <span className="absolute top-0 right-0 h-4 w-4 rounded-full border border-white flex items-center justify-center" style={{ background: '#22c55e', fontSize: '7px', fontWeight: 800, color: 'white', lineHeight: 1 }} title="API Oficial Meta">M</span>
                              );
                            })()}
                          </div>

                          {/* Conteúdo */}
                          <div className="jd-chat-content">
                            <div className="jd-chat-top">
                              <span className="jd-chat-name">{nome}</span>
                              <span className="jd-chat-time">{hora}</span>
                            </div>
                            {igUsername && <span style={{fontSize:'11px',color:'#9333ea',fontWeight:500}}>@{igUsername}</span>}
                            {(() => {
                              const tagIds = contatosWhatsapp[c.id]?.tags_ids || [];
                              const tagsContato = tagsDB.filter(t => tagIds.includes(t.id));
                              if (tagsContato.length === 0) return null;
                              return (
                                <div className="flex gap-1 flex-wrap mb-1">
                                  {tagsContato.map(tag => (
                                    <span
                                      key={tag.id}
                                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold border"
                                      style={{ backgroundColor: tag.cor + '22', color: tag.cor, borderColor: tag.cor + '66' }}
                                    >
                                      {tag.nome}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                            {/* Etiqueta de atendimento */}
                            {(() => {
                              const nomeAtendente = c.responsavel_nome || c.usuario_responsavel_nome;
                              const atendenteAtivo = nomeAtendente && (
                                !c.responsavel_expira_em || atendenteDentroDoTempo(c)
                              );
                              if (c.status === 'encerrada') return (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full mb-0.5" style={{ background: '#f1f5f9', fontSize: '10px', color: '#64748b', fontWeight: 500 }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  Finalizada
                                </span>
                              );
                              if (atendenteAtivo) return (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full mb-0.5 w-fit" style={{ background: '#dcfce7', fontSize: '10px' }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                  <span style={{ color: '#16a34a', fontWeight: 600 }}>{nomeAtendente}</span>
                                  <span style={{ color: '#4ade80' }}>atendendo</span>
                                </span>
                              );
                              return null;
                            })()}
                            <div className="jd-chat-bottom">
                              <span className="jd-chat-message">{ultimaMsg}</span>
                              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                {mostrarBadge && conversaSelecionada?.id !== c.id && (
                                  <span className="jd-chat-badge">
                                    {naoLidas > 0 ? naoLidas : '!'}
                                  </span>
                                )}
                                {marcadasNaoLidasManual.has(c.id) && (
                                  <span className="jd-chat-badge" style={{ backgroundColor: '#22c55e' }}>
                                  </span>
                                )}
                                <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                   <button className="jd-chat-menu p-0.5 hover:bg-black/5 rounded">
                                     <MoreVertical className="h-4 w-4" />
                                   </button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuPortal>
                                 <DropdownMenuContent align="end" className="w-48 z-[9999]">
                                   <ConversaContextMenu
                                     conversa={c}
                                     isGrupo={isGrupo(c)}
                                     empresaId={empresaId}
                                     conversaSelecionada={conversaSelecionada}
                                     setConversaSelecionada={setConversaSelecionada}
                                     setMarcadasNaoLidasManual={setMarcadasNaoLidasManual}
                                     marcadasNaoLidasManual={marcadasNaoLidasManual}
                                     setNaoLidasPorConversa={setNaoLidasPorConversa}
                                     abrirSalvarCrm={abrirSalvarCrm}
                                     setContatoParaTags={setContatoParaTags}
                                     setTagsModalOpen={setTagsModalOpen}
                                     setTransferirModal={setTransferirModal}
                                     onAgendarMensagem={setAgendarMensagemModal}
                                     setFunilModalOpen={setFunilModalOpen}
                                     oportunidadeAtual={oportunidadeAtual}
                                     onCriarTarefa={(conv) => { setConversaTarefa(conv); setCriarTarefaOpen(true); }}
                                     onAgendarReuniao={setAgendarReuniaoModal}
                                     onAdicionarAoFunil={() => setFunilModalOpen(true)}
                                     />
                                   <DropdownMenuSeparator />
                                   <DropdownMenuItem
                                     className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                     onClick={async () => {
                                       if (confirm('Excluir esta conversa e todas as mensagens?')) {
                                         const msgsExcluir = await base44.entities.MensagemWhatsapp.filter({ conversa_id: c.id });
                                         for (const msg of msgsExcluir) await base44.entities.MensagemWhatsapp.delete(msg.id);
                                         await base44.entities.ConversaWhatsapp.delete(c.id);
                                         queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
                                         queryClient.removeQueries({ queryKey: ['mensagens-whatsapp', c.id] });
                                         if (conversaSelecionada?.id === c.id) setConversaSelecionada(null);
                                         toast.success('Conversa excluída');
                                       }
                                     }}
                                   >
                                     <Trash2 className="mr-2 h-3.5 w-3.5" />
                                     Excluir
                                   </DropdownMenuItem>
                                  </DropdownMenuContent>
                                  </DropdownMenuPortal>
                                  </DropdownMenu>
                                  {/* Botão menu mobile */}
                                  <button
                                    className="mobile-action-btn lg:hidden p-1.5 hover:bg-black/5 rounded ml-auto"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMobileActionSheet({ open: true, conversa: c });
                                    }}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                  </div>
                                  </div>
                                  </div>
                                  </div>
                                  );
                                  })
                  }
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coluna central - Chat + painel lead */}
          <Card className={`flex-col overflow-hidden rounded-none rounded-r-xl h-full lg:flex lg:flex-1 ${!mobileViewChat ? 'hidden lg:flex' : '!flex w-full'}`}>
            {conversaSelecionada ? (
              <>
                {/* Botão voltar mobile - integrado ao ChatHeader no mobile */}
                <div className="flex lg:hidden items-center gap-2 px-2 py-2 bg-[#10353C] text-white shrink-0 z-10">
                  <button onClick={() => { setMobileViewChat(false); setConversaSelecionada(prev => prev); }} className="p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 touch-manipulation">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
                  </button>
                  <span className="text-sm font-semibold">Conversas</span>
                </div>
                {/* Header do chat - fixo */}
                <ChatHeader
                conversaSelecionada={conversaSelecionada}
                contatosWhatsapp={contatosWhatsapp}
                empresaId={empresaId}
                user={user}
                infoLeadAberto={infoLeadAberto}
                setInfoLeadAberto={setInfoLeadAberto}
                setTransferirModal={setTransferirModal}
                abrirSalvarCrm={abrirSalvarCrm}
                setContatoParaTags={setContatoParaTags}
                setTagsModalOpen={setTagsModalOpen}
                setCriarTarefaOpen={setCriarTarefaOpen}
                refetchMensagens={refetchMensagens}
                queryClient={queryClient}
                setConversaSelecionada={setConversaSelecionada}
                onAgendarMensagem={setAgendarMensagemModal}
                setFunilModalOpen={setFunilModalOpen}
                oportunidadeAtual={oportunidadeAtual}
                tagsDB={tagsDB}
                onLigar={(via) => {
                  if (dapiChamadaAtivaVisivel) {
                    dapiCall.encerrar();
                  } else if (via === 'operadora') {
                    ligarViaOperadora();
                  } else if (via === 'whatsapp') {
                    ligarViaWhatsapp();
                  }
                }}
                sipStatus="registrado"
                chamadaAtiva={dapiChamadaAtivaVisivel ? { destino: conversaSelecionada?.cliente_telefone } : null}
                erroSip={erroSip}
                coachIAOpen={coachIAOpen}
                setCoachIAOpen={setCoachIAOpen}
                />
                {dapiChamadaAtivaVisivel ? (
                  <DapiCallBar
                    status={dapiCall.status}
                    erro={dapiCall.erro}
                    mutado={dapiCall.mutado}
                    via={dapiCall.via}
                    clienteNome={contatosWhatsapp[conversaSelecionada?.id]?.nome || conversaSelecionada?.cliente_nome}
                    onEncerrar={dapiCall.encerrar}
                    onMutar={dapiCall.alternarMudo}
                  />
                ) : (
                  <ChamadaAtivaBar chamadaAtiva={chamadaAtiva} onEncerrar={encerrarChamada} />
                )}

        {/* Mobile Bottom Navigation - apenas na lista de conversas (não quando conversa estiver aberta) */}
        {!conversaSelecionada && (
          <MobileBottomNav 
            filtroStatus={filtroStatus}
            setFiltroStatus={setFiltroStatus}
            contadores={contadores}
          />
        )}

        {/* Mobile Conversation Actions Sheet */}
        <MobileConversationActions
          open={mobileActionSheet.open}
          onOpenChange={(open) => setMobileActionSheet({ open, conversa: open ? mobileActionSheet.conversa : null })}
          conversa={mobileActionSheet.conversa}
          contatosWhatsapp={contatosWhatsapp}
          actions={[
            { id: 'salvar_crm', label: 'Salvar CRM', icon: User, color: 'blue', action: (c) => abrirSalvarCrm(c) },
            { id: 'tags', label: 'Tags', icon: Tag, color: 'purple', action: (c) => { setContatoParaTags(contatosWhatsapp[c.id] || c); setTagsModalOpen(true); } },
            { id: 'tarefa', label: 'Criar Tarefa', icon: ClipboardList, color: 'emerald', action: (c) => { setConversaTarefa(c); setCriarTarefaOpen(true); } },
            { id: 'funil', label: 'Funil', icon: TrendingUp, color: 'emerald', action: () => setFunilModalOpen(true) },
            { id: 'ligar', label: 'Ligar', icon: Phone, color: 'emerald', action: (c) => ligarParaContato(c.cliente_telefone) },
            { id: 'transferir', label: 'Transferir', icon: Users, color: 'slate', action: (c) => setTransferirModal(c) },
            { id: 'bloquear', label: 'Bloquear/Desbloquear', icon: Lock, color: 'slate', action: async (c) => { await base44.entities.ConversaWhatsapp.update(c.id, { bloqueado: !c.bloqueado }); toast.success('Status de bloqueio atualizado'); refetchConversas(); } },
            { id: 'excluir', label: 'Excluir', icon: Trash2, color: 'slate', danger: true, action: async (c) => { if (confirm('Excluir conversa?')) { const msgs = await base44.entities.MensagemWhatsapp.filter({ conversa_id: c.id }); for (const m of msgs) await base44.entities.MensagemWhatsapp.delete(m.id); await base44.entities.ConversaWhatsapp.delete(c.id); queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] }); if (conversaSelecionada?.id === c.id) setConversaSelecionada(null); toast.success('Conversa excluída'); } } },
          ]}
        />

                {/* Área principal: mensagens + painel lead lado a lado */}
                <div className="relative flex flex-1 overflow-hidden">
                  {/* Mensagens */}
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <ScrollArea ref={scrollAreaRef} className="flex-1 px-2 sm:px-6 pt-4" style={{
                      backgroundColor: '#F5F0E8',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' opacity='0.18'%3E%3Cg fill='none' stroke='%23a0896a' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'%3E%3C!-- envelope --%3E%3Crect x='8' y='12' width='20' height='14' rx='2'/%3E%3Cpath d='M8 14l10 8 10-8'/%3E%3C!-- chat bubble --%3E%3Crect x='45' y='8' width='22' height='15' rx='4'/%3E%3Cpath d='M50 23v5l5-5'/%3E%3C!-- heart --%3E%3Cpath d='M90 14c0-3 4-6 7-3s7 0 7 3c0 4-7 9-7 9s-7-5-7-9z'/%3E%3C!-- smiley --%3E%3Ccircle cx='140' cy='16' r='8'/%3E%3Ccircle cx='137' cy='14' r='1' fill='%23a0896a'/%3E%3Ccircle cx='143' cy='14' r='1' fill='%23a0896a'/%3E%3Cpath d='M137 18q3 3 6 0'/%3E%3C!-- star --%3E%3Cpolygon points='175,8 177,14 183,14 178,18 180,24 175,20 170,24 172,18 167,14 173,14'/%3E%3C!-- check --%3E%3Cpath d='M12 65l5 5 10-10'/%3E%3C!-- phone --%3E%3Crect x='50' y='52' width='14' height='22' rx='3'/%3E%3Cpath d='M55 70h4'/%3E%3C!-- camera --%3E%3Crect x='88' y='55' width='24' height='18' rx='3'/%3E%3Ccircle cx='100' cy='64' r='5'/%3E%3Cpath d='M96 55l2-4h4l2 4'/%3E%3C!-- bell --%3E%3Cpath d='M140 52c0-3 2-5 5-5s5 2 5 5v8h-10z'/%3E%3Cpath d='M138 60h14'/%3E%3Ccircle cx='145' cy='63' r='2'/%3E%3C!-- map pin --%3E%3Ccircle cx='175' cy='58' r='5'/%3E%3Cpath d='M175 63v10'/%3E%3C!-- envelope 2 --%3E%3Crect x='8' y='110' width='20' height='14' rx='2'/%3E%3Cpath d='M8 112l10 8 10-8'/%3E%3C!-- chat 2 --%3E%3Crect x='45' y='106' width='22' height='15' rx='4'/%3E%3Cpath d='M50 121v5l5-5'/%3E%3C!-- paper plane --%3E%3Cpath d='M90 108l30 10-18 5-5 15z'/%3E%3Cpath d='M102 123l8-5'/%3E%3C!-- smiley 2 --%3E%3Ccircle cx='140' cy='114' r='8'/%3E%3Ccircle cx='137' cy='112' r='1' fill='%23a0896a'/%3E%3Ccircle cx='143' cy='112' r='1' fill='%23a0896a'/%3E%3Cpath d='M137 116q3 3 6 0'/%3E%3C!-- lock --%3E%3Crect x='170' y='112' width='14' height='11' rx='2'/%3E%3Cpath d='M173 112v-3a4 4 0 018 0v3'/%3E%3Ccircle cx='177' cy='117' r='1.5' fill='%23a0896a'/%3E%3C!-- check 2 --%3E%3Cpath d='M12 163l5 5 10-10'/%3E%3C!-- envelope 3 --%3E%3Crect x='48' y='158' width='20' height='14' rx='2'/%3E%3Cpath d='M48 160l10 8 10-8'/%3E%3C!-- heart 2 --%3E%3Cpath d='M94 162c0-3 4-6 7-3s7 0 7 3c0 4-7 9-7 9s-7-5-7-9z'/%3E%3C!-- star 2 --%3E%3Cpolygon points='140,158 142,164 148,164 143,168 145,174 140,170 135,174 137,168 132,164 138,164'/%3E%3C!-- phone 2 --%3E%3Crect x='170' y='158' width='14' height='22' rx='3'/%3E%3Cpath d='M175 176h4'/%3E%3C/g%3E%3C/svg%3E")`,
                      backgroundSize: '200px 200px',
                    }}>
                      {loadingMensagens ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">Carregando mensagens...</p>
                          </div>
                        </div>
                      ) : mensagens.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                          <div className="text-center">
                            <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Nenhuma mensagem ainda</p>
                          </div>
                        </div>
                      ) : (
                        <ListaMensagens
                          mensagens={mensagens}
                          conversaSelecionada={conversaSelecionada}
                          isGrupo={isGrupo(conversaSelecionada)}
                          onResponder={setMensagemParaResponder}
                          user={user}
                          mensagensEndRef={mensagensEndRef}
                          onEditarReenviar={setEditorReenvioUrl}
                        />
                      )}
                    </ScrollArea>

                    {/* Input de mensagem */}
                    <ChatMessageFooter
                      conversaSelecionada={conversaSelecionada}
                      mensagemParaResponder={mensagemParaResponder}
                      setMensagemParaResponder={setMensagemParaResponder}
                      enviarMensagemMutation={enviarMensagemMutation}
                      user={user}
                      empresaId={empresaId}
                      selecionarConversa={selecionarConversa}
                      scriptExterno={scriptCoach}
                      coachIAOpen={coachIAOpen}
                      setCoachIAOpen={setCoachIAOpen}
                      nomeCliente={contatosWhatsapp[conversaSelecionada?.id]?.nome || conversaSelecionada?.cliente_nome}
                    />

                    {/* Botão Flutuante Coach IA */}
                    {!coachIAOpen && conversaSelecionada && (
                      <button
                        onClick={() => setCoachIAOpen(true)}
                        className="coach-float-btn"
                        title="Coach IA"
                      >
                        🤖
                        <span className="coach-float-badge" />
                      </button>
                    )}

                    <style>{`
                      .coach-float-btn {
                        position: absolute;
                        bottom: 130px;
                        right: 16px;
                        width: 42px; height: 42px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #7c3aed, #6d28d9);
                        color: white;
                        border: none;
                        cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 18px;
                        box-shadow: 0 4px 16px rgba(124,58,237,0.5);
                        transition: transform 0.2s, box-shadow 0.2s;
                        z-index: 5;
                        animation: coachPulse 2s infinite;
                      }
                      .coach-float-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(124,58,237,0.65); animation: none; }
                      @keyframes coachPulse {
                        0% { box-shadow: 0 0 0 0 rgba(124,58,237,0.5); }
                        70% { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
                        100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
                      }
                      .coach-float-badge {
                        position: absolute;
                        top: -2px; right: -2px;
                        width: 8px; height: 8px;
                        background: #ef4444;
                        border-radius: 50%;
                        border: 2px solid #09090b;
                      }
                    `}</style>
                  </div>

                  {/* Painel Informações do Lead */}
                  {infoLeadAberto && !coachIAOpen && (
                    <PainelInfoLead
                      conversaSelecionada={conversaSelecionada}
                      contatosWhatsapp={contatosWhatsapp}
                      setContatosWhatsapp={setContatosWhatsapp}
                      tagsDB={tagsDB}
                      chamadaAtiva={chamadaAtiva}
                      encerrarChamada={encerrarChamada}
                      ligarParaContato={ligarParaContato}
                      oportunidadeAtual={oportunidadeAtual}
                      setFunilModalOpen={setFunilModalOpen}
                      setTransferirModal={setTransferirModal}
                      setInfoLeadAberto={setInfoLeadAberto}
                    />
                  )}

                  {/* Painel Coach IA */}
                  <CoachIAPanel
                    conversaId={conversaSelecionada?.id}
                    mensagens={mensagens}
                    empresaId={empresaId}
                    visible={coachIAOpen}
                    onClose={() => setCoachIAOpen(false)}
                    onSendScript={(script) => {
                      if (script && conversaSelecionada) {
                        setScriptCoach(script);
                        // Reset após um ciclo para permitir reuso com mesmo texto
                        setTimeout(() => setScriptCoach(null), 500);
                        toast.success('Script inserido no campo de mensagem!');
                      }
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center bg-white">
                <div className="text-center">
                  <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                  <p className="text-lg font-semibold text-slate-900 mb-2">Selecione uma conversa</p>
                  <p className="text-sm text-slate-500">Escolha uma conversa da lista para começar</p>
                </div>
              </div>
            )}
          </Card>

        </div>

        {/* Mobile Conversation Actions Sheet */}
        <MobileConversationActions
          open={mobileActionSheet.open}
          onOpenChange={(open) => setMobileActionSheet({ open, conversa: open ? mobileActionSheet.conversa : null })}
          conversa={mobileActionSheet.conversa}
          contatosWhatsapp={contatosWhatsapp}
          actions={[
            { id: 'salvar_crm', label: 'Salvar CRM', icon: User, color: 'blue', action: (c) => abrirSalvarCrm(c) },
            { id: 'tags', label: 'Tags', icon: Tag, color: 'purple', action: (c) => { setContatoParaTags(contatosWhatsapp[c.id] || c); setTagsModalOpen(true); } },
            { id: 'tarefa', label: 'Tarefa', icon: ClipboardList, color: 'emerald', action: (c) => { setConversaTarefa(c); setCriarTarefaOpen(true); } },
            { id: 'funil', label: 'Funil', icon: TrendingUp, color: 'emerald', action: () => setFunilModalOpen(true) },
            { id: 'ligar', label: 'Ligar', icon: Phone, color: 'emerald', action: (c) => ligarParaContato(c.cliente_telefone) },
            { id: 'transferir', label: 'Transferir', icon: Users, color: 'slate', action: (c) => setTransferirModal(c) },
            { id: 'bloquear', label: 'Bloquear/Desbloquear', icon: Lock, color: 'slate', action: async (c) => { await base44.entities.ConversaWhatsapp.update(c.id, { bloqueado: !c.bloqueado }); toast.success('Status de bloqueio atualizado'); refetchConversas(); } },
            { id: 'excluir', label: 'Excluir', icon: Trash2, color: 'slate', danger: true, action: async (c) => { if (confirm('Excluir conversa?')) { const msgs = await base44.entities.MensagemWhatsapp.filter({ conversa_id: c.id }); for (const m of msgs) await base44.entities.MensagemWhatsapp.delete(m.id); await base44.entities.ConversaWhatsapp.delete(c.id); queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] }); if (conversaSelecionada?.id === c.id) setConversaSelecionada(null); toast.success('Conversa excluída'); } } },
          ]}
        />
      </div>
    </TooltipProvider>
  );
}
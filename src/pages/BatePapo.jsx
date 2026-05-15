import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
   Search,
   Filter,
   Plus,
   MoreVertical,
   PhoneCall,
   Star,
   Tag,
   UserPlus,
   ArrowRightLeft,
   BellOff,
   Pin,
   Check,
   Clock,
   Loader2,
   MessageCircle,
   AlignJustify,
   X,
   Trash2,
   RefreshCw,
   Contact,
   Pencil,
   Users,
   Image as ImageIcon,
   Bell,
   Lock,
   Unlock,
   Instagram,
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
import NovaConversaModal from '@/components/chat/NovaConversaModal';
import AvatarContato from '@/components/chat/AvatarContato';
import TarefaFormModal from '@/components/tarefas/TarefaFormModal';
import TransferirAtendimentoModal from '@/components/chat/TransferirAtendimentoModal';
import TagsModal from '@/components/chat/TagsModal';
import TagsGerenciamentoModal from '@/components/chat/TagsGerenciamentoModal';

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

const quickReplies = ["/boasvindas", "/consorcio", "/financiamento", "/documentos"];



export default function BatePapo() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);

  // Definir conversaSelecionadaId ANTES de qualquer hook que o use
  const conversaSelecionadaId = conversaSelecionada?.id || null;

  const selecionarConversa = async (conversa, forcarSync = true) => {
     setConversaSelecionada(conversa);
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

    // Invalida cache e força refetch IMEDIATO
    queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversa.id] });

    // Buscar foto: grupos via Evolution API, contatos via CRM
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
        // Contato: buscar do CRM via telefone
        const telefoneLimpo = conversa.cliente_telefone.replace(/\D/g, '');
        const variacoes = [telefoneLimpo];
        if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12) {
          variacoes.push(telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4));
        } else if (telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13) {
          variacoes.push(telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5));
        }

        for (const tel of variacoes) {
          const contatos = await base44.entities.ContatoWhatsapp.filter({
            empresa_id: empresaId,
            telefone: tel
          }, '-created_date', 1);

          if (contatos?.length > 0) {
            setContatosWhatsapp(prev => ({ ...prev, [conversa.id]: contatos[0] }));
            break;
          }
        }
      }
    } catch (e) {
      console.error('Erro ao carregar foto:', e);
    }
  };
  const [searchConversas, setSearchConversas] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todas');
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
        // Atualizar nome do contato existente
        contatoSalvo = await base44.entities.ContatoWhatsapp.update(contato.id, { nome: nomeContatoEdit });
        contatoSalvo = { ...contato, nome: nomeContatoEdit };
      } else {
        // Criar novo contato no CRM
        contatoSalvo = await base44.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          telefone: telefoneLimpo,
          nome: nomeContatoEdit,
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
  const [transferirModal, setTransferirModal] = useState(null); // conversa a transferir
  const [naoLidasPorConversa, setNaoLidasPorConversa] = useState({}); // { conversaId: count }
  const [marcadasNaoLidasManual, setMarcadasNaoLidasManual] = useState(new Set()); // IDs marcadas manualmente como não lido
  const [gruposBloqueadosOpen, setGruposBloqueadosOpen] = useState(false);
  const [gruposBloqueadosLista, setGruposBloqueadosLista] = useState([]);
  const [loadingGruposBloqueados, setLoadingGruposBloqueados] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [contatoParaTags, setContatoParaTags] = useState(null);
  const [gerenciamentoTagsOpen, setGerenciamentoTagsOpen] = useState(false);

  const abrirGruposBloqueados = async () => {
    setGruposBloqueadosOpen(true);
    setLoadingGruposBloqueados(true);
    try {
      const todos = await base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId, bloqueado: true }, '-updated_date', 200);
      setGruposBloqueadosLista(todos);
    } catch (e) {
      toast.error('Erro ao carregar grupos bloqueados');
    } finally {
      setLoadingGruposBloqueados(false);
    }
  };

  const handleTransferir = async (conversa, colaborador) => {
    try {
      // Atualiza responsável e marca status como encerrada (filtro Transferidos)
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

  const sincronizarChats = async () => {
    setSincronizando(true);
    try {
      const resp = await base44.functions.invoke('sincronizarTodosChats', {});
      const data = resp?.data;
      if (data?.ok) {
        toast.success(`Sincronizado: ${data.conversas_criadas} novas conversas`);
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
  const { data: colaboradoresTarefa = [] } = useQuery({
    queryKey: ['colaboradores-tarefa', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 200),
  });
  const { data: clientesTarefa = [] } = useQuery({
    queryKey: ['clientes-tarefa', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: () => base44.entities.Cliente.filter({ empresa_id: empresaId }, 'nome_completo', 500),
  });
  const { data: statusListTarefa = [] } = useQuery({
    queryKey: ['status-tarefa'],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: async () => {
      try { return await base44.entities.StatusTarefa.list('ordem', 100); }
      catch { return [{ slug: 'a_fazer', nome: 'A Fazer' }, { slug: 'em_andamento', nome: 'Em Andamento' }, { slug: 'concluido', nome: 'Concluído' }]; }
    },
  });
  const { data: tiposListTarefa = [] } = useQuery({
    queryKey: ['tipos-tarefa', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: async () => {
      try { return await base44.entities.TipoTarefa.filter({ empresa_id: empresaId }); }
      catch { return []; }
    },
  });

  const { data: conversas = [], refetch: refetchConversas } = useQuery({
    queryKey: ['conversas-whatsapp', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: async () => {
      if (!empresaId) return [];
      console.log(`📞 Buscando conversas para empresa: ${empresaId}`);
      const resp = await base44.functions.invoke('buscarConversasComContatos', { empresa_id: empresaId, limit: 10000 });
      const data = resp?.data?.conversas || [];
      console.log(`✅ Recebidas ${data.length} conversas`);
      
      // Atualizar cache de contatos
      const novoCache = {};
      data.forEach(conversa => {
        if (conversa.contato) {
          novoCache[conversa.id] = conversa.contato;
        }
      });
      setContatosWhatsapp(prev => ({ ...prev, ...novoCache }));
      
      const filtradas = data.filter(c => c.id && c.cliente_telefone);
      console.log(`🔍 Após filtro: ${filtradas.length} conversas válidas`);

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
        1000  // Reduzir limite para carregar mais rápido
      );
      console.log(`✅ Carregadas ${msgs.length} mensagens para conversa ${conversaSelecionadaId}`);
      const ordenadas = [...msgs].reverse();
      return ordenadas;
    },
    staleTime: 0,
    refetchInterval: 4000,  // Polling a cada 4 segundos
    placeholderData: (prev) => prev,
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
      const ultimaId = localStorage.getItem('ultimaConversaId');
      const ultimaConversa = ultimaId ? conversas.find(c => c.id === ultimaId) : null;
      selecionarConversa(ultimaConversa || conversas[0]);
    } else {
      const aindaExiste = conversas.find(c => c.id === conversaSelecionada.id);
      if (!aindaExiste) {
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

  // Polling de mensagens removido — o refetchInterval do useQuery já cuida disso



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

  // Subscription para updates de status de mensagens (ACKs/leitura)
  useEffect(() => {
    if (!empresaId) return;
    console.log(`🔌 Conectando subscription de status de mensagens...`);
    const unsub = base44.entities.MensagemWhatsapp.subscribe((event) => {
      if (event.type !== 'update') return;
      const msgData = event.data;
      if (!msgData?.id || !msgData?.conversa_id) return;
      // Atualizar a mensagem no cache local
      queryClient.setQueryData(['mensagens-whatsapp', msgData.conversa_id], (old = []) =>
        old.map(m => m.id === msgData.id ? msgData : m)
      );
      console.log(`✅ Status atualizado: ${msgData.id} → ${msgData.status}`);
    });
    return unsub;
  }, [empresaId]);

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

      // SEMPRE refetch mensagens da conversa aberta — não depender do conversa_id no payload
      if (conversaAtualId) {
        // Forçar refetch mesmo que os dados sejam "frescos"
        queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaAtualId], refetchType: 'all' });
        queryClient.refetchQueries({ queryKey: ['mensagens-whatsapp', conversaAtualId], type: 'active' });
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['mensagens-whatsapp', conversaAtualId], type: 'active' });
        }, 800);
        // Scroll para o final após refetch
        setTimeout(() => {
          if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTop = viewport.scrollHeight;
          }
        }, 1000);
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

        // Verificar se a conversa está encerrada e perguntar se quer reabrir
        const conversaEncerrada = conversasRef.current.find(
          c => c.id === msgData.conversa_id && c.status === 'encerrada'
        );
        if (conversaEncerrada) {
          const nomeContato = conversaEncerrada.cliente_nome || conversaEncerrada.cliente_telefone || 'Cliente';
          toast.message(`📩 Nova mensagem de ${nomeContato}`, {
            description: 'Esta conversa está finalizada. Deseja reabri-la?',
            duration: 15000,
            action: {
              label: 'Abrir conversa',
              onClick: async () => {
                // Reativar conversa
                const eid = empresaIdRef.current;
                queryClient.setQueryData(['conversas-whatsapp', eid], (old = []) =>
                  old.map(c => c.id === conversaEncerrada.id
                    ? { ...c, status: 'ativa', ultimo_remetente: 'cliente', responsavel_id: null, responsavel_expira_em: null }
                    : c
                  )
                );
                selecionarConversa({ ...conversaEncerrada, status: 'ativa' });
                base44.entities.ConversaWhatsapp.update(conversaEncerrada.id, {
                  status: 'ativa',
                  ultimo_remetente: 'cliente',
                  responsavel_id: null,
                  responsavel_expira_em: null,
                }).catch(() => {});
                toast.success('Conversa reaberta!');
              },
            },
          });
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

        console.log(`🔔 Notificando: ${nomeRemetente}`);
        toast.message(`💬 ${nomeRemetente}`, {
          description: textoMsg.length > 120 ? textoMsg.substring(0, 120) + '...' : textoMsg,
          duration: 6000,
          action: conversa ? { label: 'Abrir conversa', onClick: () => selecionarConversa(conversa) } : undefined,
        });

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
      return await base44.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: '',
        cliente_nome: nome,
        cliente_telefone: telefone,
        whatsapp_id: `conv_${Date.now()}`,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        tipo_conexao: 'empresa'
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
    mutationFn: async ({ texto, arquivo }) => {
      if (!texto?.trim() && !arquivo) {
        throw new Error('Mensagem ou arquivo obrigatório');
      }
      // Para grupos usar o whatsapp_id (JID @g.us), para individuais usar o telefone
      const destinatario = isGrupo(conversaSelecionada)
        ? conversaSelecionada.whatsapp_id
        : conversaSelecionada.cliente_telefone;
      const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversaSelecionada.id,
        mensagem_texto: texto,
        numero_cliente: destinatario,
        empresa_id: empresaId,
        arquivo: arquivo,
        forcar_api: (conversaSelecionada.tipo_conexao === 'meta_oficial' || conversaSelecionada.instancia === 'META_OFICIAL') ? 'meta_oficial' : 'evolution'
      });
      if (!resp?.data?.success) {
        throw new Error(resp?.data?.error || 'Erro ao enviar mensagem');
      }
      return resp.data;
    },
    onMutate: async ({ texto, arquivo }) => {
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

        // 2. Atualizar status da mensagem para "enviada" no cache LOCAL
        queryClient.setQueryData(['mensagens-whatsapp', conversaSelecionadaId], (old = []) =>
          old.map(m => m.id?.startsWith('temp_') ? { ...m, status: 'enviada' } : m)
        );

        // 3. Salvar no banco em background (sem bloquear a UI)
        base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
          ultima_mensagem: msgExibicao,
          data_ultima_mensagem: new Date().toISOString(),
          ultimo_remetente: 'vendedor',
          responsavel_id: user?.colaborador_id || user?.id || 'atendente',
          responsavel_nome: user?.nome_perfil || user?.full_name || user?.email || 'Atendente',
          responsavel_expira_em: expira,
        }).then(() => refetchConversas()).catch(() => {});
      }
      // Invalidar mensagens para refetch do status real após sucesso
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionadaId] });
      }, 500);
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

  // Ao abrir conversa, forçar refetch do histórico e scroll para fim
  React.useEffect(() => {
    if (!conversaSelecionada?.id) return;
    
    console.log(`🔄 Acionando refetch de mensagens para conversa: ${conversaSelecionada.id}`);
    
    // Invalidar query para forçar novo fetch
    queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id] });
    
    // Aguardar um pouco e refetch
    setTimeout(() => {
      refetchMensagens?.().catch(e => console.error('Erro no refetch:', e));
      // Scroll para fim após carregamento
      setTimeout(fazerScrollParaFim, 300);
    }, 100);
  }, [conversaSelecionada?.id, refetchMensagens, fazerScrollParaFim]);

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
  }), [conversas, isGrupo]);

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

  // Contadores por aba
  const contadores = {
    todas: conversasValidas.filter(c => !isGrupo(c) && c.status === 'ativa').length,
    espera: conversasValidas.filter(c => !isGrupo(c) && estaEmEsperaFiltro(c)).length,
    ativa: conversasValidas.filter(c => !isGrupo(c) && estaEmAtendimentoFiltro(c)).length,
    arquivada: conversasValidas.filter(c => !isGrupo(c) && c.status === 'arquivada').length,
    transferida: conversasValidas.filter(c => !isGrupo(c) && c.status === 'encerrada' && !!c.responsavel_id).length,
    meu: conversasValidas.filter(c => !isGrupo(c) && c.status === 'ativa' && atendenteDentroDoTempo(c) && c.responsavel_id === (user?.colaborador_id || user?.id)).length,
    grupos: conversas.filter(c => isGrupo(c) && c.bloqueado !== true && c.bloqueado !== 'true' && c.status !== 'encerrada').length,
    grupos_bloqueados: conversas.filter(c => isGrupo(c) && (c.bloqueado === true || c.bloqueado === 'true')).length,
  };

  // Debug temporário
  React.useEffect(() => {
    if (filtroStatus === 'grupos') {
      console.log('[GRUPOS DEBUG] Total conversas:', conversas.length);
      const grupos = conversas.filter(c => isGrupo(c));
      console.log('[GRUPOS DEBUG] Grupos detectados:', grupos.length);
      grupos.forEach(g => console.log('  grupo:', { id: g.id, nome: g.cliente_nome, telefone: g.cliente_telefone, whatsapp_id: g.whatsapp_id }));
      // Mostrar também as primeiras não-grupo para comparar
      const naoGrupos = conversas.filter(c => !isGrupo(c)).slice(0, 3);
      naoGrupos.forEach(g => console.log('  não-grupo:', { telefone: g.cliente_telefone, whatsapp_id: g.whatsapp_id }));
    }
  }, [filtroStatus, conversas]);

  React.useEffect(() => {
    if (filtroStatus === 'espera') {
      const ativas = conversasValidas.filter(c => !isGrupo(c) && c.status === 'ativa');
      const comCliente = ativas.filter(c => c.ultimo_remetente === 'cliente');
      const comNaoLidas = ativas.filter(c => naoLidasPorConversa[c.id] > 0);
      console.log('[ESPERA DEBUG] ativas:', ativas.length, 'ultimo_remetente=cliente:', comCliente.length, 'naoLidas>0:', comNaoLidas.length);
      if (comCliente.length > 0) console.log('[ESPERA DEBUG] exemplo:', comCliente[0]);
    }
  }, [filtroStatus, conversasValidas, naoLidasPorConversa]);

  const conversasFiltradas = conversas
    .filter(c => {
      if (!c || !c.id) return false;
      
      // Grupos podem ter apenas whatsapp_id, contatos precisam de um identificador
      const temIdentificador = c.cliente_telefone || c.whatsapp_id;
      if (!temIdentificador) return false;

      // Aplicar busca primeiro
      if (searchConversas) {
        const match = 
          (c.cliente_nome || '').toLowerCase().includes(searchConversas.toLowerCase()) ||
          (c.cliente_telefone || '').includes(searchConversas);
        if (!match) return false;
      }
      
      // Filtrar por status
        if (isGrupo(c)) {
          if (c.bloqueado === true || c.bloqueado === 'true') return filtroStatus === 'grupos_bloqueados';
          if (c.status === 'encerrada') return filtroStatus === 'encerrada';
          return filtroStatus === 'grupos';
        }
      
      if (filtroStatus === 'todas') return c.status === 'ativa'; // TODAS as conversas ATIVAS
      if (filtroStatus === 'espera') return estaEmEsperaFiltro(c);
      if (filtroStatus === 'ativa') return estaEmAtendimentoFiltro(c); // Vendedor respondeu OU sem remetente → Em Atendimento
      if (filtroStatus === 'arquivada') return c.status === 'arquivada';
      if (filtroStatus === 'transferida') return c.status === 'encerrada' && !!c.responsavel_id;
      if (filtroStatus === 'encerrada') return c.status === 'encerrada' && !c.responsavel_id;
      if (filtroStatus === 'grupos_bloqueados') return isGrupo(c) && c.bloqueado === true;
      if (filtroStatus === 'meu') return c.status === 'ativa' && atendenteDentroDoTempo(c) && c.responsavel_id === (user?.colaborador_id || user?.id);
      
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
      <div id="batepapo-root" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, display: 'flex', flexDirection: 'column', padding: '8px', boxSizing: 'border-box', backgroundColor: '#F0EBE0' }}>
        <style>{`
          @media (min-width: 1024px) { #batepapo-root { left: 18rem !important; }  }
          @media (max-width: 1023px) { #batepapo-root { top: 3.5rem !important; } }
          .jd-messenger-sidebar {
            width: 100%;
            max-width: 340px;
            min-width: 300px;
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
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
            height: 76px;
            min-height: 76px;
            max-height: 76px;
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
          onOpenChange={setCriarTarefaOpen}
          tarefa={null}
          onSave={async (data) => {
            try {
              await base44.entities.Tarefa.create({
                ...data,
                empresa_id: empresaId,
                cliente_telefone: data.cliente_telefone || conversaSelecionada?.cliente_telefone || '',
                cliente_nome: data.cliente_nome || conversaSelecionada?.cliente_nome || '',
              });
              toast.success('Tarefa criada com sucesso!');
              setCriarTarefaOpen(false);
            } catch (e) {
              toast.error('Erro ao criar tarefa: ' + e.message);
            }
          }}
          colaboradores={colaboradoresTarefa}
          clientes={clientesTarefa}
          statusList={statusListTarefa}
          templates={[]}
          tiposList={tiposListTarefa}
          currentUser={user}
        />

        {/* Modal Tags - Atribuir a Contato */}
        <TagsModal
          open={tagsModalOpen}
          onOpenChange={setTagsModalOpen}
          contato={contatoParaTags}
          empresaId={empresaId}
        />

        {/* Modal Gerenciar Tags */}
        <TagsGerenciamentoModal
          open={gerenciamentoTagsOpen}
          onOpenChange={setGerenciamentoTagsOpen}
          empresaId={empresaId}
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

        <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', overflow: 'hidden', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {/* Coluna esquerda - Conversas */}
          <Card className="jd-messenger-sidebar flex shrink-0 flex-col overflow-hidden rounded-none rounded-l-xl border-r-0 [&_[data-radix-scroll-area-scrollbar]]:hidden" style={{ width: '420px', maxWidth: '420px', minWidth: '380px', height: '100vh', boxSizing: 'border-box' }}>
            <CardHeader className="jd-messenger-top flex flex-row items-center justify-between gap-2 pb-2 px-4 py-3 flex-shrink-0">
              <p className="text-lg font-semibold">Conversas</p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setNovaConversaOpen(true)}>
                  <Plus className="h-5 w-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setGerenciamentoTagsOpen(true)}>
                      <Tag className="mr-2 h-4 w-4" />
                      Gerenciar Tags
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={async () => {
                        setSincronizando(true);
                        try {
                          const resp = await base44.functions.invoke('sincronizarFotosContatosAgressivo', { empresa_id: empresaId });
                          const data = resp?.data;
                          if (data?.ok) {
                            toast.success(`📸 ${data.fotos_atualizadas}/${data.total_contatos} fotos atualizadas`);
                            refetchConversas();
                          } else {
                            toast.error('Erro ao sincronizar fotos: ' + (data?.error || 'Desconhecido'));
                          }
                        } catch (e) {
                          toast.error('Erro: ' + e.message);
                        } finally {
                          setSincronizando(false);
                        }
                      }}
                      disabled={sincronizando}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Sincronizar fotos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={sincronizarChats} disabled={sincronizando}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sincronizar conversas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={sincronizarTodosContatosEvolution} disabled={sincronizando}>
                      <Users className="mr-2 h-4 w-4" />
                      Importar contatos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={sincronizarHistoricoTodasConversas} disabled={sincronizando}>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Sincronizar histórico
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={abrirGruposBloqueados}>
                      <Lock className="mr-2 h-4 w-4" />
                      Grupos Bloqueados
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={limparHistoricoCompleto} disabled={limpandoTudo} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpar histórico
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

              {/* Status badges com abas */}
              <div className="px-4 space-y-2">
                {/* Todos os filtros em grid uniforme */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button onClick={() => setFiltroStatus('todas')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'todas' ? 'bg-slate-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'todas' ? 'text-white' : 'text-slate-700'}`}>{conversasValidas.filter(c => !isGrupo(c) && c.status === 'ativa').length}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'todas' ? 'text-white' : 'text-slate-600'}`}>Todos</span>
                  </button>

                  <button onClick={() => setFiltroStatus('espera')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'espera' ? 'bg-red-500' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'espera' ? 'text-white' : 'text-red-500'}`}>{conversasValidas.filter(c => !isGrupo(c) && estaEmEsperaFiltro(c)).length}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'espera' ? 'text-white' : 'text-slate-600'}`}>Esperando</span>
                  </button>

                  <button onClick={() => setFiltroStatus('ativa')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'ativa' ? 'bg-slate-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'ativa' ? 'text-white' : 'text-slate-700'}`}>{conversasValidas.filter(c => !isGrupo(c) && estaEmAtendimentoFiltro(c)).length}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'ativa' ? 'text-white' : 'text-slate-600'}`}>Em Atend.</span>
                  </button>

                  <button onClick={() => setFiltroStatus('encerrada')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'encerrada' ? 'bg-slate-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'encerrada' ? 'text-white' : 'text-slate-700'}`}>{conversas.filter(c => c.status === 'encerrada' && !c.responsavel_id).length}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'encerrada' ? 'text-white' : 'text-slate-600'}`}>Finalizados</span>
                  </button>

                  <button onClick={() => setFiltroStatus('grupos')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'grupos' ? 'bg-emerald-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'grupos' ? 'text-white' : 'text-emerald-500'}`}>{conversas.filter(c => isGrupo(c) && c.bloqueado !== true && c.bloqueado !== 'true' && c.status !== 'encerrada').length}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'grupos' ? 'text-white' : 'text-slate-600'}`}>Grupos</span>
                  </button>

                  <button onClick={() => setFiltroStatus('meu')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'meu' ? 'bg-emerald-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'meu' ? 'text-white' : 'text-emerald-500'}`}>{conversasValidas.filter(c => !isGrupo(c) && c.status === 'ativa' && atendenteDentroDoTempo(c) && c.responsavel_id === (user?.colaborador_id || user?.id)).length}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'meu' ? 'text-white' : 'text-slate-600'}`}>Responsável</span>
                  </button>

                  <button onClick={() => setFiltroStatus('transferida')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'transferida' ? 'bg-purple-600' : 'bg-slate-100'}`}>
                    <span className={`text-sm font-bold ${filtroStatus === 'transferida' ? 'text-white' : 'text-purple-500'}`}>{conversasValidas.filter(c => !isGrupo(c) && c.status === 'encerrada' && !!c.responsavel_id).length}</span>
                    <span className={`text-[10px] font-medium ${filtroStatus === 'transferida' ? 'text-white' : 'text-slate-600'}`}>Transferidos</span>
                  </button>
                </div>
              </div>

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
                      const nome = contatosWhatsapp[c.id]?.nome || c.cliente_nome || c.cliente_telefone;
                      const ultimaMsg = c.ultima_mensagem && c.ultima_mensagem !== 'Carregando histórico...' ? c.ultima_mensagem : '';
                      const hora = c.data_ultima_mensagem
                        ? format(new Date(c.data_ultima_mensagem), "HH:mm", { locale: ptBR })
                        : '';
                      const statusDotColor = estaEmEspera(c) ? '#f59e0b' : estaEmAtendimento(c) ? '#22c55e' : '#cbd5e1';
                      return (
                        <div
                          key={c.id}
                          className={classNames('jd-chat-card', conversaSelecionada?.id === c.id && 'selected')}
                          onClick={() => selecionarConversa(c)}
                        >
                          {/* Avatar */}
                          <div className="jd-chat-avatar">
                           <AvatarContato
                             contato={isGrupo(c)
                               ? { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url }
                               : (contatosWhatsapp[c.id] || c.contato || { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url })
                             }
                             className="h-full w-full"
                           />
                            {c.bloqueado ? (
                              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-orange-500 flex items-center justify-center">
                                <Lock className="w-2 h-2 text-white" />
                              </span>
                            ) : (
                              <span style={{ backgroundColor: statusDotColor }} className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white" />
                            )}
                          </div>

                          {/* Conteúdo */}
                          <div className="jd-chat-content">
                            <div className="jd-chat-top">
                              <span className="jd-chat-name">{nome}</span>
                              <span className="jd-chat-time">{hora}</span>
                            </div>
                            {contatosWhatsapp[c.id]?.tags_ids && contatosWhatsapp[c.id].tags_ids.length > 0 && (
                              <div className="flex gap-1 flex-wrap mb-1">
                                {contatosWhatsapp[c.id].tags_ids.map(tagId => {
                                  // Buscar a tag nos contatos (se disponível)
                                  const contato = contatosWhatsapp[c.id];
                                  if (contato?.tags && Array.isArray(contato.tags)) {
                                    const tag = contato.tags.find(t => t.id === tagId);
                                    if (tag) {
                                      return (
                                        <span
                                          key={tagId}
                                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                                          style={{ backgroundColor: tag.cor }}
                                        >
                                          {tag.nome}
                                        </span>
                                      );
                                    }
                                  }
                                  return null;
                                })}
                              </div>
                            )}
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
          <Card className="flex flex-1 flex-col overflow-hidden rounded-none rounded-r-xl h-full">
            {conversaSelecionada ? (
              <>
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
                />

                {/* Área principal: mensagens + painel lead lado a lado */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Mensagens */}
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 pt-4" style={{
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
                        <div className="space-y-3 pb-4">
                          {mensagens.map((msg, idx) => {
                            const dataMsg = new Date(msg.data_envio || msg.created_date);
                            const dataMsgAnterior = idx > 0 ? new Date(mensagens[idx - 1].data_envio || mensagens[idx - 1].created_date) : null;
                            const mostrarSeparador = !dataMsgAnterior || !isSameDay(dataMsg, dataMsgAnterior);
                            let labelData = '';
                            if (mostrarSeparador) {
                              if (isToday(dataMsg)) labelData = 'Hoje';
                              else if (isYesterday(dataMsg)) labelData = 'Ontem';
                              else labelData = format(dataMsg, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
                            }
                            return (
                              <React.Fragment key={msg.id}>
                                {mostrarSeparador && (
                                  <div className="flex items-center gap-2 my-3">
                                    <div className="flex-1 h-px bg-slate-300/50" />
                                    <span className="text-[11px] text-slate-500 bg-white/70 backdrop-blur-sm px-2.5 py-0.5 rounded-full shadow-sm font-medium">
                                      {labelData}
                                    </span>
                                    <div className="flex-1 h-px bg-slate-300/50" />
                                  </div>
                                )}
                                <MensagemItem mensagem={msg} conversaId={conversaSelecionada?.id} isGrupo={isGrupo(conversaSelecionada)} onResponder={setMensagemParaResponder} />
                              </React.Fragment>
                            );
                          })}
                          <div ref={mensagensEndRef} />
                        </div>
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
                    />
                  </div>

                  {/* Painel Informações do Lead - dentro do mesmo Card */}
                  {infoLeadAberto && (
                    <div className="flex w-[260px] shrink-0 flex-col border-l overflow-hidden">
                      <div className="border-b bg-white px-3 py-2 shrink-0">
                        <p className="text-xs font-semibold">Informações do Lead</p>
                        <p className="text-[10px] text-slate-500">Detalhes e histórico</p>
                      </div>

                      <ScrollArea className="flex-1">
                        <div className="flex flex-col gap-3 px-3 pb-3 pt-2">
                          {/* Perfil */}
                          <div className="flex items-center gap-2">
                            <AvatarContato 
                               contato={contatosWhatsapp[conversaSelecionada?.id] || conversaSelecionada.contato || { nome: conversaSelecionada.cliente_nome, telefone: conversaSelecionada.cliente_telefone, foto_url: conversaSelecionada.foto_url }}
                               className="h-9 w-9"
                             />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold leading-tight truncate">{conversaSelecionada.cliente_telefone}</p>
                              <p className="text-[10px] text-slate-500 truncate">{contatosWhatsapp[conversaSelecionada?.id]?.nome || 'Sem nome'}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <Button variant="outline" size="sm" className="h-7 justify-center gap-1 rounded-md text-[10px] px-2" title="Ligar">
                              <PhoneCall className="h-3 w-3" />
                              <span className="hidden sm:inline">Ligar</span>
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 justify-center gap-1 rounded-md text-[10px] px-2" title="Favorito">
                              <Star className="h-3 w-3" />
                              <span className="hidden sm:inline">Favorito</span>
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 justify-center gap-1 rounded-md text-[10px] px-2" title="Proposta">
                              <Tag className="h-3 w-3" />
                              <span className="hidden sm:inline">Proposta</span>
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 justify-center gap-1 rounded-md text-[10px] px-2" onClick={() => setTransferirModal(conversaSelecionada)} title="Transferir">
                              <ArrowRightLeft className="h-3 w-3" />
                              <span className="hidden sm:inline">Transferir</span>
                            </Button>
                          </div>

                          <Separator />

                          {/* Tags */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold">Tags</span>
                              <span className="text-[9px] text-slate-400">{tagsDB.length} tag(s)</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {tagsDB.length === 0 ? (
                                <p className="text-[10px] text-slate-400">Nenhuma tag criada. Crie em Contatos CRM.</p>
                              ) : tagsDB.map((t) => {
                                const contatoAtual = contatosWhatsapp[conversaSelecionada?.id];
                                const ativa = (contatoAtual?.tags_ids || []).includes(t.id);
                                return (
                                  <button
                                    key={t.id}
                                    title={ativa ? 'Remover tag' : 'Adicionar tag'}
                                    onClick={async () => {
                                      if (!contatoAtual) return toast.error('Contato não encontrado');
                                      const atuais = contatoAtual.tags_ids || [];
                                      const novas = ativa ? atuais.filter(x => x !== t.id) : [...atuais, t.id];
                                      await base44.entities.ContatoWhatsapp.update(contatoAtual.id, { tags_ids: novas });
                                      setContatosWhatsapp(prev => ({
                                        ...prev,
                                        [conversaSelecionada.id]: { ...contatoAtual, tags_ids: novas }
                                      }));
                                      toast.success(ativa ? 'Tag removida' : 'Tag adicionada');
                                    }}
                                    className={classNames(
                                      'rounded-full px-1.5 py-0.5 text-[9px] font-medium border transition-all whitespace-nowrap',
                                      ativa ? 'border-slate-500 ring-1 ring-slate-400' : 'border-transparent opacity-60 hover:opacity-100'
                                    )}
                                    style={{ backgroundColor: t.cor + '33', color: t.cor }}
                                  >
                                    {ativa && '✓ '}{t.nome}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <Separator />

                          {/* Status */}
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold">Status</span>
                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[10px]">
                              <span className="capitalize">{conversaSelecionada.status}</span>
                              <Check className="h-3 w-3 text-emerald-500" />
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                    </div>
                  )}
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
      </div>
    </TooltipProvider>
  );
}
import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import { toast } from 'sonner';
import MensagemItem from '@/components/chat/MensagemItem';
import NovaConversaModal from '@/components/chat/NovaConversaModal';
import AvatarContato from '@/components/chat/AvatarContato';

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
    
    // Invalida cache e força refetch IMEDIATO
    queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversa.id] });
    
    // Sincronizar histórico — IMEDIATO se forcarSync
    if (conversa?.id && conversa?.cliente_telefone && empresaId && forcarSync) {
      console.log(`🔄 Sincronizando mensagens para ${conversa.cliente_telefone}...`);
      
      // Tentar importação direta ANTES de refetch
      base44.functions.invoke('importarMensagensConversa', {
        empresa_id: empresaId,
        telefone: conversa.cliente_telefone,
        conversa_id: conversa.id
      }).then(() => {
        console.log(`✅ Importação concluída`);
        queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversa.id] });
        setTimeout(() => refetchMensagens?.(), 100);
      }).catch(e => {
        console.warn('Falha importar:', e);
        // Fallback: sincronizar histórico completo
        base44.functions.invoke('sincronizarHistoricoAgressivo', {
          empresa_id: empresaId,
          conversa_id_especifico: conversa.id
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversa.id] });
          setTimeout(() => refetchMensagens?.(), 100);
        }).catch(() => {});
      });
    }
    
    // Carregar foto do contato
    if (!conversa?.cliente_telefone || !empresaId) return;
    try {
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
    } catch (e) {
      console.error('Erro ao carregar foto:', e);
    }
  };
  const [searchConversas, setSearchConversas] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todas');
  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [contatosWhatsapp, setContatosWhatsapp] = useState({});
  const [infoLeadAberto, setInfoLeadAberto] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
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

  const limparHistoricoCompleto = async () => {
    const confirmacao = window.confirm(
      `🔴 LIMPAR TUDO?\n\n${conversas.length} conversas + mensagens serão deletadas.\n\nClique OK para confirmar.`
    );
    if (!confirmacao) return;

    setLimpandoTudo(true);
    try {
      toast.message('🗑️ Limpando histórico...', { duration: 30000 });
      
      // 1. Apagar todas as mensagens
      const msgsFiltro = await base44.entities.MensagemWhatsapp.filter({}, '-created_date', 10000);
      for (const msg of msgsFiltro) {
        await base44.entities.MensagemWhatsapp.delete(msg.id).catch(() => {});
      }
      console.log(`✅ ${msgsFiltro.length} mensagens deletadas`);
      
      // 2. Apagar todas as conversas
      const convsFiltro = await base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 10000);
      for (const conv of convsFiltro) {
        await base44.entities.ConversaWhatsapp.delete(conv.id).catch(() => {});
      }
      console.log(`✅ ${convsFiltro.length} conversas deletadas`);
      
      toast.success(`✅ Histórico limpo! ${convsFiltro.length} conversas + ${msgsFiltro.length} mensagens deletadas`);
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

      // 1. Tentar empresa_id do usuário autenticado (funciona para todas as subcontas)
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
      const colabsInativos = await base44.entities.Colaborador.filter({ 
        user_id: me.id 
      }, '-created_date', 1);
      
      if (colabsInativos && colabsInativos.length > 0 && colabsInativos[0].empresa_id) {
        console.log(`⚠️ Colaborador inativo, mas usando empresa: ${colabsInativos[0].empresa_id}`);
        setEmpresaId(colabsInativos[0].empresa_id);
        return;
      }

      // 4. Super admin sem colaborador — buscar primeiro Colaborador com empresa_id
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        // Tentar qualquer Colaborador associado ao usuário (mesmo sem status ativo)
        const todosColabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date', 10);
        const colabComEmpresa = todosColabs.find(c => c.empresa_id);
        if (colabComEmpresa?.empresa_id) {
          console.log(`✅ Super admin: empresa via colaborador: ${colabComEmpresa.empresa_id}`);
          setEmpresaId(colabComEmpresa.empresa_id);
          return;
        }
        // Último fallback: JD Promotora
        const empId = '699696c2c9f5bffc2e67402b';
        console.log(`✅ Super admin sem empresa definida, usando fallback: ${empId}`);
        setEmpresaId(empId);
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

  const { data: conversas = [], refetch: refetchConversas } = useQuery({
    queryKey: ['conversas-whatsapp', empresaId],
    enabled: !!empresaId,
    staleTime: 30000,
    queryFn: async () => {
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
    refetchInterval: false,
    placeholderData: (prev) => prev,
  });

  const { data: mensagens = [], isLoading: loadingMensagens, refetch: refetchMensagens } = useQuery({
    queryKey: ['mensagens-whatsapp', conversaSelecionadaId],
    enabled: !!conversaSelecionadaId,
    queryFn: async () => {
      if (!conversaSelecionadaId) return [];
      try {
        const msgs = await base44.entities.MensagemWhatsapp.filter(
          { conversa_id: conversaSelecionadaId },
          '-data_envio',
          5000
        );
        console.log(`✅ Carregadas ${msgs.length} mensagens para conversa ${conversaSelecionadaId}`);
        const ordenadas = [...msgs].reverse();
        const naoLidas = ordenadas.filter(m => m.remetente === 'cliente' && m.status !== 'lida');
        if (naoLidas.length > 0) {
          await Promise.all(naoLidas.map(msg => 
            base44.entities.MensagemWhatsapp.update(msg.id, { status: 'lida' }).catch(() => {})
          ));
        }
        return ordenadas;
      } catch (e) {
        console.error('Erro ao carregar mensagens:', e);
        return [];
      }
    },
    staleTime: 0,
    refetchInterval: 1000,
    gcTime: 0
  });

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

  useEffect(() => {
    if (!empresaId) return;
    const unsub = base44.entities.ConversaWhatsapp.subscribe((event) => {
      console.log(`🔔 ConversaWhatsapp ${event.type}:`, event.id);
      if (['create', 'update'].includes(event.type)) {
        refetchConversasRef.current?.().catch(e => console.error('Erro ao refetch:', e));
      }
    });
    return unsub;
  }, [empresaId]);

  // Polling de mensagens — cada 2s para evitar rate limit
  useEffect(() => {
    if (!empresaId || !conversaSelecionadaId || !refetchMensagens) return;
    const interval = setInterval(() => {
      if (!document.hidden) refetchMensagens().catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [empresaId, conversaSelecionadaId, refetchMensagens]);



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
  React.useEffect(() => { conversaSelecionadaIdRef.current = conversaSelecionadaId; }, [conversaSelecionadaId]);
  React.useEffect(() => { conversasRef.current = conversas; }, [conversas]);

  useEffect(() => {
    if (!empresaId || !refetchConversas) return;
    console.log(`🔌 Conectando subscription de mensagens...`);
    const unsub = base44.entities.MensagemWhatsapp.subscribe((event) => {
      console.log(`📨 Event recebido:`, { type: event.type, conversa_id: event.data?.conversa_id });
      if (event.type !== 'create') return;

      const msgData = event.data;
      const conversaAtualId = conversaSelecionadaIdRef.current;

      console.log(`🔄 Nova mensagem: ${msgData?.id} para conversa ${msgData?.conversa_id}, conversa aberta: ${conversaAtualId}`);

      // Sempre refetch conversas para atualizar última mensagem
      refetchConversas();

      // SEMPRE refetch mensagens da conversa aberta — não depender do conversa_id no payload
      if (conversaAtualId) {
        queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaAtualId] });
        refetchMensagens?.();
        setTimeout(() => refetchMensagens?.(), 500);
        // Scroll para o final após refetch
        setTimeout(() => {
          if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTop = viewport.scrollHeight;
          }
        }, 600);
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
        arquivo: arquivo
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
        await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
          ultima_mensagem: msgExibicao,
          data_ultima_mensagem: new Date().toISOString()
        });
      }
      // Invalidar mensagens imediatamente para refetch da mensagem confirmada
      await queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionadaId] });
      // E atualizar conversas
      await queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      toast.success('Mensagem enviada');
    }
  });

  const scrollAreaRef = React.useRef(null);

  React.useEffect(() => {
    if (!mensagens.length) return;
    // Rola o viewport interno do ScrollArea até o fim
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [mensagens]);

  // Ao abrir conversa, forçar refetch do histórico
  React.useEffect(() => {
    if (!conversaSelecionada?.id) return;
    
    console.log(`🔄 Acionando refetch de mensagens para conversa: ${conversaSelecionada.id}`);
    
    // Invalidar query para forçar novo fetch
    queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id] });
    
    // Aguardar um pouco e refetch
    setTimeout(() => {
      refetchMensagens?.().catch(e => console.error('Erro no refetch:', e));
    }, 100);
  }, [conversaSelecionada?.id, refetchMensagens]);

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
    const tel = (c.cliente_telefone || '').replace(/\D/g, '');
    const wid = (c.whatsapp_id || '').toLowerCase();
    return wid.includes('@g.us') || tel.includes('@g.us') || wid.endsWith('-') || tel.length > 13;
  };

  // Conversas válidas — filtra apenas grupos e LID
  const conversasValidas = conversas.filter(c => {
    if (!c || !c.id || !c.cliente_telefone) return false;
    
    const tel = (c.cliente_telefone || '').replace(/\D/g, '');
    
    // ❌ Excluir APENAS números com ID de grupo/broadcast (terminam em @ ou contêm @g.us)
    const isGrupoOuBroadcast = c.cliente_telefone?.includes('@g.us') || 
                               c.cliente_telefone?.includes('@broadcast') ||
                               c.cliente_telefone?.includes('@lid');
    
    if (isGrupoOuBroadcast) return false;
    
    // ❌ Excluir LID formato texto
    if (tel.startsWith('lid_')) return false;
    
    // ✅ Incluir tudo com telefone válido (8+ dígitos)
    return tel.length >= 8;
  });
  
  console.log(`✅ CONVERSAS VÁLIDAS: ${conversasValidas.length} de ${conversas.length}`);

  // Contadores por aba
  const conversasSemHistorico = conversasValidas.filter(c => !c.ultima_mensagem || !c.ultima_mensagem.trim());
  
  const contadores = {
    todas: conversasValidas.filter(c => !isGrupo(c)).length,
    ativa: conversasValidas.filter(c => !isGrupo(c) && c.status === 'ativa').length,
    arquivada: conversasValidas.filter(c => !isGrupo(c) && c.status === 'arquivada').length,
    transferida: conversasValidas.filter(c => !isGrupo(c) && c.status === 'encerrada').length,
    meu: conversasValidas.filter(c => !isGrupo(c) && c.usuario_responsavel_id === user?.colaborador_id).length,
    grupos: conversasValidas.filter(c => isGrupo(c)).length,
  };

  const conversasFiltradas = conversasValidas
    .filter(c => {
      // 1️⃣ Filtro por busca
      if (searchConversas) {
        const match = 
          (c.cliente_nome || '').toLowerCase().includes(searchConversas.toLowerCase()) ||
          (c.cliente_telefone || '').includes(searchConversas);
        if (!match) return false;
      }
      
      // 2️⃣ Filtro por status
      if (filtroStatus === 'grupos') {
        return isGrupo(c);
      } else if (filtroStatus === 'todas') {
        return !isGrupo(c);
      } else if (filtroStatus === 'ativa') {
        return !isGrupo(c) && c.status === 'ativa';
      } else if (filtroStatus === 'arquivada') {
        return !isGrupo(c) && c.status === 'arquivada';
      } else if (filtroStatus === 'transferida') {
        return !isGrupo(c) && c.status === 'encerrada';
      } else if (filtroStatus === 'meu') {
        return !isGrupo(c) && c.usuario_responsavel_id === user?.colaborador_id;
      }
      
      return true;
    })
    .sort((a, b) => 
      new Date(b.data_ultima_mensagem || 0) - new Date(a.data_ultima_mensagem || 0)
    );
  
  console.log(`✅ Exibindo ${conversasFiltradas.length} conversas (filtro: ${filtroStatus})`);

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-100 px-4 py-4">
        <NovaConversaModal
          open={novaConversaOpen}
          onOpenChange={setNovaConversaOpen}
          onCriar={(dados) => criarConversaMutation.mutate(dados)}
          isLoading={criarConversaMutation.isPending}
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

        <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl gap-3">
          {/* Coluna esquerda - Conversas */}
          <Card className="flex w-[320px] flex-col overflow-hidden [&_[data-radix-scroll-area-thumb]]:bg-slate-300 [&_[data-radix-scroll-area-thumb]]:rounded-full">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-xs font-semibold text-white shadow-sm">
                  JD
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">JD Messenger</p>
                  <p className="text-[11px] text-slate-500">Central de conversas</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {/* Consolidar duplicadas */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full border-slate-200 flex-shrink-0"
                      onClick={async () => {
                        setCorrigindo(true);
                        try {
                          const resp = await base44.functions.invoke('consolidarConversasDuplicadas', { empresa_id: empresaId });
                          if (resp?.data?.ok) { toast.success(resp.data.mensagem); refetchConversas(); }
                        } catch (e) { toast.error('Erro: ' + e.message); } finally { setCorrigindo(false); }
                      }}
                      disabled={corrigindo}>
                      {corrigindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-orange-500" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Consolidar duplicadas</p></TooltipContent>
                </Tooltip>

                {/* Importar todos contatos */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full border-slate-200 flex-shrink-0"
                      onClick={sincronizarTodosContatosEvolution} disabled={sincronizando}>
                      {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5 text-green-600" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Importar todos contatos</p></TooltipContent>
                </Tooltip>

                {/* Sincronizar histórico completo */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full border-slate-200 flex-shrink-0"
                      onClick={sincronizarHistoricoTodasConversas}
                      disabled={sincronizando}>
                      {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 text-purple-600" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>🔄 Sincronizar histórico TODAS conversas</p></TooltipContent>
                </Tooltip>

                {/* Sincronizar fotos */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full border-slate-200 flex-shrink-0"
                      onClick={async () => {
                        setSincronizando(true);
                        try {
                          const resp = await base44.functions.invoke('sincronizarFotosContatos', { empresa_id: empresaId });
                          if (resp?.data?.ok) { toast.success(`✅ ${resp.data.fotosAtualizadas}/${resp.data.totalContatos} fotos sincronizadas`); refetchConversas(); }
                          else toast.error('Erro ao sincronizar fotos');
                        } catch (e) { toast.error('Erro: ' + e.message); } finally { setSincronizando(false); }
                      }}
                      disabled={sincronizando}>
                      {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 text-blue-600" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Sincronizar fotos</p></TooltipContent>
                </Tooltip>

                {/* Refresh conversas */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full border-slate-200 flex-shrink-0"
                      onClick={sincronizarChats} disabled={sincronizando}>
                      <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Sincronizar conversas</p></TooltipContent>
                </Tooltip>

                {/* 🔴 Limpar histórico */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="destructive"
                      className="h-8 w-8 rounded-full flex-shrink-0"
                      onClick={limparHistoricoCompleto}
                      disabled={limpandoTudo || sincronizando}>
                      {limpandoTudo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-red-700 text-white"><p>🔴 Limpar histórico completo</p></TooltipContent>
                </Tooltip>

                {/* Novo */}
                <Button size="default" className="gap-1.5 rounded-full px-3 flex-shrink-0" onClick={() => setNovaConversaOpen(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-semibold">Novo</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-3 pt-0 overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    className="h-9 rounded-full bg-slate-50 pl-8 text-xs"
                    placeholder="Buscar por nome, telefone..."
                    value={searchConversas}
                    onChange={(e) => setSearchConversas(e.target.value)}
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 rounded-full border-slate-200"
                    >
                      <Filter className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Filtrar conversas</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <Tabs value={filtroStatus} onValueChange={setFiltroStatus} className="w-full">
                <TabsList className="grid grid-cols-3 w-full rounded-xl bg-slate-100 p-0.5 h-auto gap-0.5">
                  {[
                    { value: 'todas', label: 'Todos' },
                    { value: 'ativa', label: 'Atendimento' },
                    { value: 'arquivada', label: 'Finalizados' },
                    { value: 'transferida', label: 'Transferidos' },
                    { value: 'meu', label: 'Meu Atend.' },
                  ].map(tab => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="rounded-lg text-xs px-2 py-1.5 gap-1 data-[state=active]:bg-white data-[state=active]:text-slate-900 whitespace-nowrap"
                    >
                      {tab.label}
                      {contadores[tab.value] > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-sky-500 text-white text-[9px] font-bold leading-none px-1 py-0.5 min-w-[14px]">
                          {contadores[tab.value]}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <ScrollArea className="mt-1 flex-1 w-full">
                <div className="space-y-1 pb-4 pr-4">
                  {conversasFiltradas.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-400">
                      <MessageCircle className="w-8 h-8 opacity-40" />
                    </div>
                  ) : (
                    conversasFiltradas.map((c) => (
                      <div
                        key={c.id}
                        className={classNames(
                          "flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 text-left text-xs transition cursor-pointer",
                          conversaSelecionada?.id === c.id
                            ? "bg-sky-50 ring-1 ring-sky-100"
                            : "hover:bg-slate-50"
                        )}
                        onClick={() => selecionarConversa(c)}
                      >
                        <AvatarContato 
                           contato={contatosWhatsapp[c.id] || c.contato || { nome: c.cliente_nome, telefone: c.cliente_telefone }}
                           className="h-10 w-10 flex-shrink-0"
                         />

                        <div className="flex flex-1 flex-col min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-sm font-semibold text-slate-900 flex items-center gap-1">
                              {isGrupo(c) && <Users className="w-3 h-3 text-sky-500 flex-shrink-0" />}
                              {c.cliente_telefone}
                            </p>
                            {c.data_ultima_mensagem && (
                              <p className="whitespace-nowrap text-[11px] text-slate-400 flex-shrink-0">
                                {new Date(c.data_ultima_mensagem).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          <p className="line-clamp-1 text-xs text-slate-500 mt-0.5">
                            {c.ultima_mensagem && c.ultima_mensagem !== 'Carregando histórico...' ? c.ultima_mensagem : ''}
                          </p>
                        </div>

                        <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button 
                                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => abrirSalvarCrm(c)}>
                                <Contact className="mr-2 h-3.5 w-3.5" />
                                {contatosWhatsapp[c.id]?.id ? 'Editar nome no CRM' : 'Salvar no CRM'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => abrirSalvarCrm(c)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Alterar nome do contato
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.success('Conversa atribuída para você')}>
                                <Tag className="mr-2 h-3.5 w-3.5" />
                                Adicionar tag
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.info('Criar tarefa em desenvolvimento')}>
                                <Clock className="mr-2 h-3.5 w-3.5" />
                                Criar tarefa
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.success('Adicionado aos favoritos')}>
                                <Star className="mr-2 h-3.5 w-3.5" />
                                Marcar como favorito
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={async () => {
                                  if (confirm('Excluir esta conversa e todas as mensagens?')) {
                                    const mensagensParaExcluir = await base44.entities.MensagemWhatsapp.filter({ conversa_id: c.id });
                                    for (const msg of mensagensParaExcluir) {
                                      await base44.entities.MensagemWhatsapp.delete(msg.id);
                                    }
                                    await base44.entities.ConversaWhatsapp.delete(c.id);
                                    queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
                                    queryClient.removeQueries({ queryKey: ['mensagens-whatsapp', c.id] });
                                    if (conversaSelecionada?.id === c.id) setConversaSelecionada(null);
                                    toast.success('Conversa excluída');
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Excluir conversa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Coluna central - Chat + painel lead */}
          <Card className="flex flex-1 flex-col overflow-hidden">
            {conversaSelecionada ? (
              <>
                {/* Header do chat - fixo */}
                <div className="flex flex-row items-center justify-between gap-4 border-b bg-white px-5 py-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <AvatarContato 
                         contato={contatosWhatsapp[conversaSelecionada?.id] || conversaSelecionada.contato || { nome: conversaSelecionada.cliente_nome, telefone: conversaSelecionada.cliente_telefone }}
                         className="h-11 w-11"
                       />
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{conversaSelecionada.cliente_telefone || conversaSelecionada.cliente_nome}</p>
                      <p className="text-[11px] text-slate-500">{conversaSelecionada.cliente_telefone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="gap-1.5 rounded-md border-slate-200 text-xs font-medium text-blue-600 hover:text-blue-700 hover:border-blue-300"
                          onClick={async () => {
                            console.log(`🔄 Sincronizando mensagens para ${conversaSelecionada.cliente_telefone}...`);
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
                          <RefreshCw className="h-3.5 w-3.5" />
                          Carregar Mensagens
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Importar histórico completo do WhatsApp</TooltipContent>
                    </Tooltip>

                    <Button variant="outline" size="sm" className="gap-1.5 rounded-md border-slate-200 text-xs font-medium">
                      <Tag className="h-3.5 w-3.5" />
                      Criar Proposta
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-md border-slate-200 text-xs font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      Criar Tarefa
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-md border-slate-200 text-xs font-medium text-red-600 hover:text-red-700 hover:border-red-300" onClick={async () => {
                                      try {
                                        await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, { status: 'arquivada' });
                                      } catch (_) {}
                                      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
                                      setConversaSelecionada(null);
                                      toast.success('Conversa finalizada');
                                    }}>
                                      <Check className="h-3.5 w-3.5" />
                                      Finalizar Conversa
                                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-md border-slate-200">
                      <ArrowRightLeft className="h-4 w-4 text-slate-500" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-md border-slate-200">
                          <MoreVertical className="h-4 w-4 text-slate-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => abrirSalvarCrm(conversaSelecionada)}>
                            <Contact className="mr-2 h-3.5 w-3.5" />
                            {contatosWhatsapp[conversaSelecionada?.id]?.id ? 'Editar contato no CRM' : 'Salvar contato no CRM'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => abrirSalvarCrm(conversaSelecionada)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Alterar nome do contato
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => {
                            await base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, { status: 'ativa' });
                            queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
                            toast.success('Conversa reaberta');
                          }}>
                            <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                            Reabrir conversa
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info('Em desenvolvimento')}>
                            <UserPlus className="mr-2 h-3.5 w-3.5" />
                            Atribuir responsável
                          </DropdownMenuItem>
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

                {/* Área principal: mensagens + painel lead lado a lado */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Mensagens */}
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 pt-4">
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
                          {mensagens.map((msg) => (
                            <MensagemItem key={msg.id} mensagem={msg} conversaId={conversaSelecionada?.id} />
                          ))}
                          <div ref={mensagensEndRef} />
                        </div>
                      )}
                    </ScrollArea>

                    {/* Input de mensagem */}
                    <EnviarMensagemForm
                      onEnviar={async ({ texto, arquivo }) => {
                        await enviarMensagemMutation.mutateAsync({ texto, arquivo });
                      }}
                      isLoading={enviarMensagemMutation.isPending}
                      nomeUsuario={user?.full_name || ''}
                    />
                  </div>

                  {/* Painel Informações do Lead - dentro do mesmo Card */}
                  {infoLeadAberto && (
                    <div className="flex w-[260px] shrink-0 flex-col border-l overflow-hidden">
                      <div className="border-b bg-white px-4 py-3 shrink-0">
                        <p className="text-sm font-semibold">Informações do Lead</p>
                        <p className="text-[11px] text-slate-500">Detalhes e histórico</p>
                      </div>

                      <ScrollArea className="flex-1">
                        <div className="flex flex-col gap-4 px-4 pb-4 pt-3">
                          {/* Perfil */}
                          <div className="flex items-center gap-3">
                            <AvatarContato 
                               contato={contatosWhatsapp[conversaSelecionada?.id] || conversaSelecionada.contato || { nome: conversaSelecionada.cliente_nome, telefone: conversaSelecionada.cliente_telefone }}
                               className="h-10 w-10"
                             />
                            <div className="flex-1">
                              <p className="text-sm font-semibold leading-tight">{conversaSelecionada.cliente_telefone || conversaSelecionada.cliente_nome}</p>
                              <p className="text-[11px] text-slate-500">{conversaSelecionada.cliente_telefone}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" className="h-8 justify-start gap-1 rounded-lg text-[11px]">
                              <PhoneCall className="h-3.5 w-3.5" />
                              Ligar
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 justify-start gap-1 rounded-lg text-[11px]">
                              <Star className="h-3.5 w-3.5" />
                              Favorito
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 justify-start gap-1 rounded-lg text-[11px]">
                              <Tag className="h-3.5 w-3.5" />
                              Proposta
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 justify-start gap-1 rounded-lg text-[11px]">
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              Transferir
                            </Button>
                          </div>

                          <Separator />

                          {/* Tags */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">Tags</span>
                              <span className="text-[10px] text-slate-400">{tagsDB.length} tag(s)</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {tagsDB.length === 0 ? (
                                <p className="text-[11px] text-slate-400">Nenhuma tag criada. Crie em Contatos CRM.</p>
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
                                      'rounded-full px-2 py-0.5 text-[10px] font-medium border transition-all',
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
                          <div className="space-y-2">
                            <span className="text-xs font-semibold">Status</span>
                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
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
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
} from "lucide-react";
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import { toast } from 'sonner';
import MensagemItem from '@/components/chat/MensagemItem';
import NovaConversaModal from '@/components/chat/NovaConversaModal';

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

const quickReplies = ["/boasvindas", "/consorcio", "/financiamento", "/documentos"];

const tags = [
  { label: "Quente", color: "bg-rose-100 text-rose-700" },
  { label: "Financiamento", color: "bg-amber-100 text-amber-800" },
  { label: "Retornar", color: "bg-sky-100 text-sky-800" },
  { label: "Cota Imóvel", color: "bg-emerald-100 text-emerald-800" },
];

export default function BatePapo() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);

  const selecionarConversa = (conversa) => {
    setConversaSelecionada(conversa);
    localStorage.setItem('ultimaConversaId', conversa.id);
  };
  const [searchConversas, setSearchConversas] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todas');
  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [fotosContatos, setFotosContatos] = useState({});
  const [infoLeadAberto, setInfoLeadAberto] = useState(true);
  const queryClient = useQueryClient();
  const mensagensEndRef = React.useRef(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        const empId = '699696c2c9f5bffc2e67402b';
        setEmpresaId(empId);
      } else {
        const colabs = await base44.entities.Colaborador.filter({ 
          user_id: me.id, 
          status: 'ativo' 
        });
        if (colabs.length > 0) {
          setEmpresaId(colabs[0].empresa_id);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  const { data: conversas = [] } = useQuery({
    queryKey: ['conversas-whatsapp', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const result = await base44.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId },
        '-data_ultima_mensagem'
      );
      return (result || []).filter(c => c.id && c.cliente_telefone);
    },
    refetchInterval: 3000,
    onSuccess: (data) => {
      if (data.length > 0 && !conversaSelecionada) {
        const ultimaId = localStorage.getItem('ultimaConversaId');
        const ultimaConversa = ultimaId ? data.find(c => c.id === ultimaId) : null;
        setConversaSelecionada(ultimaConversa || data[0]);
      }
    }
  });

  const conversaSelecionadaId = conversaSelecionada?.id || null;

  const { data: mensagens = [], isLoading: loadingMensagens } = useQuery({
    queryKey: ['mensagens-whatsapp', conversaSelecionadaId],
    enabled: !!conversaSelecionadaId,
    queryFn: async () => {
      const resp = await base44.functions.invoke('buscarMensagensConversa', { conversa_id: conversaSelecionadaId });
      const msgs = resp?.data?.mensagens || [];

      // Marcar mensagens do cliente como lidas
      const naoLidas = msgs.filter(m => m.remetente === 'cliente' && m.status !== 'lida');
      for (const msg of naoLidas) {
        base44.entities.MensagemWhatsapp.update(msg.id, { status: 'lida' }).catch(() => {});
      }

      return msgs;
    },
    refetchInterval: 3000,
  });

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
        data_ultima_mensagem: new Date().toISOString()
      });
    },
    onSuccess: (conversa) => {
    queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
    selecionarConversa(conversa);
    setNovaConversaOpen(false);
      toast.success('Conversa criada! Envie a primeira mensagem.');
    },
    onError: (error) => {
      toast.error('Erro ao criar conversa: ' + error.message);
    }
  });

  const enviarMensagemMutation = useMutation({
    mutationFn: async ({ texto }) => {
      if (texto) {
        const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
          conversa_id: conversaSelecionada.id,
          mensagem_texto: texto,
          numero_cliente: conversaSelecionada.cliente_telefone,
          empresa_id: empresaId
        });
        if (!resp?.data?.success) {
          throw new Error(resp?.data?.error || 'Erro ao enviar mensagem');
        }
        return resp.data;
      }
    },
    onMutate: async ({ texto }) => {
      // Mensagem otimista — aparece imediatamente
      const queryKey = ['mensagens-whatsapp', conversaSelecionadaId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old = []) => [
        ...old,
        {
          id: `temp_${Date.now()}`,
          conversa_id: conversaSelecionadaId,
          remetente: 'vendedor',
          tipo_conteudo: 'texto',
          texto,
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
      toast.error('Erro ao enviar: ' + error.message);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp'] });
      await queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
    }
  });

  React.useEffect(() => {
    if (mensagensEndRef.current) {
      mensagensEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens]);

  const conversasFiltradas = conversas.filter(c => {
    const matchSearch = (c.cliente_nome || '').toLowerCase().includes(searchConversas.toLowerCase()) ||
      (c.cliente_telefone || '').includes(searchConversas);
    const matchStatus = filtroStatus === 'todas' || c.status === filtroStatus;
    return matchSearch && matchStatus;
  });

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

        <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl gap-3">
          {/* Coluna esquerda - Conversas */}
          <Card className="flex w-[320px] flex-col overflow-hidden">
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
              <Button 
                size="sm" 
                className="gap-1 rounded-full px-3"
                onClick={() => setNovaConversaOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span className="text-xs font-medium">Novo</span>
              </Button>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-3 pt-0">
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
                <TabsList className="grid w-full grid-cols-3 rounded-full bg-slate-100 p-0.5">
                  <TabsTrigger
                    value="todas"
                    className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900"
                  >
                    Entrada
                  </TabsTrigger>
                  <TabsTrigger
                    value="ativa"
                    className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900"
                  >
                    Em at.
                  </TabsTrigger>
                  <TabsTrigger
                    value="arquivada"
                    className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900"
                  >
                    Finaliz.
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <ScrollArea className="mt-1 h-full">
                <div className="space-y-1 pb-4">
                  {conversasFiltradas.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-400">
                      <MessageCircle className="w-8 h-8 opacity-40" />
                    </div>
                  ) : (
                    conversasFiltradas.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => selecionarConversa(c)}
                        className={classNames(
                          "flex w-full items-start gap-2 rounded-2xl px-2.5 py-2 text-left text-xs transition",
                          conversaSelecionada?.id === c.id
                            ? "bg-sky-50 ring-1 ring-sky-100"
                            : "hover:bg-slate-50"
                        )}
                      >
                        <Avatar className="mt-0.5 h-9 w-9">
                          <AvatarFallback className="bg-sky-100 text-[11px] font-semibold text-sky-700">
                            {c.cliente_nome?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex flex-1 flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">
                                {c.cliente_nome}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {c.cliente_telefone}
                              </p>
                            </div>
                            {c.data_ultima_mensagem && (
                              <p className="whitespace-nowrap text-[11px] text-slate-400">
                                {new Date(c.data_ultima_mensagem).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          <p className="line-clamp-1 text-[11px] text-slate-600">
                            {c.ultima_mensagem || 'Sem mensagens'}
                          </p>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button 
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </button>
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
                      <Avatar className="h-11 w-11">
                        <AvatarFallback className="bg-violet-600 text-sm font-semibold text-white">
                          {conversaSelecionada.cliente_nome?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{conversaSelecionada.cliente_nome}</p>
                      <p className="text-[11px] text-slate-500">{conversaSelecionada.cliente_telefone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-md border-slate-200 text-xs font-medium">
                      <Tag className="h-3.5 w-3.5" />
                      Criar Proposta
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-md border-slate-200 text-xs font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      Criar Tarefa
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-md border-slate-200 text-xs font-medium">
                      <Search className="h-3.5 w-3.5" />
                      Adicionar Tag
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
                    <ScrollArea className="flex-1 px-6 pt-4">
                      {loadingMensagens ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
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
                            <MensagemItem key={msg.id} mensagem={msg} />
                          ))}
                          <div ref={mensagensEndRef} />
                        </div>
                      )}
                    </ScrollArea>

                    {/* Input de mensagem */}
                    <EnviarMensagemForm
                      onEnviar={({ texto }) => enviarMensagemMutation.mutate({ texto })}
                      isLoading={enviarMensagemMutation.isPending}
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
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-violet-100 text-[12px] font-semibold text-violet-700">
                                {conversaSelecionada.cliente_nome?.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="text-sm font-semibold leading-tight">{conversaSelecionada.cliente_nome}</p>
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
                              <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-full px-2 text-[11px]">
                                <Plus className="h-3 w-3" />
                                Adicionar
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {tags.map((t) => (
                                <Badge key={t.label} className={classNames("rounded-full px-2 py-0.5 text-[10px]", t.color)}>
                                  {t.label}
                                </Badge>
                              ))}
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
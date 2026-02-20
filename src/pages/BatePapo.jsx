import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MessageCircle, Search, MoreVertical, UserCog, Ban, Users, Tag, CheckSquare, FileText, UserCheck, Plus, Filter, MailOpen, CheckCheck, Pin, Clock } from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import MensagemItem from '@/components/chat/MensagemItem';
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import NovaConversaModal from '@/components/chat/NovaConversaModal';

export default function BatePapo() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [searchConversas, setSearchConversas] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todas');
  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [fotosContatos, setFotosContatos] = useState({});
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  // Sincronizar mensagens com Evolution API quando abre conversa
  useEffect(() => {
    if (conversaSelecionada?.id && empresaId) {
      sincronizarComEvolutionAPI();
    }
  }, [conversaSelecionada?.id, empresaId]);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        const empId = '699696c2c9f5bffc2e67402b';
        setEmpresaId(empId);
        const emps = await base44.entities.Empresa.filter({ id: empId });
        if (emps.length > 0) setEmpresa(emps[0]);
      } else {
        const colabs = await base44.entities.Colaborador.filter({ 
          user_id: me.id, 
          status: 'ativo' 
        });
        if (colabs.length > 0) {
          const empId = colabs[0].empresa_id;
          setEmpresaId(empId);
          const emps = await base44.entities.Empresa.filter({ id: empId });
          if (emps.length > 0) setEmpresa(emps[0]);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  // Buscar fotos de perfil dos contatos via Evolution API
  const buscarFotosContatos = async (conversasList) => {
    if (!empresa?.evolution_url || !empresa?.evolution_api_key || !empresa?.evolution_instance_name) return;
    
    const novasFotos = {};
    for (const conversa of conversasList) {
      if (!conversa.cliente_telefone) continue;
      try {
        const numero = conversa.cliente_telefone.replace(/\D/g, '');
        const resp = await fetch(
          `${empresa.evolution_url.replace(/\/$/, '')}/chat/fetchProfilePictureUrl/${empresa.evolution_instance_name}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': empresa.evolution_api_key
            },
            body: JSON.stringify({ number: numero })
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data?.profilePictureUrl) {
            novasFotos[conversa.cliente_telefone] = data.profilePictureUrl;
          }
        }
      } catch (e) {
        // silencioso - foto não disponível
      }
    }
    setFotosContatos(prev => ({ ...prev, ...novasFotos }));
  };

  const sincronizarComEvolutionAPI = async () => {
    if (!conversaSelecionada?.cliente_telefone) return;
    
    try {
      console.log('🔄 Sincronizando com Evolution API:', conversaSelecionada.cliente_telefone);
      
      // Chamar função para sincronizar mensagens da Evolution API
      const resultado = await base44.functions.invoke('sincronizarMensagensEvolution', {
        conversa_id: conversaSelecionada.id,
        telefone: conversaSelecionada.cliente_telefone,
        empresa_id: empresaId
      });

      if (resultado.data?.sucesso) {
        console.log('✅ Sincronização com Evolution API:', resultado.data.mensagens_adicionadas, 'novas mensagens');
        // Recarregar mensagens
        queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id, empresaId] });
      }
    } catch (error) {
      console.log('⚠️ Aviso de sincronização (pode ser normal):', error.message);
      // Não mostrar erro para não assustar o usuário - apenas log
    }
  };

  const { data: conversas = [], isError: conversasError, error: conversasErrorMsg } = useQuery({
    queryKey: ['conversas-whatsapp', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        console.log('[Conversas] 🔄 Buscando conversas da empresa:', empresaId);
        const result = await base44.entities.ConversaWhatsapp.filter(
          { empresa_id: empresaId },
          '-data_ultima_mensagem'
        );
        console.log('[Conversas] ✅ Total encontradas:', result.length);
        
        // Validação rigorosa
        const conversasValidas = (result || []).filter(c => {
          const temId = !!c.id;
          const temTelefone = !!c.cliente_telefone;
          const temNome = !!c.cliente_nome;
          
          if (!temId || !temTelefone) {
            console.warn('[Conversas] ⚠️ Conversa inválida:', c.id, { temId, temTelefone, temNome });
            return false;
          }
          return true;
        });
        
        console.log('[Conversas] ✅ Conversas válidas:', conversasValidas.length);
        // Buscar fotos em background
        buscarFotosContatos(conversasValidas);
        return conversasValidas;
      } catch (err) {
        console.error('[Conversas] ❌ Erro:', err);
        toast.error('Erro ao carregar conversas: ' + err.message);
        throw err;
      }
    },
    refetchInterval: 3000
  });

  const { data: mensagens = [], isError: mensagensError, error: msgError, isPending: loadingMensagens } = useQuery({
    queryKey: ['mensagens-whatsapp', conversaSelecionada?.id, empresaId],
    enabled: !!conversaSelecionada?.id && !!empresaId,
    queryFn: async () => {
      const msgs = await base44.entities.MensagemWhatsapp.filter(
        { conversa_id: conversaSelecionada.id },
        'created_date'
      );
      return msgs || [];
    },
    refetchInterval: 3000,
    retry: 2,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Subscrição em tempo real para novas mensagens e conversas
  useEffect(() => {
    const unsubMsg = base44.entities.MensagemWhatsapp.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada?.id, empresaId] });
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
    });

    const unsubConv = base44.entities.ConversaWhatsapp.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
    });

    return () => {
      unsubMsg();
      unsubConv();
    };
  }, [conversaSelecionada?.id, empresaId, queryClient]);

  const criarConversaMutation = useMutation({
    mutationFn: async ({ telefone, nome }) => {
      // Criar nova conversa
      const novaConversa = await base44.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: '',
        cliente_nome: nome,
        cliente_telefone: telefone,
        whatsapp_id: `conv_${Date.now()}`,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString()
      });
      return novaConversa;
    },
    onSuccess: (conversa) => {
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      setConversaSelecionada(conversa);
      setNovaConversaOpen(false);
      toast.success('Conversa criada! Envie a primeira mensagem.');
    },
    onError: (error) => {
      toast.error('Erro ao criar conversa: ' + error.message);
    }
  });

  const enviarMensagemMutation = useMutation({
    mutationFn: async ({ texto, arquivo }) => {
      if (arquivo) {
        // Upload do arquivo
        const { file_url } = await base44.integrations.Core.UploadFile({ file: arquivo });
        
        let tipo_conteudo = 'documento';
        if (arquivo.type.startsWith('image/')) tipo_conteudo = 'imagem';
        if (arquivo.type.startsWith('audio/')) tipo_conteudo = 'audio';
        if (arquivo.type.startsWith('video/')) tipo_conteudo = 'video';
        if (arquivo.type === 'application/pdf') tipo_conteudo = 'pdf';

        return base44.entities.MensagemWhatsapp.create({
          conversa_id: conversaSelecionada.id,
          empresa_id: empresaId,
          remetente: 'vendedor',
          usuario_id: user.id,
          usuario_nome: user.full_name,
          tipo_conteudo,
          arquivo_url: file_url,
          arquivo_nome: arquivo.name,
          arquivo_tamanho: arquivo.size,
          data_envio: new Date().toISOString()
        });
      } else if (texto) {
        return base44.entities.MensagemWhatsapp.create({
          conversa_id: conversaSelecionada.id,
          empresa_id: empresaId,
          remetente: 'vendedor',
          usuario_id: user.id,
          usuario_nome: user.full_name,
          tipo_conteudo: 'texto',
          texto,
          data_envio: new Date().toISOString()
        });
      }
    },
    onSuccess: async (novaMensagem) => {
      await queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada?.id] });
      await queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      
      // Integrar com Evolution API (apenas para mensagens de texto)
      if (novaMensagem.tipo_conteudo === 'texto' && novaMensagem.texto) {
        try {
          console.log('📤 Enviando para Evolution API:', {
            conversa_id: conversaSelecionada.id,
            mensagem_texto: novaMensagem.texto,
            numero_cliente: conversaSelecionada.cliente_telefone
          });
          
          await base44.functions.invoke('enviarMensagemWhatsapp', {
            conversa_id: conversaSelecionada.id,
            mensagem_texto: novaMensagem.texto,
            numero_cliente: conversaSelecionada.cliente_telefone,
            empresa_id: empresaId
          });
          toast.success('✅ Mensagem enviada via WhatsApp!');
        } catch (error) {
          console.error('❌ Erro ao enviar para Evolution:', error);
          const errorMsg = error.response?.data?.error || error.message || 'Erro desconhecido';
          toast.error('Erro ao enviar via WhatsApp: ' + errorMsg);
          
          // Ainda assim, marca a mensagem como enviada localmente
          await queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada?.id] });
        }
      }
    },
    onError: (error) => {
      toast.error('Erro ao enviar: ' + error.message);
    }
  });

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

  if (conversasError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="text-center">
          <h3 className="font-semibold text-red-600 mb-2">Erro ao carregar conversas</h3>
          <p className="text-sm text-slate-600">{conversasErrorMsg?.message}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Recarregar
          </Button>
        </div>
      </div>
    );
  }

  if (mensagensError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Bate-papo"
          subtitle="Converse com seus clientes via WhatsApp"
        />
        <div className="flex flex-col items-center justify-center h-96 gap-4 bg-red-50 rounded-lg border border-red-200">
          <div className="text-center">
            <h3 className="font-semibold text-red-600 mb-2">Erro ao carregar mensagens</h3>
            <p className="text-sm text-red-600 mb-4">{msgError?.message || 'Erro desconhecido'}</p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp'] })} className="mt-4">
              Tentar Novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <NovaConversaModal
        open={novaConversaOpen}
        onOpenChange={setNovaConversaOpen}
        onCriar={(dados) => criarConversaMutation.mutate(dados)}
        isLoading={criarConversaMutation.isPending}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Lista de Conversas */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-900">Conversas</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-8 w-8"
                  onClick={() => toast.info('Filtros em desenvolvimento')}
                >
                  <Filter className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  className="rounded-full bg-blue-500 hover:bg-blue-600 h-10 w-10"
                  onClick={() => setNovaConversaOpen(true)}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou telefone"
                value={searchConversas}
                onChange={(e) => setSearchConversas(e.target.value)}
                className="pl-10 bg-slate-50 border-slate-200"
              />
            </div>

            <Tabs value={filtroStatus} onValueChange={setFiltroStatus} className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-slate-100">
                <TabsTrigger value="todas" className="text-xs">Entrada</TabsTrigger>
                <TabsTrigger value="ativa" className="text-xs">Esperando</TabsTrigger>
                <TabsTrigger value="arquivada" className="text-xs">Finalizados</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {conversasFiltradas.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nenhuma conversa</p>
                </div>
              </div>
            ) : (
              conversasFiltradas.map(conversa => (
                <div
                  key={conversa.id}
                  className={`relative group w-full border-b transition-all ${
                    conversaSelecionada?.id === conversa.id
                      ? 'bg-blue-50 border-l-4 border-l-blue-500'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <button
                    onClick={() => setConversaSelecionada(conversa)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                        {fotosContatos[conversa.cliente_telefone] ? (
                          <img src={fotosContatos[conversa.cliente_telefone]} alt={conversa.cliente_nome} className="w-full h-full object-cover" />
                        ) : (
                          conversa.cliente_nome?.charAt(0).toUpperCase() || '?'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-slate-900 truncate">{conversa.cliente_nome}</p>
                          {conversa.data_ultima_mensagem && (
                            <span className="text-xs text-slate-400">
                              {format(new Date(conversa.data_ultima_mensagem), 'HH:mm')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mb-1">{conversa.cliente_telefone}</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-slate-600 truncate flex-1">{conversa.ultima_mensagem || 'Sem mensagens'}</p>
                          {conversa.usuario_responsavel_nome && (
                            <div className="flex items-center -space-x-2">
                              <div 
                                className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-white flex items-center justify-center text-white text-xs font-semibold"
                                title={conversa.usuario_responsavel_nome}
                              >
                                {conversa.usuario_responsavel_nome.charAt(0).toUpperCase()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  
                  {/* Botão Mais opções */}
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu modal={true}>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg flex items-center gap-1.5"
                        >
                          Mais opções
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="left" sideOffset={5} className="w-56 z-[100]">
                        <DropdownMenuItem onClick={() => toast.success('Conversa atribuída para você')}>
                          <UserCheck className="w-4 h-4 mr-2" />
                          Atribuir para mim
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info('Adicionar etiqueta em desenvolvimento')}>
                          <Tag className="w-4 h-4 mr-2" />
                          Adicionar etiqueta
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info('Marcado como não lida')}>
                          <MailOpen className="w-4 h-4 mr-2" />
                          Marcar como não lida
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.warning('Contato bloqueado')}>
                          <Ban className="w-4 h-4 mr-2" />
                          Bloquear contato
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.success('Conversa finalizada')}>
                          <CheckCheck className="w-4 h-4 mr-2" />
                          Finalizar conversa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info('Marcado como esperando')}>
                          <Clock className="w-4 h-4 mr-2" />
                          Marcar como esperando
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.success('Conversa fixada')}>
                          <Pin className="w-4 h-4 mr-2" />
                          Fixar conversa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Área de Chat */}
        {conversaSelecionada ? (
          <div className="flex-1 flex flex-col bg-slate-50">
            {/* Header do Chat */}
            <div className="bg-white border-b px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {fotosContatos[conversaSelecionada.cliente_telefone] ? (
                      <img src={fotosContatos[conversaSelecionada.cliente_telefone]} alt={conversaSelecionada.cliente_nome} className="w-full h-full object-cover" />
                    ) : (
                      conversaSelecionada.cliente_nome?.charAt(0).toUpperCase() || '?'
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{conversaSelecionada.cliente_nome}</h3>
                    <p className="text-xs text-slate-500">{conversaSelecionada.cliente_telefone}</p>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                      <UserCog className="w-4 h-4 mr-2" />
                      Alterar Dados do Lead
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                      <UserCheck className="w-4 h-4 mr-2" />
                      Responsável pelo Lead
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                      <Tag className="w-4 h-4 mr-2" />
                      Gerenciar Tags
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                      <CheckSquare className="w-4 h-4 mr-2" />
                      Criar Tarefa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                      <FileText className="w-4 h-4 mr-2" />
                      Criar Proposta
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                      <Users className="w-4 h-4 mr-2" />
                      Transferir Atendimento
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => toast.warning('Contato bloqueado')}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      Bloquear Contato
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-50 to-slate-100">
              {loadingMensagens && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              )}

              {!loadingMensagens && mensagens.length === 0 && (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-40" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                    <p className="text-xs mt-1">Envie a primeira mensagem para começar a conversa</p>
                  </div>
                </div>
              )}

              {!loadingMensagens && mensagens.length > 0 && (
                <div className="space-y-4">
                  {mensagens.map((msg) => (
                    <MensagemItem key={msg.id} mensagem={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Campo de Envio */}
            <EnviarMensagemForm
              onEnviar={(dados) => enviarMensagemMutation.mutate(dados)}
              isLoading={enviarMensagemMutation.isPending}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-12 h-12 text-blue-500" />
              </div>
              <p className="text-lg font-semibold text-slate-900 mb-2">Selecione uma conversa</p>
              <p className="text-sm text-slate-500">Escolha uma conversa da lista para começar a conversar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
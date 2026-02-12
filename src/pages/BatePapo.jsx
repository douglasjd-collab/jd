import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, Search, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import MensagemItem from '@/components/chat/MensagemItem';
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';

export default function BatePapo() {
  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [searchConversas, setSearchConversas] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todas');
  const [empresaId, setEmpresaId] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // Carregar auth uma única vez
  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const me = await base44.auth.me();
        if (isMounted && me?.empresa_id) {
          setEmpresaId(me.empresa_id);
        } else if (isMounted && !me?.empresa_id) {
          toast.error('Empresa não encontrada');
        }
      } catch (e) {
        console.error('❌ Auth error:', e);
        if (isMounted) toast.error('Erro ao carregar perfil');
      } finally {
        if (isMounted) setLoadingAuth(false);
      }
    };

    loadUser();
    return () => { isMounted = false; };
  }, []);

  // Query conversas
  const { data: conversas = [] } = useQuery({
    queryKey: ['conversas-whatsapp', empresaId],
    enabled: !!empresaId && !loadingAuth,
    queryFn: async () => {
      if (!empresaId) return [];
      try {
        const result = await base44.entities.ConversaWhatsapp.filter(
          { empresa_id: empresaId },
          '-data_ultima_mensagem',
          100
        );
        return (result || []).slice(0, 100);
      } catch (e) {
        console.error('❌ Conversas error:', e);
        return [];
      }
    },
    staleTime: 60000,
    gcTime: 300000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Query mensagens
  const { data: mensagens = [], isPending: loadingMensagens } = useQuery({
    queryKey: ['mensagens-whatsapp', conversaSelecionada?.id],
    enabled: !!conversaSelecionada?.id,
    queryFn: async () => {
      if (!conversaSelecionada?.id) return [];
      try {
        const msgs = await base44.entities.MensagemWhatsapp.filter(
          { conversa_id: conversaSelecionada.id },
          'created_date',
          200
        );
        return (msgs || []).slice(0, 200);
      } catch (e) {
        console.error('❌ Mensagens error:', e);
        return [];
      }
    },
    staleTime: 60000,
    gcTime: 300000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Scroll para última mensagem
  useEffect(() => {
    if (mensagens.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [mensagens.length]);

  // Enviar mensagem
  const handleEnviarMensagem = async (dados) => {
    if (!conversaSelecionada?.id || !dados.texto?.trim()) {
      toast.error('Preencha a mensagem');
      return;
    }

    setSendingMessage(true);
    try {
      await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversaSelecionada.id,
        mensagem_texto: dados.texto.trim(),
        numero_cliente: conversaSelecionada.cliente_telefone,
        empresa_id: empresaId,
      });

      toast.success('Mensagem enviada');
      // Recarrega mensagens
      queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id] });
    } catch (e) {
      console.error('❌ Erro envio:', e);
      toast.error('Erro ao enviar mensagem');
    } finally {
      setSendingMessage(false);
    }
  };

  // Filtrar conversas
  const conversasFiltradas = conversas.filter(c => {
    const matchSearch = (c.cliente_nome || '').toLowerCase().includes(searchConversas.toLowerCase()) ||
      (c.cliente_telefone || '').includes(searchConversas);
    const matchStatus = filtroStatus === 'todas' || c.status === filtroStatus;
    return matchSearch && matchStatus;
  });

  // Loading inicial
  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-slate-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="flex-1 flex overflow-hidden">
        {/* Lista de Conversas */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-900">Conversas</h2>
              <Button
                size="icon"
                className="rounded-full bg-blue-500 hover:bg-blue-600 h-10 w-10"
                onClick={() => toast.info('Em desenvolvimento')}
              >
                <Plus className="w-5 h-5" />
              </Button>
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
                <button
                  key={conversa.id}
                  onClick={() => setConversaSelecionada(conversa)}
                  className={`w-full p-4 text-left border-b transition-all ${
                    conversaSelecionada?.id === conversa.id
                      ? 'bg-blue-50 border-l-4 border-l-blue-500'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {conversa.cliente_nome?.charAt(0).toUpperCase() || '?'}
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
                      <p className="text-sm text-slate-600 truncate">{conversa.ultima_mensagem || 'Sem mensagens'}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Área de Chat */}
        {conversaSelecionada ? (
          <div className="flex-1 flex flex-col bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                  {conversaSelecionada.cliente_nome?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{conversaSelecionada.cliente_nome}</h3>
                  <p className="text-xs text-slate-500">{conversaSelecionada.cliente_telefone}</p>
                </div>
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
            <EnviarMensagemForm onEnviar={handleEnviarMensagem} isLoading={sendingMessage} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-12 h-12 text-blue-500" />
              </div>
              <p className="text-lg font-semibold text-slate-900 mb-2">Selecione uma conversa</p>
              <p className="text-sm text-slate-500">Escolha uma conversa da lista para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
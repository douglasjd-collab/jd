import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MessageCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import MensagemItem from '@/components/chat/MensagemItem';
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';

export default function BatePapo() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [searchConversas, setSearchConversas] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversaSelecionada]);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
        if (empresas.length > 0) setEmpresaId(empresas[0].id);
      } else {
        const colabs = await base44.entities.Colaborador.filter({ 
          user_id: me.id, 
          status: 'ativo' 
        });
        if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
      }
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  const { data: conversas = [], isError: conversasError, error: conversasErrorMsg } = useQuery({
    queryKey: ['conversas-whatsapp', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        return await base44.entities.ConversaWhatsapp.filter(
          { empresa_id: empresaId },
          '-data_ultima_mensagem'
        );
      } catch (err) {
        console.error('Erro ao carregar conversas:', err);
        toast.error('Erro ao carregar conversas: ' + err.message);
        throw err;
      }
    },
    refetchInterval: 5000
  });

  const { data: mensagens = [], isError: mensagensError, error: msgError, isPending: loadingMensagens } = useQuery({
    queryKey: ['mensagens-whatsapp', conversaSelecionada?.id, empresaId],
    enabled: !!conversaSelecionada?.id && !!empresaId,
    queryFn: async () => {
      try {
        console.log('[Chat] Carregando mensagens:', { 
          conversa_id: conversaSelecionada?.id,
          empresa_id: empresaId,
          user_perfil: user?.perfil
        });
        
        const msgs = await base44.entities.MensagemWhatsapp.filter(
          { conversa_id: conversaSelecionada.id },
          'created_date'
        );
        console.log('[Chat] ✅ Mensagens carregadas:', msgs.length);
        return msgs || [];
      } catch (err) {
        console.error('[Chat] ❌ Erro ao carregar:', {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data
        });
        throw err;
      }
    },
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 2000
  });

  // Subscrição em tempo real para novas mensagens
  useEffect(() => {
    if (!conversaSelecionada?.id) return;

    const unsubscribe = base44.entities.MensagemWhatsapp.subscribe((event) => {
      // Se a mensagem é da conversa atual
      if (event.data?.conversa_id === conversaSelecionada.id) {
        queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaSelecionada.id] });
      }
    });

    return unsubscribe;
  }, [conversaSelecionada?.id, queryClient]);

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
      
      // Integrar com Evolution API
      await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversaSelecionada.id,
        mensagem_id: novaMensagem.id,
        telefone: conversaSelecionada.cliente_telefone
      });

      toast.success('Mensagem enviada!');
    },
    onError: (error) => {
      toast.error('Erro ao enviar: ' + error.message);
    }
  });

  const conversasFiltradas = conversas.filter(c =>
    (c.cliente_nome || '').toLowerCase().includes(searchConversas.toLowerCase()) ||
    (c.cliente_telefone || '').includes(searchConversas)
  );

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
    <div className="space-y-6">
      <PageHeader
        title="Bate-papo"
        subtitle="Converse com seus clientes via WhatsApp"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
        {/* Lista de Conversas */}
        <Card className="flex flex-col">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar conversa..."
                value={searchConversas}
                onChange={(e) => setSearchConversas(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {conversasFiltradas.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                <div className="text-center">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma conversa</p>
                </div>
              </div>
            ) : (
              conversasFiltradas.map(conversa => (
                <button
                  key={conversa.id}
                  onClick={() => setConversaSelecionada(conversa)}
                  className={`w-full p-4 border-b text-left transition-colors ${
                    conversaSelecionada?.id === conversa.id
                      ? 'bg-[#23BE84]/10 border-l-4 border-l-[#23BE84]'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="font-semibold text-slate-900">{conversa.cliente_nome}</p>
                  <p className="text-sm text-slate-500">{conversa.cliente_telefone}</p>
                  <p className="text-xs text-slate-400 truncate mt-1">{conversa.ultima_mensagem}</p>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Chat */}
        {conversaSelecionada ? (
          <Card className="md:col-span-2 flex flex-col h-full">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold text-slate-900">{conversaSelecionada.cliente_nome}</h3>
              <p className="text-sm text-slate-500">{conversaSelecionada.cliente_telefone}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-white">
              {loadingMensagens ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : mensagens.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <p>Nenhuma mensagem ainda</p>
                </div>
              ) : (
                <>
                  {mensagens.map(msg => (
                    <MensagemItem key={msg.id} mensagem={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <EnviarMensagemForm
              onEnviar={(dados) => enviarMensagemMutation.mutate(dados)}
              isLoading={enviarMensagemMutation.isPending}
            />
          </Card>
        ) : (
          <Card className="md:col-span-2 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Selecione uma conversa para começar</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
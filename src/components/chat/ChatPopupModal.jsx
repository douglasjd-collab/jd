import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, X, MoreVertical, Phone } from 'lucide-react';
import MensagemItem from '@/components/chat/MensagemItem';
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import AvatarContato from '@/components/chat/AvatarContato';
import { toast } from 'sonner';

export default function ChatPopupModal({ open, onOpenChange, contato, empresaId, user, criarSeNaoExistir = true }) {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef(null);

  // Buscar ou criar conversa para este contato
  const { data: conversa, isLoading: loadingConversa } = useQuery({
    queryKey: ['conversa-popup', contato?.telefone, empresaId],
    enabled: open && !!contato?.telefone && !!empresaId,
    queryFn: async () => {
      const tel = contato.telefone.replace(/\D/g, '');
      // Tentar variações do telefone
      const variacoes = [tel];
      if (tel.startsWith('55') && tel.length === 12) variacoes.push(tel.slice(0, 4) + '9' + tel.slice(4));
      if (tel.startsWith('55') && tel.length === 13) variacoes.push(tel.slice(0, 4) + tel.slice(5));

      for (const v of variacoes) {
        const convs = await base44.entities.ConversaWhatsapp.filter(
          { empresa_id: empresaId, cliente_telefone: v },
          '-data_ultima_mensagem', 1
        );
        if (convs.length > 0) return convs[0];
      }

      // Não encontrou: criar nova conversa se solicitado
      if (criarSeNaoExistir) {
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

        const nova = await base44.entities.ConversaWhatsapp.create({
          empresa_id: empresaId,
          cliente_id: '',
          cliente_nome: contato.nome || tel,
          cliente_telefone: tel,
          whatsapp_id: `conv_${Date.now()}`,
          status: 'ativa',
          ultima_mensagem: '',
          data_ultima_mensagem: new Date().toISOString(),
          ...dadosCanal
        });
        return nova;
      }

      return null;
    },
  });

  const conversaId = conversa?.id;

  const { data: mensagens = [], isLoading: loadingMensagens } = useQuery({
    queryKey: ['mensagens-popup', conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const msgs = await base44.entities.MensagemWhatsapp.filter(
        { conversa_id: conversaId },
        '-data_envio',
        300
      );
      return [...msgs].reverse();
    },
    staleTime: 0,
  });

  // Real-time
  useEffect(() => {
    if (!conversaId) return;
    const unsub = base44.entities.MensagemWhatsapp.subscribe((event) => {
      if (event.type !== 'create') return;
      const msgData = event.data;
      if (msgData?.conversa_id === conversaId) {
        queryClient.setQueryData(['mensagens-popup', conversaId], (old = []) => {
          if (old.some(m => m.id === msgData.id)) return old;
          const base = msgData.remetente === 'vendedor'
            ? old.filter(m => !m.id?.startsWith('temp_'))
            : old;
          return [...base, msgData];
        });
        setTimeout(() => scrollToBottom(), 50);
      }
    });
    return unsub;
  }, [conversaId]);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  };

  useEffect(() => {
    if (mensagens.length) setTimeout(() => scrollToBottom(), 100);
  }, [mensagens]);

  const enviarMutation = useMutation({
    mutationFn: async ({ texto, arquivo }) => {
      if (!conversa) throw new Error('Nenhuma conversa encontrada para este contato');
      const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversa.id,
        mensagem_texto: texto,
        numero_cliente: conversa.cliente_telefone,
        empresa_id: empresaId,
        arquivo,
      });
      if (!resp?.data?.success) throw new Error(resp?.data?.error || 'Erro ao enviar');
      return resp.data;
    },
    onMutate: async ({ texto, arquivo }) => {
      const queryKey = ['mensagens-popup', conversaId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      let tipoConteudo = 'texto';
      if (arquivo?.tipo?.includes('image')) tipoConteudo = 'imagem';
      else if (arquivo?.tipo?.includes('audio')) tipoConteudo = 'audio';
      else if (arquivo?.tipo?.includes('pdf')) tipoConteudo = 'pdf';
      queryClient.setQueryData(queryKey, (old = []) => [
        ...old,
        {
          id: `temp_${Date.now()}`,
          conversa_id: conversaId,
          remetente: 'vendedor',
          tipo_conteudo: tipoConteudo,
          texto: texto || arquivo?.nome || 'Arquivo',
          data_envio: new Date().toISOString(),
          status: 'pendente',
        }
      ]);
      return { previous, queryKey };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      toast.error(error.message);
    },
    onSuccess: async (data, variables) => {
      if (conversa) {
        await base44.entities.ConversaWhatsapp.update(conversa.id, {
          ultima_mensagem: variables.texto || (variables.arquivo?.nome || ''),
          data_ultima_mensagem: new Date().toISOString(),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['mensagens-popup', conversaId] });
      toast.success('Mensagem enviada');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden flex flex-col"
        style={{ maxWidth: '680px', width: '95vw', height: '85vh', maxHeight: '700px' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#075e54] text-white flex-shrink-0">
          <AvatarContato contato={contato} className="w-10 h-10 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{contato?.nome || contato?.telefone}</p>
            <p className="text-xs text-white/70 truncate">{contato?.telefone}</p>
          </div>
          <div className="flex items-center gap-1">
            {conversa && (
              <a
                href={`https://wa.me/${contato?.telefone?.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                title="Abrir no WhatsApp"
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => onOpenChange?.(false)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col" style={{ backgroundImage: "url('https://web.whatsapp.com/img/bg-chat-tile-light_04fcacde539c58cca6745483d4858c52.png')", backgroundColor: '#e5ddd5' }}>
          {loadingConversa || loadingMensagens ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-8 h-8 animate-spin text-[#075e54]" />
            </div>
          ) : !conversa ? (
            <div className="flex items-center justify-center flex-1">
              <div className="bg-white rounded-xl px-6 py-5 text-center shadow-sm max-w-xs">
                <p className="text-sm font-medium text-slate-700">Nenhuma conversa encontrada</p>
                <p className="text-xs text-slate-400 mt-1">Este contato ainda não possui uma conversa no Bate-papo.</p>
              </div>
            </div>
          ) : (
            <>
              <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 pt-3">
                {mensagens.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="bg-white rounded-xl px-4 py-2 text-xs text-slate-500 shadow-sm">
                      Nenhuma mensagem ainda
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 pb-2">
                    {mensagens.map(msg => (
                      <MensagemItem key={msg.id} mensagem={msg} conversaId={conversaId} />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="flex-shrink-0 bg-white border-t">
                <EnviarMensagemForm
                  onEnviar={async ({ texto, arquivo }) => {
                    await enviarMutation.mutateAsync({ texto, arquivo });
                  }}
                  isLoading={enviarMutation.isPending}
                  nomeUsuario={user?.full_name || ''}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
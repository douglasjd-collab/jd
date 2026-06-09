import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageCircle } from 'lucide-react';
import MensagemItem from '@/components/chat/MensagemItem';
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import { toast } from 'sonner';

export default function OportunidadeAbaBatePapo({ oportunidade, currentUser }) {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef(null);

  const contato = {
    telefone: oportunidade?.telefone_lead || oportunidade?.cliente_telefone,
    nome: oportunidade?.cliente_nome || oportunidade?.titulo,
  };

  const { data: conversa, isLoading: loadingConversa } = useQuery({
    queryKey: ['conversa-funil', contato?.telefone, currentUser?.empresa_id],
    enabled: !!contato?.telefone && !!currentUser?.empresa_id,
    queryFn: async () => {
      const tel = contato.telefone.replace(/\D/g, '');
      const variacoes = new Set([tel]);
      if (!tel.startsWith('55')) variacoes.add('55' + tel);
      if (tel.startsWith('55') && tel.length === 12) variacoes.add(tel.slice(0, 4) + '9' + tel.slice(4));
      if (tel.startsWith('55') && tel.length === 13) variacoes.add(tel.slice(0, 4) + tel.slice(5));
      for (const v of variacoes) {
        const convs = await base44.entities.ConversaWhatsapp.filter(
          { empresa_id: currentUser.empresa_id, cliente_telefone: v }, '-data_ultima_mensagem', 1
        );
        if (convs.length > 0) return convs[0];
      }
      return null;
    },
  });

  const conversaId = conversa?.id;

  const { data: mensagens = [], isLoading: loadingMensagens } = useQuery({
    queryKey: ['mensagens-funil', conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const msgs = await base44.entities.MensagemWhatsapp.filter({ conversa_id: conversaId }, '-data_envio', 200);
      return [...msgs].reverse();
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (!conversaId) return;
    const unsub = base44.entities.MensagemWhatsapp.subscribe((event) => {
      if (event.type !== 'create') return;
      const msgData = event.data;
      if (msgData?.conversa_id === conversaId) {
        queryClient.setQueryData(['mensagens-funil', conversaId], (old = []) => {
          if (old.some(m => m.id === msgData.id)) return old;
          return [...old.filter(m => !m.id?.startsWith('temp_')), msgData];
        });
        scrollToBottom();
      }
    });
    return unsub;
  }, [conversaId]);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const vp = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (vp) vp.scrollTop = vp.scrollHeight;
    }
  };

  useEffect(() => {
    if (mensagens.length) setTimeout(scrollToBottom, 100);
  }, [mensagens]);

  const enviarMutation = useMutation({
    mutationFn: async ({ texto, arquivo }) => {
      let conversaAtual = conversa;
      if (!conversaAtual) {
        const tel = contato.telefone.replace(/\D/g, '');
        conversaAtual = await base44.entities.ConversaWhatsapp.create({
          empresa_id: currentUser.empresa_id,
          cliente_telefone: tel,
          cliente_nome: contato.nome || tel,
          status: 'ativa',
          tipo_conexao: 'empresa',
        });
        queryClient.setQueryData(['conversa-funil', contato?.telefone, currentUser?.empresa_id], conversaAtual);
      }
      const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversaAtual.id,
        mensagem_texto: texto,
        numero_cliente: conversaAtual.cliente_telefone,
        empresa_id: currentUser.empresa_id,
        arquivo,
      });
      if (!resp?.data?.success && !resp?.data?.mensagem_id) throw new Error(resp?.data?.error || 'Erro ao enviar');
      return { ...resp.data, conversaId: conversaAtual.id };
    },
    onMutate: async ({ texto }) => {
      if (!conversaId) return {};
      const qk = ['mensagens-funil', conversaId];
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData(qk);
      queryClient.setQueryData(qk, (old = []) => [...old, {
        id: `temp_${Date.now()}`, conversa_id: conversaId, remetente: 'vendedor',
        tipo_conteudo: 'texto', texto, data_envio: new Date().toISOString(), status: 'pendente',
      }]);
      return { previous, qk };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous && ctx?.qk) queryClient.setQueryData(ctx.qk, ctx.previous);
      toast.error('Erro ao enviar: ' + (err.message || 'Tente novamente'));
    },
    onSuccess: (data) => {
      const cid = data?.conversaId || conversaId;
      if (cid) queryClient.invalidateQueries({ queryKey: ['mensagens-funil', cid] });
    },
  });

  if (!contato?.telefone) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="text-center">
          <MessageCircle className="w-12 h-12 opacity-20 mx-auto mb-3" />
          <p className="text-sm">Nenhum telefone vinculado a este lead</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '500px' }}>
      {/* Info do contato */}
      <div className="px-4 py-3 bg-[#075e54] text-white flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
          {(contato.nome || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-sm">{contato.nome}</p>
          <p className="text-xs text-white/70">{contato.telefone}</p>
        </div>
        {conversa && (
          <div className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {conversa.status === 'ativa' ? '● Ativa' : conversa.status}
          </div>
        )}
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-hidden flex flex-col"
        style={{ backgroundImage: "url('https://web.whatsapp.com/img/bg-chat-tile-light_04fcacde539c58cca6745483d4858c52.png')", backgroundColor: '#e5ddd5' }}>
        {loadingConversa || loadingMensagens ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-7 h-7 animate-spin text-[#075e54]" />
          </div>
        ) : !conversa ? (
          <div className="flex items-center justify-center flex-1">
            <div className="bg-white rounded-xl px-6 py-5 text-center shadow-sm max-w-xs">
              <p className="text-sm font-medium text-slate-700">Nenhuma conversa encontrada</p>
              <p className="text-xs text-slate-400 mt-1">Este lead ainda não possui conversa no Bate-Papo.</p>
            </div>
          </div>
        ) : (
          <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 pt-3">
            <div className="space-y-1 pb-2">
              {mensagens.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="bg-white rounded-xl px-4 py-2 text-xs text-slate-500 shadow-sm">Nenhuma mensagem ainda</div>
                </div>
              ) : mensagens.map(msg => (
                <MensagemItem key={msg.id} mensagem={msg} conversaId={conversaId} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Campo de envio */}
      <div className="flex-shrink-0 bg-white border-t">
        <EnviarMensagemForm
          onEnviar={async ({ texto, arquivo }) => { await enviarMutation.mutateAsync({ texto, arquivo }); }}
          isLoading={enviarMutation.isPending}
          nomeUsuario={currentUser?.full_name || ''}
          empresaId={currentUser?.empresa_id || null}
        />
      </div>
    </div>
  );
}
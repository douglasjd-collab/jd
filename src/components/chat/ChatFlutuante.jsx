import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, X, Minimize2, ChevronLeft, Camera } from 'lucide-react';
import MensagemItem from '@/components/chat/MensagemItem';
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import AvatarContato from '@/components/chat/AvatarContato';
import { toast } from 'sonner';
import { format } from 'date-fns';

/**
 * Chat flutuante e arrastável — reutiliza os mesmos componentes do BatePapo.
 *
 * Props:
 *  - empresaId: string
 *  - user: objeto do usuário (base44.auth.me())
 *  - captureTargetRef: ref React do elemento a capturar (print da simulação)
 *  - captureLabel?: string (nome sugestão do print)
 */
export default function ChatFlutuante({ empresaId, user, captureTargetRef, captureLabel = 'simulacao', defaultMinimized = false }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(!defaultMinimized);
  const [minimized, setMinimized] = useState(defaultMinimized);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [busca, setBusca] = useState('');
  const [contatosCache, setContatosCache] = useState({});

  // ── Arraste do painel ──
  const [pos, setPos] = useState({ x: Math.max(20, window.innerWidth - 400), y: 80 });
  const dragRef = useRef(null);
  const dragState = useRef(null);

  const iniciarArraste = (e) => {
    // não arrastar se clicou em um botão/elemento interativo
    if (e.target.closest('button') || e.target.closest('input')) return;
    const rect = dragRef.current.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    document.addEventListener('mousemove', moverArraste);
    document.addEventListener('mouseup', finalizarArraste);
  };
  const moverArraste = (e) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const nx = Math.max(0, Math.min(window.innerWidth - 380, dragState.current.origX + dx));
    const ny = Math.max(0, Math.min(window.innerHeight - 80, dragState.current.origY + dy));
    setPos({ x: nx, y: ny });
  };
  const finalizarArraste = () => {
    dragState.current = null;
    document.removeEventListener('mousemove', moverArraste);
    document.removeEventListener('mouseup', finalizarArraste);
  };

  // Garantir que permaneça visível ao redimensionar
  useEffect(() => {
    const onResize = () => {
      setPos(prev => ({
        x: Math.max(0, Math.min(window.innerWidth - 380, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - 80, prev.y)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isGrupo = (c) => {
    const tel = c?.cliente_telefone || '';
    const wid = c?.whatsapp_id || '';
    return tel.includes('@g.us') || wid.includes('@g.us') || tel.includes('@broadcast') || wid.includes('@broadcast');
  };

  // Lista de conversas
  const { data: conversas = [], isLoading: loadingConversas } = useQuery({
    queryKey: ['conversas-flutuante', empresaId],
    enabled: !!empresaId && open,
    staleTime: 30000,
    queryFn: async () => {
      const resp = await base44.functions.invoke('buscarConversasComContatos', { empresa_id: empresaId, limit: 3000 });
      const data = resp?.data?.conversas || [];
      // montar cache de contatos
      const cache = {};
      data.forEach(c => {
        if (c.contato) cache[c.id] = { ...c.contato, foto_url: c.contato.foto_url || c.foto_url };
        else if (c.foto_url) cache[c.id] = { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url };
      });
      setContatosCache(cache);
      return data.filter(c => c.id && c.cliente_telefone);
    },
  });

  const conversasFiltradas = conversas.filter(c => {
    if (isGrupo(c)) return false;
    const tel = String(c.cliente_telefone).replace(/\D/g, '');
    if (tel.length < 8) return false;
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    const nome = (c.cliente_nome || contatosCache[c.id]?.nome || '').toLowerCase();
    return nome.includes(q) || c.cliente_telefone.includes(busca);
  });

  // Mensagens da conversa selecionada
  const conversaId = conversaSelecionada?.id;
  const { data: mensagens = [], isLoading: loadingMensagens } = useQuery({
    queryKey: ['mensagens-flutuante', conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const msgs = await base44.entities.MensagemWhatsapp.filter({ conversa_id: conversaId }, '-data_envio', 200);
      return [...msgs].reverse();
    },
    staleTime: 0,
  });

  // Realtime: novas mensagens
  useEffect(() => {
    if (!conversaId) return;
    const unsub = base44.entities.MensagemWhatsapp.subscribe((event) => {
      if (event.type !== 'create') return;
      const m = event.data;
      if (m?.conversa_id !== conversaId) return;
      queryClient.setQueryData(['mensagens-flutuante', conversaId], (old = []) => {
        if (old.some(x => x.id === m.id)) return old;
        const base = m.remetente === 'vendedor' ? old.filter(x => !x.id?.startsWith('temp_')) : old;
        return [...base, m];
      });
      setTimeout(() => scrollRef.current?.scrollToBottom?.(), 50);
    });
    return unsub;
  }, [conversaId, queryClient]);

  const scrollRef = useRef(null);
  const scrollViewport = useRef(null);
  useEffect(() => {
    if (mensagens.length && scrollViewport.current) {
      setTimeout(() => { scrollViewport.current.scrollTop = scrollViewport.current.scrollHeight; }, 100);
    }
  }, [mensagens]);

  // Envio de mensagem (mesma função do BatePapo)
  const enviarMutation = useMutation({
    mutationFn: async ({ texto, arquivo, mensagemParaResponder }) => {
      const destinatario = isGrupo(conversaSelecionada) ? conversaSelecionada.whatsapp_id : conversaSelecionada.cliente_telefone;
      const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversaSelecionada.id,
        mensagem_texto: texto,
        numero_cliente: destinatario,
        empresa_id: empresaId,
        arquivo,
        resposta_para_texto: mensagemParaResponder?.texto || null,
        resposta_para_nome: mensagemParaResponder ? (mensagemParaResponder.remetente === 'vendedor' ? (mensagemParaResponder.usuario_nome || 'Você') : (conversaSelecionada?.cliente_nome || 'Cliente')) : null,
        resposta_para_message_id: mensagemParaResponder?.whatsapp_message_id || null,
      });
      if (!resp?.data?.success) throw new Error(resp?.data?.error || 'Erro ao enviar');
      return resp.data;
    },
    onMutate: ({ texto, arquivo }) => {
      const qk = ['mensagens-flutuante', conversaId];
      let tipo = 'texto';
      if (arquivo?.tipo?.includes('image')) tipo = 'imagem';
      else if (arquivo?.tipo?.includes('audio')) tipo = 'audio';
      else if (arquivo?.tipo?.includes('video')) tipo = 'video';
      else if (arquivo?.tipo?.includes('pdf')) tipo = 'pdf';
      queryClient.setQueryData(qk, (old = []) => [...old, {
        id: `temp_${Date.now()}`, conversa_id: conversaId, remetente: 'vendedor',
        tipo_conteudo: tipo, texto: texto || arquivo?.nome || 'Arquivo',
        data_envio: new Date().toISOString(), status: 'pendente',
      }]);
    },
    onError: (err) => toast.error(err.message || 'Erro ao enviar'),
    onSuccess: async (data, vars) => {
      if (conversaSelecionada) {
        const msg = vars.texto || (vars.arquivo?.nome || '');
        const expira = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        base44.entities.ConversaWhatsapp.update(conversaSelecionada.id, {
          ultima_mensagem: msg, data_ultima_mensagem: new Date().toISOString(),
          ultimo_remetente: 'vendedor',
          responsavel_id: user?.colaborador_id || user?.id,
          responsavel_nome: user?.nome || user?.full_name || 'Atendente',
          responsavel_expira_em: expira,
        }).catch(() => {});
      }
      queryClient.refetchQueries({ queryKey: ['mensagens-flutuante', conversaId], type: 'active' });
    },
  });

  // ── Captura de tela (print da simulação) ──
  const [capturando, setCapturando] = useState(false);
  const capturarESimular = async () => {
    if (!captureTargetRef?.current) { toast.error('Nenhum conteúdo para capturar'); return; }
    if (!conversaSelecionada) { toast.error('Selecione uma conversa primeiro'); return; }
    setCapturando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(captureTargetRef.current, {
        backgroundColor: '#ffffff', scale: 2, logging: false, useCORS: true,
      });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.92));
      if (!blob) { toast.error('Falha ao gerar imagem'); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const nome = `${captureLabel}_${format(new Date(), 'ddMMyyy_HHmm')}.png`;
        // Enviar diretamente como imagem
        await enviarMutation.mutateAsync({ texto: '', arquivo: { base64, nome, tipo: 'image/png' } });
        toast.success('Print da simulação enviado!');
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      toast.error('Erro ao capturar: ' + (e.message || ''));
    } finally {
      setCapturando(false);
    }
  };

  // ── Renderização ──
  if (!empresaId || !user) return null;

  // Botão flutuante (quando fechado)
  if (!open) {
    return (
      <button
        onClick={() => { setMinimized(false); setOpen(true); }}
        className="fixed bottom-6 right-6 z-[9998] w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1ebe5b] shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        title="Conversar no WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.485 3.51A13.935 13.935 0 0012.06 0C5.503 0 .12 5.382.12 11.94c0 2.104.55 4.16 1.595 5.972L.03 24l4.204-1.102a13.9 13.9 0 005.86 1.261h.004c6.557 0 11.94-5.382 11.94-11.94a11.88 11.88 0 00-3.515-8.46"/>
        </svg>
      </button>
    );
  }

  const contatoAtual = conversaSelecionada ? contatosCache[conversaSelecionada.id] : null;
  const nomeCabecalho = conversaSelecionada
    ? (contatoAtual?.nome || conversaSelecionada.cliente_nome || conversaSelecionada.cliente_telefone)
    : 'WhatsApp';

  return (
    <>
      {/* Botão flutuante minimizado */}
      {minimized && (
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-6 right-6 z-[9998] w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1ebe5b] shadow-lg flex items-center justify-center transition-transform hover:scale-110"
          title="Reabrir chat"
        >
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.485 3.51A13.935 13.935 0 0012.06 0C5.503 0 .12 5.382.12 11.94c0 2.104.55 4.16 1.595 5.972L.03 24l4.204-1.102a13.9 13.9 0 005.86 1.261h.004c6.557 0 11.94-5.382 11.94-11.94a11.88 11.88 0 00-3.515-8.46"/>
          </svg>
        </button>
      )}

      {/* Painel flutuante */}
      {!minimized && (
        <div
          ref={dragRef}
          className="fixed z-[9999] flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ left: pos.x, top: pos.y, width: 380, height: 560, maxHeight: 'calc(100vh - 100px)' }}
        >
          {/* Cabeçalho (arrastável) */}
          <div
            onMouseDown={iniciarArraste}
            className="flex items-center gap-2 px-3 py-2.5 bg-[#075e54] text-white cursor-move flex-shrink-0 select-none"
          >
            {conversaSelecionada && (
              <button onClick={() => setConversaSelecionada(null)} className="p-1 rounded-full hover:bg-white/10 transition-colors" title="Voltar">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {conversaSelecionada && (
              <AvatarContato contato={contatoAtual || { nome: conversaSelecionada.cliente_nome, telefone: conversaSelecionada.cliente_telefone, foto_url: conversaSelecionada.foto_url }} className="w-8 h-8 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">{nomeCabecalho}</p>
              {conversaSelecionada && <p className="text-[10px] text-white/70 truncate">{conversaSelecionada.cliente_telefone}</p>}
            </div>
            {conversaSelecionada && captureTargetRef && (
              <button
                onClick={capturarESimular}
                disabled={capturando || enviarMutation.isPending}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors relative"
                title="Capturar e enviar simulação"
              >
                {capturando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
            )}
            <button onClick={() => setMinimized(true)} className="p-1 rounded-full hover:bg-white/10 transition-colors" title="Minimizar">
              <Minimize2 className="w-4 h-4" />
            </button>
            <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Corpo: lista de conversas OU chat */}
          {!conversaSelecionada ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    autoFocus
                    placeholder="Buscar conversa..."
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>
              <div ref={scrollViewport} className="flex-1 overflow-y-auto">
                {loadingConversas ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : conversasFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                    <p className="text-sm">Nenhuma conversa encontrada</p>
                  </div>
                ) : (
                  conversasFiltradas.map(c => {
                    const nome = contatosCache[c.id]?.nome || c.cliente_nome || c.cliente_telefone;
                    const ultima = c.ultima_mensagem || '';
                    const hora = c.data_ultima_mensagem ? format(new Date(c.data_ultima_mensagem), 'HH:mm') : '';
                    return (
                      <button
                        key={c.id}
                        onClick={() => setConversaSelecionada(c)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-50"
                      >
                        <AvatarContato
                          contato={contatosCache[c.id] || { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url }}
                          className="w-10 h-10 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate text-slate-900">{nome}</p>
                            <span className="text-[10px] text-slate-400 flex-shrink-0">{hora}</span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">{ultima}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden bg-[#e5ddd5]" style={{ backgroundImage: "url('https://web.whatsapp.com/img/bg-chat-tile-light_04fcacde539c58cca6745483d4858c52.png')", backgroundRepeat: 'repeat' }}>
              {loadingMensagens ? (
                <div className="flex items-center justify-center flex-1">
                  <Loader2 className="w-6 h-6 animate-spin text-[#075e54]" />
                </div>
              ) : (
                <div ref={scrollViewport} className="flex-1 overflow-y-auto px-3 pt-3">
                  {mensagens.length === 0 ? (
                    <div className="flex items-center justify-center h-24">
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
                </div>
              )}
              <div className="flex-shrink-0 bg-white border-t">
                <EnviarMensagemForm
                  onEnviar={async ({ texto, arquivo }) => { await enviarMutation.mutateAsync({ texto, arquivo, mensagemParaResponder: null }); }}
                  isLoading={enviarMutation.isPending || capturando}
                  nomeUsuario={user?.full_name || user?.nome || ''}
                  empresaId={empresaId}
                  telefoneDestino={conversaSelecionada.cliente_telefone}
                  nomeCliente={contatoAtual?.nome || conversaSelecionada.cliente_nome}
                  conversaId={conversaId}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
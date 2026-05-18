import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Phone, ChevronRight, ChevronLeft, User, MoveHorizontal,
  CheckCircle2, XCircle, UserCheck, CheckSquare, Tag, Bell
} from 'lucide-react';
import MensagemItem from '@/components/chat/MensagemItem';
import EnviarMensagemForm from '@/components/chat/EnviarMensagemForm';
import AvatarContato from '@/components/chat/AvatarContato';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ChatFunilModal({ open, onOpenChange, oportunidade, currentUser, etapas = [], vendedores = [], onOportunidadeChanged }) {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef(null);
  const [painelAberto, setPainelAberto] = useState(true);
  const [novaEtapaId, setNovaEtapaId] = useState('');
  const [novoResponsavelId, setNovoResponsavelId] = useState('');
  const [criandoTarefa, setCriandoTarefa] = useState(false);
  const [tituloTarefa, setTituloTarefa] = useState('');

  const contato = {
    telefone: oportunidade?.telefone_lead || oportunidade?.cliente_telefone,
    nome: oportunidade?.cliente_nome || oportunidade?.titulo,
  };

  // Buscar conversa
  const { data: conversa, isLoading: loadingConversa } = useQuery({
    queryKey: ['conversa-funil', contato?.telefone, currentUser?.empresa_id],
    enabled: open && !!contato?.telefone && !!currentUser?.empresa_id,
    queryFn: async () => {
      const tel = contato.telefone.replace(/\D/g, '');
      
      // Gerar todas as variações possíveis do número
      const variacoes = new Set([tel]);
      
      // Com 55 no início
      if (!tel.startsWith('55')) {
        variacoes.add('55' + tel);
        variacoes.add('55' + '9' + tel.slice(2)); // tenta inserir 9
      }
      
      // 12 dígitos: 55 + DDD(2) + 8 dígitos → adicionar 9
      if (tel.startsWith('55') && tel.length === 12) {
        variacoes.add(tel.slice(0, 4) + '9' + tel.slice(4)); // 55DD9XXXXXXXX
      }
      // 13 dígitos: 55 + DDD(2) + 9 + 8 dígitos → remover 9
      if (tel.startsWith('55') && tel.length === 13) {
        variacoes.add(tel.slice(0, 4) + tel.slice(5)); // 55DDXXXXXXXX sem o 9
      }
      
      // Versão sem o 55
      if (tel.startsWith('55') && tel.length >= 12) {
        const semCodigo = tel.slice(2);
        variacoes.add(semCodigo);
        if (semCodigo.length === 10) variacoes.add('9' + semCodigo); // com 9
        if (semCodigo.length === 11 && semCodigo[2] === '9') variacoes.add(semCodigo[0] + semCodigo[1] + semCodigo.slice(3)); // sem 9
      }

      for (const v of variacoes) {
        const convs = await base44.entities.ConversaWhatsapp.filter(
          { empresa_id: currentUser.empresa_id, cliente_telefone: v },
          '-data_ultima_mensagem', 1
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
      const msgs = await base44.entities.MensagemWhatsapp.filter(
        { conversa_id: conversaId }, '-data_envio', 300
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
        queryClient.setQueryData(['mensagens-funil', conversaId], (old = []) => {
          if (old.some(m => m.id === msgData.id)) return old;
          const base = msgData.remetente === 'vendedor' ? old.filter(m => !m.id?.startsWith('temp_')) : old;
          return [...base, msgData];
        });
        setTimeout(() => scrollToBottom(), 50);
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
    if (mensagens.length) setTimeout(() => scrollToBottom(), 100);
  }, [mensagens]);

  const enviarMutation = useMutation({
    mutationFn: async ({ texto, arquivo }) => {
      let conversaAtual = conversa;
      
      // Se não existe conversa, criar uma nova
      if (!conversaAtual) {
        const tel = contato.telefone.replace(/\D/g, '');
        conversaAtual = await base44.entities.ConversaWhatsapp.create({
          empresa_id: currentUser.empresa_id,
          cliente_telefone: tel,
          cliente_nome: contato.nome || tel,
          status: 'ativa',
          ultima_mensagem: '',
          data_ultima_mensagem: new Date().toISOString(),
          tipo_conexao: 'empresa',
        });
        // Atualizar o cache da conversa
        queryClient.setQueryData(['conversa-funil', contato?.telefone, currentUser?.empresa_id], conversaAtual);
      }

      const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversaAtual.id,
        mensagem_texto: texto,
        numero_cliente: conversaAtual.cliente_telefone,
        empresa_id: currentUser.empresa_id,
        arquivo,
      });
      if (!resp?.data?.success) throw new Error(resp?.data?.error || 'Erro ao enviar');
      return { ...resp.data, conversaId: conversaAtual.id };
    },
    onMutate: async ({ texto, arquivo }) => {
      if (!conversaId) return {}; // Conversa será criada no mutationFn
      const qk = ['mensagens-funil', conversaId];
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData(qk);
      let tipoConteudo = 'texto';
      if (arquivo?.tipo?.includes('image')) tipoConteudo = 'imagem';
      else if (arquivo?.tipo?.includes('audio')) tipoConteudo = 'audio';
      else if (arquivo?.tipo?.includes('pdf')) tipoConteudo = 'pdf';
      queryClient.setQueryData(qk, (old = []) => [...old, {
        id: `temp_${Date.now()}`, conversa_id: conversaId, remetente: 'vendedor',
        tipo_conteudo: tipoConteudo, texto: texto || arquivo?.nome || 'Arquivo',
        data_envio: new Date().toISOString(), status: 'pendente',
      }]);
      return { previous, qk };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.qk, ctx.previous);
      toast.error(err.message);
    },
    onSuccess: async (data, vars) => {
      const cidAtual = data?.conversaId || conversaId;
      if (cidAtual) {
        await base44.entities.ConversaWhatsapp.update(cidAtual, {
          ultima_mensagem: vars.texto || vars.arquivo?.nome || '',
          data_ultima_mensagem: new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: ['mensagens-funil', cidAtual] });
        queryClient.invalidateQueries({ queryKey: ['conversa-funil', contato?.telefone, currentUser?.empresa_id] });
      }
    },
  });

  const moverEtapaMutation = useMutation({
    mutationFn: async (etapaId) => {
      const etapa = etapas.find(e => e.id === etapaId);
      await base44.entities.Oportunidade.update(oportunidade.id, {
        empresa_id: oportunidade.empresa_id,
        titulo: oportunidade.titulo,
        vendedor_id: oportunidade.vendedor_id,
        etapa_id: etapaId,
        etapa_nome: etapa?.nome || '',
        data_ultima_movimentacao: new Date().toISOString(),
        status: etapa?.tipo === 'ganho' ? 'ganha' : etapa?.tipo === 'perdida' ? 'perdida' : 'aberta',
      });
      await base44.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidade.id,
        etapa_origem_id: oportunidade.etapa_id,
        etapa_origem_nome: oportunidade.etapa_nome || '',
        etapa_destino_id: etapaId,
        etapa_destino_nome: etapa?.nome || '',
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
      });
    },
    onSuccess: () => {
      toast.success('Etapa alterada!');
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      onOportunidadeChanged?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const transferirMutation = useMutation({
    mutationFn: async (responsavelId) => {
      const v = vendedores.find(x => x.id === responsavelId);
      await base44.entities.Oportunidade.update(oportunidade.id, {
        empresa_id: oportunidade.empresa_id,
        titulo: oportunidade.titulo,
        etapa_id: oportunidade.etapa_id,
        vendedor_id: responsavelId,
        vendedor_nome: v?.nome || v?.razao_social || '',
        foto_perfil_responsavel: v?.foto_perfil || '',
        data_ultima_movimentacao: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success('Responsável alterado!');
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      onOportunidadeChanged?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const criarTarefaMutation = useMutation({
    mutationFn: async (titulo) => {
      await base44.entities.Tarefa.create({
        empresa_id: oportunidade.empresa_id,
        titulo,
        descricao: `Retorno para lead: ${oportunidade.titulo}`,
        responsavel_principal_id: oportunidade.vendedor_id,
        status: 'pendente',
        prioridade: 'alta',
        created_by: currentUser.email,
      });
    },
    onSuccess: () => {
      toast.success('Tarefa criada!');
      setTituloTarefa('');
      setCriandoTarefa(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const notificarMutation = useMutation({
    mutationFn: async () => {
      // Notificar via comentário na oportunidade
      await base44.entities.ComentarioOportunidade.create({
        oportunidade_id: oportunidade.id,
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        mensagem: `🔔 Notificação manual: atenção ao lead ${oportunidade.titulo} (${oportunidade.etapa_nome})`,
        tipo: 'atividade',
      });
    },
    onSuccess: () => toast.success('Notificação criada!'),
    onError: (e) => toast.error(e.message),
  });

  const etapaAtual = etapas.find(e => e.id === oportunidade?.etapa_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-hidden flex [&>button]:text-white [&>button]:opacity-80 [&>button:hover]:opacity-100"
        style={{ maxWidth: painelAberto ? '900px' : '680px', width: '95vw', height: '85vh', maxHeight: '720px' }}
      >
        {/* COLUNA CHAT */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#075e54] text-white flex-shrink-0">
            <AvatarContato contato={contato} className="w-9 h-9 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{contato?.nome}</p>
              <p className="text-xs text-white/70 truncate">{contato?.telefone}</p>
            </div>
            <div className="flex items-center gap-1">
              <Badge className="bg-white/20 text-white text-xs border-0 px-2">{oportunidade?.etapa_nome || 'Lead'}</Badge>
              {conversa && (
                <a href={`https://wa.me/${contato?.telefone?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Abrir WhatsApp">
                  <Phone className="w-4 h-4" />
                </a>
              )}
              <button onClick={() => setPainelAberto(!painelAberto)}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Painel do lead">
                {painelAberto ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-hidden flex flex-col" style={{ backgroundImage: "url('https://web.whatsapp.com/img/bg-chat-tile-light_04fcacde539c58cca6745483d4858c52.png')", backgroundColor: '#e5ddd5' }}>
            {loadingConversa || loadingMensagens ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="w-8 h-8 animate-spin text-[#075e54]" />
              </div>
            ) : !conversa ? (
              <div className="flex items-center justify-center flex-1">
                <div className="bg-white rounded-xl px-6 py-5 text-center shadow-sm max-w-xs">
                  <p className="text-sm font-medium text-slate-700">Nenhuma conversa encontrada</p>
                  <p className="text-xs text-slate-400 mt-1">Este lead ainda não possui conversa no Bate-papo.</p>
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

          {/* Campo de envio - sempre visível */}
          <div className="flex-shrink-0 bg-white border-t">
            <EnviarMensagemForm
              onEnviar={async ({ texto, arquivo }) => { await enviarMutation.mutateAsync({ texto, arquivo }); }}
              isLoading={enviarMutation.isPending}
              nomeUsuario={currentUser?.full_name || ''}
            />
          </div>
        </div>

        {/* PAINEL LATERAL */}
        {painelAberto && (
          <div className="w-64 flex-shrink-0 border-l flex flex-col overflow-y-auto bg-slate-50">
            <div className="p-3 bg-[#1e3a5f] text-white">
              <p className="font-semibold text-sm">📋 Dados do Lead</p>
            </div>

            <div className="p-3 space-y-4 flex-1">
              {/* Infos */}
              <div className="space-y-1.5">
                <InfoRow label="Lead" value={oportunidade?.titulo} />
                <InfoRow label="Cliente" value={oportunidade?.cliente_nome} />
                <InfoRow label="Telefone" value={oportunidade?.telefone_lead} />
                <InfoRow label="Responsável" value={oportunidade?.vendedor_nome} />
                <InfoRow label="Valor" value={oportunidade?.valor_estimado ? `R$ ${Number(oportunidade.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null} />
                {etapaAtual && (
                  <InfoRow label="Etapa" value={
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: etapaAtual.cor || '#3b82f6' }} />
                      {etapaAtual.nome}
                    </span>
                  } />
                )}
                {oportunidade?.data_ultima_movimentacao && (
                  <InfoRow label="Última mov." value={format(new Date(oportunidade.data_ultima_movimentacao), 'dd/MM HH:mm')} />
                )}
              </div>

              <hr />

              {/* Mover Etapa */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><MoveHorizontal className="w-3.5 h-3.5" /> Mover Etapa</p>
                <Select value={novaEtapaId} onValueChange={setNovaEtapaId}>
                  <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Selecionar etapa..." /></SelectTrigger>
                  <SelectContent>
                    {etapas.filter(e => e.id !== oportunidade?.etapa_id).map(e => (
                      <SelectItem key={e.id} value={e.id} className="text-xs">{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {novaEtapaId && (
                  <Button size="sm" className="w-full mt-1.5 h-7 text-xs bg-[#1e3a5f] hover:bg-[#2a4a73]"
                    onClick={() => { moverEtapaMutation.mutate(novaEtapaId); setNovaEtapaId(''); }}
                    disabled={moverEtapaMutation.isPending}>
                    Confirmar
                  </Button>
                )}
              </div>

              {/* Ganho / Perdido */}
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1"
                  onClick={() => {
                    const etapaGanho = etapas.find(e => e.tipo === 'ganho');
                    if (etapaGanho) moverEtapaMutation.mutate(etapaGanho.id);
                    else toast.error('Nenhuma etapa de ganho configurada');
                  }}
                  disabled={moverEtapaMutation.isPending}>
                  <CheckCircle2 className="w-3 h-3" /> Ganho
                </Button>
                <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 gap-1"
                  onClick={() => {
                    const etapaPerdida = etapas.find(e => e.tipo === 'perdida');
                    if (etapaPerdida) moverEtapaMutation.mutate(etapaPerdida.id);
                    else toast.error('Nenhuma etapa de perda configurada');
                  }}
                  disabled={moverEtapaMutation.isPending}>
                  <XCircle className="w-3 h-3" /> Perdido
                </Button>
              </div>

              <hr />

              {/* Transferir */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Transferir</p>
                <Select value={novoResponsavelId} onValueChange={setNovoResponsavelId}>
                  <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Novo responsável..." /></SelectTrigger>
                  <SelectContent>
                    {vendedores.filter(v => v.id !== oportunidade?.vendedor_id).map(v => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">{v.nome || v.razao_social || v.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {novoResponsavelId && (
                  <Button size="sm" className="w-full mt-1.5 h-7 text-xs bg-[#1e3a5f] hover:bg-[#2a4a73]"
                    onClick={() => { transferirMutation.mutate(novoResponsavelId); setNovoResponsavelId(''); }}
                    disabled={transferirMutation.isPending}>
                    Confirmar
                  </Button>
                )}
              </div>

              <hr />

              {/* Criar Tarefa */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" /> Tarefa de Retorno</p>
                {!criandoTarefa ? (
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => setCriandoTarefa(true)}>
                    + Criar Tarefa
                  </Button>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      className="w-full border rounded px-2 py-1 text-xs"
                      placeholder="Título da tarefa..."
                      value={tituloTarefa}
                      onChange={e => setTituloTarefa(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && tituloTarefa && criarTarefaMutation.mutate(tituloTarefa)}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="flex-1 h-7 text-xs bg-[#1e3a5f]"
                        onClick={() => tituloTarefa && criarTarefaMutation.mutate(tituloTarefa)}
                        disabled={!tituloTarefa || criarTarefaMutation.isPending}>Salvar</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCriandoTarefa(false)}>✕</Button>
                    </div>
                  </div>
                )}
              </div>

              <hr />

              {/* Notificar */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> Notificação</p>
                <Button size="sm" variant="outline" className="w-full h-7 text-xs"
                  onClick={() => notificarMutation.mutate()}
                  disabled={notificarMutation.isPending}>
                  🔔 Notificar responsável
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-1 text-xs">
      <span className="text-slate-400 min-w-[60px] flex-shrink-0">{label}:</span>
      <span className="text-slate-700 font-medium truncate">{value}</span>
    </div>
  );
}
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { renderTextWithLinks } from '@/components/utils/renderTextWithLinks';
import { base44 } from '@/api/base44Client';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Send, Paperclip, AtSign, Smile, X, UserPlus, MessageSquare,
  ArrowRightLeft, FileText, ThumbsUp, Heart, HandMetal, Plus, Check
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const EMOJIS_REACAO = [
  { emoji: '👍', label: 'curtir' },
  { emoji: '❤️', label: 'amar' },
  { emoji: '👏', label: 'aplaudir' },
  { emoji: '😄', label: 'rir' },
  { emoji: '🎉', label: 'celebrar' },
];

const ACAO_ICONS = {
  criou: { icon: Plus, cor: 'bg-green-100 text-green-600' },
  moveu_status: { icon: ArrowRightLeft, cor: 'bg-blue-100 text-blue-600' },
  alterou_prazo: { icon: Check, cor: 'bg-yellow-100 text-yellow-600' },
  comentou: { icon: MessageSquare, cor: 'bg-slate-100 text-slate-600' },
  excluiu: { icon: X, cor: 'bg-red-100 text-red-600' },
  anexou: { icon: FileText, cor: 'bg-purple-100 text-purple-600' },
};

function getInitials(name = '') {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500'
];

function avatarColor(nome = '') {
  return AVATAR_COLORS[(nome.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

function UserAvatar({ nome, foto, size = 'md', showStatus = false, online = false, forceColor }) {
  const sz = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-11 w-11 text-base' : 'h-9 w-9 text-sm';
  const cor = forceColor || avatarColor(nome);
  return (
    <div className="relative flex-shrink-0">
      <Avatar className={sz}>
        {foto && <AvatarImage src={foto} />}
        <AvatarFallback className={`${cor} text-white font-bold`}>
          {getInitials(nome)}
        </AvatarFallback>
      </Avatar>
      {showStatus && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? 'bg-green-400' : 'bg-slate-300'}`} />
      )}
    </div>
  );
}

function formatarHora(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const agora = new Date();
    const diffH = (agora - d) / 1000 / 60 / 60;
    if (diffH < 24) return format(d, 'HH:mm');
    if (diffH < 168) return format(d, "EEE HH:mm", { locale: ptBR });
    return format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

function MensagemItem({ comentario, currentUser, colaboradores, onReagir, reacoesMap }) {
  const isMe = comentario.usuario_id === currentUser?.id;
  const [showReacoes, setShowReacoes] = useState(false);
  const reacoes = reacoesMap?.[comentario.id] || {};

  // Busca foto do colaborador
  const colab = colaboradores.find(c => c.id === comentario.usuario_id);
  const foto = colab?.foto_perfil || null;

  return (
    <div className={`flex gap-3 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      <UserAvatar
        nome={comentario.usuario_nome}
        foto={foto}
        size="sm"
        showStatus={false}
        forceColor={isMe ? undefined : 'bg-pink-500'}
      />

      <div className={`max-w-[72%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">
            {isMe ? 'Você' : (comentario.usuario_nome || 'Usuário')}
          </span>
          <span className="text-xs text-slate-400">{formatarHora(comentario.created_date)}</span>
        </div>

        <div className="relative">
          {/* Balão */}
          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
            isMe
              ? 'bg-[#1e3a5f] text-white rounded-tr-sm'
              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
          }`}>
            {renderTextWithLinks(comentario.mensagem, isMe ? 'text-blue-200 hover:text-blue-100' : 'text-blue-600 hover:text-blue-500')}
            {comentario.responsavel_mencionado_nome && (
              <div className={`mt-1.5 flex items-center gap-1 text-xs ${isMe ? 'text-blue-200' : 'text-blue-500'}`}>
                <AtSign className="w-3 h-3" />
                <span>{comentario.responsavel_mencionado_nome}</span>
              </div>
            )}
          </div>

          {/* Botão reação (hover) */}
          <button
            onClick={() => setShowReacoes(v => !v)}
            className={`absolute ${isMe ? 'left-0 -translate-x-full pl-0 pr-2' : 'right-0 translate-x-full pr-0 pl-2'} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity`}
          >
            <Smile className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>

          {/* Picker reações */}
          {showReacoes && (
            <div className={`absolute z-20 top-0 ${isMe ? 'right-full mr-2' : 'left-full ml-2'} bg-white border border-slate-200 rounded-full shadow-lg px-2 py-1 flex items-center gap-1`}>
              {EMOJIS_REACAO.map(r => (
                <button
                  key={r.emoji}
                  onClick={() => { onReagir(comentario.id, r.emoji); setShowReacoes(false); }}
                  className="text-base hover:scale-125 transition-transform px-1"
                  title={r.label}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reações acumuladas */}
        {Object.keys(reacoes).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(reacoes).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReagir(comentario.id, emoji)}
                className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-full px-2 py-0.5 transition-colors"
              >
                <span>{emoji}</span>
                <span className="text-slate-600 font-medium">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemHistorico({ item }) {
  const cfg = ACAO_ICONS[item.acao] || ACAO_ICONS.comentou;
  const Icon = cfg.icon;
  return (
    <div className="flex gap-3 items-start">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.cor}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0 pb-3 border-b border-slate-100 last:border-0">
        <p className="text-sm text-slate-700 leading-snug">{item.descricao}</p>
        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
          <span className="font-medium text-slate-500">{item.usuario_nome}</span>
          · {item.created_date ? formatDistanceToNow(new Date(item.created_date), { addSuffix: true, locale: ptBR }) : ''}
        </p>
      </div>
    </div>
  );
}

// Sidebar com participantes e atividade
function SidebarParticipantes({ tarefa, colaboradores, currentUser, onAdicionarParticipante }) {
  const [showAdd, setShowAdd] = useState(false);
  const [busca, setBusca] = useState('');

  let responsaveisIds = [];
  try { responsaveisIds = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []; } catch {}
  const responsavelPrincipal = colaboradores.find(c => c.id === tarefa.responsavel_principal_id);
  const participantes = responsaveisIds
    .filter(id => id !== tarefa.responsavel_principal_id)
    .map(id => colaboradores.find(c => c.id === id))
    .filter(Boolean);

  const disponiveis = colaboradores.filter(c =>
    !responsaveisIds.includes(c.id) &&
    c.nome?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="w-64 flex-shrink-0 bg-slate-50 border-l flex flex-col overflow-y-auto">
      {/* Card Participantes */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Participantes</h4>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
            title="Adicionar participante"
          >
            <UserPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Responsável principal */}
        {responsavelPrincipal && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-1.5">Responsável Principal</p>
            <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-100 rounded-xl">
              <UserAvatar nome={responsavelPrincipal.nome} foto={responsavelPrincipal.foto_perfil} size="sm" showStatus />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{responsavelPrincipal.nome}</p>
                <span className="text-xs text-blue-500 font-medium">Principal</span>
              </div>
            </div>
          </div>
        )}

        {/* Participantes */}
        {participantes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400 mb-1">Participantes</p>
            {participantes.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50 group">
                <UserAvatar nome={c.nome} foto={c.foto_perfil} size="sm" showStatus />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{c.nome}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Adicionar participante */}
        {showAdd && (
          <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <input
              autoFocus
              type="text"
              placeholder="Buscar..."
              className="w-full text-xs px-3 py-2 border-b border-slate-100 outline-none"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            <div className="max-h-36 overflow-y-auto">
              {disponiveis.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">Nenhum colaborador</p>
              )}
              {disponiveis.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onAdicionarParticipante(c); setShowAdd(false); setBusca(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                >
                  <UserAvatar nome={c.nome} foto={c.foto_perfil} size="sm" />
                  <span className="text-xs text-slate-700 truncate">{c.nome}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Card Atividade Recente */}
      <div className="p-4 flex-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Atividade Recente</h4>
        <RecentActivity tarefaId={tarefa.id} />
      </div>
    </div>
  );
}

function RecentActivity({ tarefaId }) {
  const { data: historico = [] } = useQuery({
    queryKey: ['historico-tarefa-sidebar', tarefaId],
    enabled: !!tarefaId,
    queryFn: () => base44.entities.TarefaHistorico.filter({ tarefa_id: tarefaId }, '-created_date', 5),
    refetchInterval: 30000,
  });

  if (historico.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-4">Nenhuma atividade</p>;
  }

  return (
    <div className="space-y-3">
      {historico.map(h => {
        const cfg = ACAO_ICONS[h.acao] || ACAO_ICONS.comentou;
        const Icon = cfg.icon;
        return (
          <div key={h.id} className="flex gap-2 items-start">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.cor}`}>
              <Icon className="w-3 h-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-600 leading-snug line-clamp-2">{h.descricao}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {h.created_date ? formatDistanceToNow(new Date(h.created_date), { addSuffix: true, locale: ptBR }) : ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ColaboracaoInterna({ tarefa, currentUser, colaboradores = [], onUpdate }) {
  const [novoComentario, setNovoComentario] = useState('');
  const [showSelectResp, setShowSelectResp] = useState(false);
  const [responsavelMencionar, setResponsavelMencionar] = useState(null);
  const [filtroColab, setFiltroColab] = useState('');
  const [reacoesLocais, setReacoesLocais] = useState({});
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: comentarios = [], isLoading } = useQuery({
    queryKey: ['comentarios-tarefa', tarefa?.id],
    enabled: !!tarefa?.id,
    queryFn: () => base44.entities.ComentarioTarefa.filter({ tarefa_id: tarefa.id }, 'created_date'),
    refetchInterval: 15000,
  });

  const { data: historico = [] } = useQuery({
    queryKey: ['historico-tarefa', tarefa?.id],
    enabled: !!tarefa?.id,
    queryFn: () => base44.entities.TarefaHistorico.filter({ tarefa_id: tarefa.id }, '-created_date', 20),
  });

  // Timeline unificada: comentários + histórico
  const timeline = [
    ...comentarios.map(c => ({ ...c, _tipo: 'comentario' })),
    ...historico.map(h => ({ ...h, _tipo: 'historico' })),
  ].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  const enviarComentario = useMutation({
    mutationFn: async () => {
      if (!novoComentario.trim()) return;
      const texto = novoComentario.trim();
      const remetenteId = currentUser?.id;
      const remetenteNome = currentUser?.nome_perfil || currentUser?.full_name || '';

      await base44.entities.ComentarioTarefa.create({
        tarefa_id: tarefa.id,
        empresa_id: tarefa.empresa_id,
        usuario_id: remetenteId,
        usuario_nome: remetenteNome,
        mensagem: texto,
        tipo: 'comentario',
        responsavel_mencionado_id: responsavelMencionar?.id || null,
        responsavel_mencionado_nome: responsavelMencionar?.nome || null,
      });

      // Coletar todos os participantes da tarefa (principal + responsáveis adicionais)
      let responsaveisIds = [];
      try { responsaveisIds = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []; } catch {}
      const todosIds = new Set([
        tarefa.responsavel_principal_id,
        ...responsaveisIds,
      ].filter(Boolean));

      // Notificar todos exceto o próprio remetente
      const destinatarios = [...todosIds]
        .filter(id => id !== remetenteId)
        .map(id => colaboradores.find(c => c.id === id))
        .filter(Boolean);

      await Promise.all(destinatarios.map(dest =>
        base44.entities.AlertaTarefa.create({
          empresa_id: tarefa.empresa_id,
          tarefa_id: tarefa.id,
          tarefa_titulo: tarefa.titulo,
          comentario_texto: texto,
          destinatario_id: dest.id,
          destinatario_nome: dest.nome,
          remetente_id: remetenteId,
          remetente_nome: remetenteNome,
          lido: false,
        })
      ));
    },
    onSuccess: () => {
      setNovoComentario('');
      setResponsavelMencionar(null);
      queryClient.invalidateQueries({ queryKey: ['comentarios-tarefa', tarefa?.id] });
    },
  });

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarComentario.mutate();
    }
  };

  const handleReagir = (comentarioId, emoji) => {
    setReacoesLocais(prev => {
      const atual = prev[comentarioId] || {};
      const count = (atual[emoji] || 0) + 1;
      return { ...prev, [comentarioId]: { ...atual, [emoji]: count } };
    });
  };

  const handleAdicionarParticipante = async (colab) => {
    let ids = [];
    try { ids = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []; } catch {}
    if (ids.includes(colab.id)) return;
    const novosIds = [...ids, colab.id];
    let nomes = [];
    try { nomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
    const novosNomes = [...nomes, colab.nome];
    await onUpdate(tarefa.id, {
      responsaveis_ids: JSON.stringify(novosIds),
      responsaveis_nomes: JSON.stringify(novosNomes),
    });
  };

  const handleAnexarArquivo = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEnviandoArquivo(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const mensagem = `📎 [${file.name}](${file_url})`;
        await base44.entities.ComentarioTarefa.create({
          tarefa_id: tarefa.id,
          empresa_id: tarefa.empresa_id,
          usuario_id: currentUser?.id,
          usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
          mensagem,
          tipo: 'comentario',
          responsavel_mencionado_id: responsavelMencionar?.id || null,
          responsavel_mencionado_nome: responsavelMencionar?.nome || null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['comentarios-tarefa', tarefa?.id] });
    } finally {
      setEnviandoArquivo(false);
      e.target.value = '';
    }
  };

  const colabsFiltrados = colaboradores.filter(c =>
    c.nome?.toLowerCase().includes(filtroColab.toLowerCase())
  );

  if (!tarefa) return null;

  return (
    <div className="flex overflow-hidden flex-1" style={{ minHeight: '400px' }}>
      {/* Área principal: Timeline + Input */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50">
          {isLoading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && timeline.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <MessageSquare className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm font-medium">Nenhuma atividade ainda</p>
              <p className="text-xs mt-1">Seja o primeiro a comentar nesta tarefa</p>
            </div>
          )}

          {timeline.map(item => {
            if (item._tipo === 'comentario') {
              return (
                <MensagemItem
                  key={`c-${item.id}`}
                  comentario={item}
                  currentUser={currentUser}
                  colaboradores={colaboradores}
                  onReagir={handleReagir}
                  reacoesMap={reacoesLocais}
                />
              );
            }
            // Item de histórico (evento de sistema)
            return (
              <div key={`h-${item.id}`} className="flex justify-center">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-1.5 text-xs text-slate-500 shadow-sm">
                  {(() => {
                    const cfg = ACAO_ICONS[item.acao] || ACAO_ICONS.comentou;
                    const Icon = cfg.icon;
                    return <Icon className="w-3 h-3 text-slate-400" />;
                  })()}
                  <span>{item.descricao}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400">{formatarHora(item.created_date)}</span>
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* Menção selecionada */}
        {responsavelMencionar && (
          <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
            <AtSign className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-700 flex-1">
              Notificando: <strong>{responsavelMencionar.nome}</strong>
            </span>
            <button onClick={() => setResponsavelMencionar(null)} className="text-blue-400 hover:text-blue-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Painel selecionar menção */}
        {showSelectResp && (
          <div className="border-t bg-white px-4 py-3 max-h-44 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600">Mencionar participante</span>
              <button onClick={() => setShowSelectResp(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Buscar colaborador..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 mb-2 outline-none focus:border-slate-400"
              value={filtroColab}
              onChange={e => setFiltroColab(e.target.value)}
            />
            {colabsFiltrados.map(c => (
              <button
                key={c.id}
                onClick={() => { setResponsavelMencionar(c); setShowSelectResp(false); setFiltroColab(''); }}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 text-left"
              >
                <UserAvatar nome={c.nome} foto={c.foto_perfil} size="sm" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{c.nome}</p>
                </div>
              </button>
            ))}
            {colabsFiltrados.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">Nenhum colaborador encontrado</p>
            )}
          </div>
        )}

        {/* Input area */}
        <div className="border-t bg-white px-4 py-3 flex-shrink-0">
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm focus-within:border-blue-300 focus-within:shadow-md transition-all">
            <textarea
              ref={textareaRef}
              rows={2}
              className="w-full text-sm px-4 pt-3 pb-1 outline-none placeholder:text-slate-400 bg-transparent resize-none leading-5"
              placeholder="Escreva um comentário... (Enter para enviar)"
              value={novoComentario}
              onChange={e => {
                setNovoComentario(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleKeyDown}
              style={{ minHeight: '44px' }}
            />
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-0.5">
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleAnexarArquivo} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={enviandoArquivo}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                  title="Anexar arquivo"
                >
                  {enviandoArquivo
                    ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    : <Paperclip className="w-4 h-4" />
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setShowSelectResp(v => !v)}
                  className={`p-2 rounded-lg transition-colors ${showSelectResp || responsavelMencionar ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                  title="Mencionar"
                >
                  <AtSign className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Emoji"
                >
                  <Smile className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={!novoComentario.trim() || enviarComentario.isPending}
                onClick={() => enviarComentario.mutate()}
                className="h-9 w-9 rounded-full bg-[#1e3a5f] hover:bg-[#2a4a73] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar direita */}
      <SidebarParticipantes
        tarefa={tarefa}
        colaboradores={colaboradores}
        currentUser={currentUser}
        onAdicionarParticipante={handleAdicionarParticipante}
      />
    </div>
  );
}
import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Send, Paperclip, AtSign, Smile, X, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { renderTextWithLinks } from '@/components/utils/renderTextWithLinks';

function getInitials(name = '') {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

const AVATAR_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
function avatarColor(nome = '') { return AVATAR_COLORS[(nome.charCodeAt(0) || 0) % AVATAR_COLORS.length]; }

function UserAvatar({ nome, foto, size = 'sm', forceColor }) {
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  const cor = forceColor || avatarColor(nome);
  return (
    <Avatar className={`${sz} flex-shrink-0`}>
      {foto && <AvatarImage src={foto} />}
      <AvatarFallback className={`${cor} text-white font-bold`}>{getInitials(nome)}</AvatarFallback>
    </Avatar>
  );
}

function formatarHora(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const agora = new Date();
    const diffH = (agora - d) / 1000 / 60 / 60;
    if (diffH < 24) return format(d, 'HH:mm');
    return format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

export default function OportunidadeAbaComentarios({ oportunidade, currentUser, colaboradores = [] }) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [mencao, setMencao] = useState(null);
  const [showMencao, setShowMencao] = useState(false);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const { data: comentarios = [], isLoading } = useQuery({
    queryKey: ['comentarios-oportunidade', oportunidade?.id],
    queryFn: () => base44.entities.ComentarioOportunidade.filter({ oportunidade_id: oportunidade.id }, 'created_date'),
    enabled: !!oportunidade?.id,
    refetchInterval: 15000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comentarios.length]);

  const enviar = useMutation({
    mutationFn: async () => {
      if (!texto.trim()) return;
      await base44.entities.ComentarioOportunidade.create({
        oportunidade_id: oportunidade.id,
        empresa_id: oportunidade.empresa_id,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
        mensagem: texto.trim(),
        tipo: 'comentario',
        responsavel_mencionado_id: mencao?.id || null,
        responsavel_mencionado_nome: mencao?.nome || null,
      });
    },
    onSuccess: () => {
      setTexto('');
      setMencao(null);
      queryClient.invalidateQueries({ queryKey: ['comentarios-oportunidade', oportunidade?.id] });
    },
  });

  const handleAnexar = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEnviandoArquivo(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const msg = `📎 [${file.name}](${file_url})`;
        await base44.entities.ComentarioOportunidade.create({
          oportunidade_id: oportunidade.id,
          empresa_id: oportunidade.empresa_id,
          usuario_id: currentUser?.id,
          usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
          mensagem: msg, tipo: 'comentario',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['comentarios-oportunidade', oportunidade?.id] });
    } finally {
      setEnviandoArquivo(false);
      e.target.value = '';
    }
  };

  const colabsFiltrados = colaboradores.filter(c =>
    c.nome?.toLowerCase().includes(filtroBusca.toLowerCase())
  );

  return (
    <div className="flex overflow-hidden" style={{ height: '500px' }}>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50">
          {isLoading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          {!isLoading && comentarios.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <MessageSquare className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm font-medium">Nenhum comentário ainda</p>
              <p className="text-xs mt-1">Seja o primeiro a comentar</p>
            </div>
          )}
          {comentarios.map(c => {
            const isMe = c.usuario_id === currentUser?.id;
            const colab = colaboradores.find(x => x.id === c.usuario_id || x.user_id === c.usuario_id);
            const foto = colab?.foto_perfil || null;
            return (
              <div key={c.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <UserAvatar nome={c.usuario_nome} foto={foto} size="sm" forceColor={isMe ? undefined : 'bg-pink-500'} />
                <div className={`max-w-[72%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {isMe ? 'Você' : (c.usuario_nome || 'Usuário')}
                    </span>
                    <span className="text-xs text-slate-400">{formatarHora(c.created_date)}</span>
                  </div>
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                    isMe ? 'bg-[#1e3a5f] text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                  }`}>
                    {renderTextWithLinks(c.mensagem, isMe ? 'text-blue-200' : 'text-blue-600')}
                    {c.responsavel_mencionado_nome && (
                      <div className={`mt-1.5 flex items-center gap-1 text-xs ${isMe ? 'text-blue-200' : 'text-blue-500'}`}>
                        <AtSign className="w-3 h-3" />
                        <span>{c.responsavel_mencionado_nome}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Menção */}
        {mencao && (
          <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
            <AtSign className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-blue-700 flex-1">Notificando: <strong>{mencao.nome}</strong></span>
            <button onClick={() => setMencao(null)} className="text-blue-400 hover:text-blue-600"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Selecionar menção */}
        {showMencao && (
          <div className="border-t bg-white px-4 py-3 max-h-44 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600">Mencionar participante</span>
              <button onClick={() => setShowMencao(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button>
            </div>
            <input
              autoFocus type="text" placeholder="Buscar colaborador..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 mb-2 outline-none focus:border-slate-400"
              value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)}
            />
            {colabsFiltrados.map(c => (
              <button key={c.id} onClick={() => { setMencao(c); setShowMencao(false); setFiltroBusca(''); }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-left">
                <UserAvatar nome={c.nome} foto={c.foto_perfil} size="sm" />
                <span className="text-sm font-medium text-slate-700">{c.nome}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t bg-white px-4 py-3 flex-shrink-0">
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm focus-within:border-blue-300 transition-all">
            <textarea
              rows={2}
              className="w-full text-sm px-4 pt-3 pb-1 outline-none placeholder:text-slate-400 bg-transparent resize-none leading-5"
              placeholder="Escreva um comentário... (Enter para enviar)"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar.mutate(); } }}
              style={{ minHeight: '44px' }}
            />
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-0.5">
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleAnexar} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={enviandoArquivo}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  {enviandoArquivo ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => setShowMencao(v => !v)}
                  className={`p-2 rounded-lg transition-colors ${showMencao || mencao ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                  <AtSign className="w-4 h-4" />
                </button>
              </div>
              <button type="button" disabled={!texto.trim() || enviar.isPending} onClick={() => enviar.mutate()}
                className="h-9 w-9 rounded-full bg-[#1e3a5f] hover:bg-[#2a4a73] text-white flex items-center justify-center disabled:opacity-40 transition-all shadow-sm">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
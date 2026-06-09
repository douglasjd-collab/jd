import React, { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Paperclip, AtSign, Smile, X, UserPlus } from 'lucide-react';
import { format } from 'date-fns';

function getInitials(name = '') {
  const parts = (name || '').trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

function formatarHora(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

export default function ComentariosWhatsApp({
  comentarios, currentUser, novoComentario, setNovoComentario,
  onEnviar, enviando, colaboradores = []
}) {
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showSelectResp, setShowSelectResp] = useState(false);
  const [responsavelSelecionado, setResponsavelSelecionado] = useState(null);
  const [filtroColab, setFiltroColab] = useState('');

  const ordenados = [...comentarios].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comentarios]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  const handleEnviar = () => {
    if (!novoComentario.trim()) return;
    onEnviar(responsavelSelecionado);
    setResponsavelSelecionado(null);
    setFiltroColab('');
  };

  const colabsFiltrados = colaboradores.filter(c =>
    c.nome?.toLowerCase().includes(filtroColab.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-2xl">
      {/* Lista de mensagens */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {ordenados.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">Nenhum comentário ainda</p>
        )}

        {ordenados.map(c => {
          const isMe = c.usuario_id === currentUser?.id || c.usuario_nome === (currentUser?.full_name || currentUser?.nome_perfil);
          return (
            <div key={c.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar */}
              <Avatar className="h-9 w-9 flex-shrink-0">
                {c.usuario_foto && <AvatarImage src={c.usuario_foto} />}
                <AvatarFallback className="bg-[#1e3a5f] text-white text-xs font-bold">
                  {getInitials(c.usuario_nome)}
                </AvatarFallback>
              </Avatar>

              <div className={`max-w-[68%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Nome */}
                <span className="text-xs font-semibold text-slate-500 px-1">
                  {isMe ? 'Você' : c.usuario_nome}
                </span>

                {/* Balão */}
                <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words shadow-sm ${
                  isMe
                    ? 'bg-slate-200 text-slate-800 rounded-tr-sm'
                    : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                }`}>
                  {c.mensagem}
                  {c.responsavel_mencionado_nome && (
                    <div className="mt-1.5 text-xs flex items-center gap-1 text-blue-500">
                      <UserPlus className="w-3 h-3" />
                      <span>Para: {c.responsavel_mencionado_nome}</span>
                    </div>
                  )}
                </div>

                {/* Hora + check */}
                <div className={`flex items-center gap-1 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-xs text-slate-400">{formatarHora(c.created_date)}</span>
                  {isMe && (
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M1.5 12.5l5 5L20.5 6M7 12.5l5 5L20.5 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Responsável selecionado */}
      {responsavelSelecionado && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
          <UserPlus className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700 flex-1">Notificando: <strong>{responsavelSelecionado.nome}</strong></span>
          <button onClick={() => setResponsavelSelecionado(null)} className="text-blue-400 hover:text-blue-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Painel selecionar responsável */}
      {showSelectResp && (
        <div className="border-t bg-white px-4 py-3 max-h-44 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">Selecionar para notificar</span>
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
              onClick={() => { setResponsavelSelecionado(c); setShowSelectResp(false); setFiltroColab(''); }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-left"
            >
              <Avatar className="h-6 w-6 flex-shrink-0">
                {c.foto_perfil && <AvatarImage src={c.foto_perfil} />}
                <AvatarFallback className="text-xs bg-slate-200">{getInitials(c.nome)}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-slate-700">{c.nome}</span>
            </button>
          ))}
          {colabsFiltrados.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Nenhum colaborador encontrado</p>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="border-t bg-white px-4 py-3 flex-shrink-0">
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <textarea
            rows={2}
            className="w-full text-sm px-4 pt-3 pb-1 outline-none placeholder:text-slate-400 bg-transparent resize-none leading-5"
            placeholder="Escreva um comentário..."
            value={novoComentario}
            onChange={e => {
              setNovoComentario(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            style={{ minHeight: '44px' }}
          />
          {/* Barra inferior do input */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1">
              {/* Anexo */}
              <input type="file" ref={fileInputRef} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Anexar arquivo"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {/* Mencionar responsável */}
              <button
                type="button"
                onClick={() => setShowSelectResp(v => !v)}
                className={`p-1.5 rounded-lg transition-colors ${showSelectResp || responsavelSelecionado ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                title="Notificar responsável"
              >
                <AtSign className="w-4 h-4" />
              </button>
              {/* Emoji placeholder */}
              <button
                type="button"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Emoji"
              >
                <Smile className="w-4 h-4" />
              </button>
            </div>

            {/* Botão enviar */}
            <button
              type="button"
              disabled={!novoComentario.trim() || enviando}
              onClick={handleEnviar}
              className="h-9 w-9 rounded-full bg-[#1e3a5f] hover:bg-[#2a4a73] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
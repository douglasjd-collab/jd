import React, { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { format } from 'date-fns';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

function formatarHora(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const hoje = new Date();
    const isHoje = d.toDateString() === hoje.toDateString();
    return isHoje ? format(d, 'HH:mm') : format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

export default function ComentariosWhatsApp({ comentarios, currentUser, novoComentario, setNovoComentario, onEnviar, enviando }) {
  const bottomRef = useRef(null);

  // Ordena do mais antigo para o mais novo (estilo chat)
  const ordenados = [...comentarios].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comentarios]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnviar();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Lista de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50">
        {ordenados.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Nenhum comentário ainda</p>
        )}
        {ordenados.map(c => {
          const isMe = c.usuario_id === currentUser?.id || c.usuario_nome === (currentUser?.full_name || currentUser?.nome_perfil);
          return (
            <div key={c.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {!isMe && (
                <Avatar className="h-7 w-7 flex-shrink-0 mt-1">
                  <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                    {getInitials(c.usuario_nome)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                {!isMe && (
                  <span className="text-xs font-semibold text-slate-600 px-1">{c.usuario_nome}</span>
                )}
                <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                  isMe
                    ? 'bg-[#1e3a5f] text-white rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                }`}>
                  {c.mensagem}
                </div>
                <span className="text-xs text-slate-400 px-1">{formatarHora(c.created_date)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input fixo no fundo */}
      <div className="border-t bg-white px-3 py-3 flex gap-2 items-end flex-shrink-0">
        <textarea
          rows={1}
          className="flex-1 text-sm border border-slate-200 rounded-2xl px-4 py-2 outline-none focus:border-slate-400 placeholder:text-slate-400 bg-slate-50 resize-none overflow-hidden leading-5"
          placeholder="Escreva um comentário..."
          value={novoComentario}
          onChange={e => {
            setNovoComentario(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onKeyDown={handleKeyDown}
          style={{ minHeight: '36px' }}
        />
        <Button
          size="icon"
          className="h-9 w-9 rounded-full bg-[#1e3a5f] hover:bg-[#2a4a73] text-white flex-shrink-0"
          disabled={!novoComentario.trim() || enviando}
          onClick={onEnviar}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
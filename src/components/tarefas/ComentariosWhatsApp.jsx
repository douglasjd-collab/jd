import React, { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Send, UserPlus, X } from 'lucide-react';
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

export default function ComentariosWhatsApp({
  comentarios, currentUser, novoComentario, setNovoComentario,
  onEnviar, enviando, colaboradores = []
}) {
  const bottomRef = useRef(null);
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
    c.nome?.toLowerCase().includes(filtroColab.toLowerCase()) &&
    c.id !== currentUser?.colaborador_id
  );

  return (
    <div className="flex flex-col h-full">
      {/* Lista de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-slate-50">
        {ordenados.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Nenhum comentário ainda</p>
        )}
        {ordenados.map(c => {
          const isMe = c.usuario_id === currentUser?.id || c.usuario_nome === (currentUser?.full_name || currentUser?.nome_perfil);
          return (
            <div key={c.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar */}
              <Avatar className="h-8 w-8 flex-shrink-0 mt-1">
                {c.usuario_foto && <img src={c.usuario_foto} alt="" className="w-full h-full object-cover rounded-full" />}
                <AvatarFallback className={`text-xs ${isMe ? 'bg-[#1e3a5f] text-white' : 'bg-blue-100 text-blue-700'}`}>
                  {getInitials(c.usuario_nome)}
                </AvatarFallback>
              </Avatar>

              <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Nome acima do balão */}
                <span className={`text-xs font-semibold px-1 ${isMe ? 'text-slate-500' : 'text-slate-600'}`}>
                  {isMe ? 'Você' : c.usuario_nome}
                </span>

                <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                  isMe
                    ? 'bg-[#1e3a5f] text-white rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                }`}>
                  {c.mensagem}
                  {/* Badge responsável mencionado */}
                  {c.responsavel_mencionado_nome && (
                    <div className={`mt-1.5 text-xs flex items-center gap-1 ${isMe ? 'text-blue-200' : 'text-blue-600'}`}>
                      <UserPlus className="w-3 h-3" />
                      <span>Para: {c.responsavel_mencionado_nome}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-400 px-1">{formatarHora(c.created_date)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Responsável selecionado */}
      {responsavelSelecionado && (
        <div className="border-t bg-blue-50 px-4 py-2 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs text-blue-700 font-medium flex-1">
            Notificar: <strong>{responsavelSelecionado.nome}</strong>
          </span>
          <button onClick={() => setResponsavelSelecionado(null)} className="text-blue-400 hover:text-blue-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Painel seleção de responsável */}
      {showSelectResp && (
        <div className="border-t bg-white px-3 py-3 shadow-inner max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">Selecionar responsável para notificar</span>
            <button onClick={() => setShowSelectResp(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 mb-2 outline-none focus:border-slate-400"
            value={filtroColab}
            onChange={e => setFiltroColab(e.target.value)}
          />
          {colabsFiltrados.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Nenhum colaborador encontrado</p>
          )}
          {colabsFiltrados.map(c => (
            <button
              key={c.id}
              onClick={() => { setResponsavelSelecionado(c); setShowSelectResp(false); setFiltroColab(''); }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-left"
            >
              <Avatar className="h-6 w-6 flex-shrink-0">
                {c.foto_perfil && <img src={c.foto_perfil} alt="" className="w-full h-full object-cover rounded-full" />}
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(c.nome)}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-slate-700">{c.nome}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input fixo no fundo */}
      <div className="border-t bg-white px-3 py-3 flex gap-2 items-end flex-shrink-0">
        {/* Botão adicionar responsável */}
        <button
          type="button"
          title="Notificar responsável"
          onClick={() => setShowSelectResp(v => !v)}
          className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors ${
            showSelectResp || responsavelSelecionado
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-400'
          }`}
        >
          <UserPlus className="w-4 h-4" />
        </button>

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
          onClick={handleEnviar}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
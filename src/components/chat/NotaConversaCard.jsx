import React from 'react';
import { Pencil, Trash2, Lock, StickyNote } from 'lucide-react';

export default function NotaConversaCard({nota, user, onEditar, onExcluir}) {
  const propria = nota.created_by === user?.email;
  const privada = nota.visibilidade === 'privada';
  return <article className="mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-amber-950 shadow-sm">
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1 font-semibold">{privada ? <Lock size={13}/> : <StickyNote size={13}/>}
        {privada ? 'Nota privada · somente para você' : 'Nota interna · equipe'}</span>
      {propria && <div className="flex gap-2">
        <button type="button" aria-label="Editar nota" onClick={() => onEditar(nota)}><Pencil size={14}/></button>
        <button type="button" aria-label="Excluir nota" onClick={() => onExcluir(nota)}><Trash2 size={14}/></button>
      </div>}
    </div>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{nota.texto}</p>
    <p className="mt-2 text-[11px] text-amber-800">{nota.autor_nome} · {new Date(nota.created_date).toLocaleString('pt-BR')}{nota.editada_em ? ' · editada' : ''}</p>
  </article>;
}

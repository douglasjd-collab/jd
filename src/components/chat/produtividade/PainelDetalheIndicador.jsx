import React from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Painel lateral exibido ao clicar em um indicador — lista as conversas por trás do número
// e permite agir diretamente (abrir, assumir, finalizar).
export default function PainelDetalheIndicador({ titulo, itens, onClose, onAbrirConversa, onAssumir, onFinalizar }) {
  if (!titulo) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex justify-end" onClick={e => e.target === e.currentTarget && onClose()} style={{ background: 'rgba(0,0,0,.4)' }}>
      <div className="w-full max-w-md h-full overflow-y-auto" style={{ background: '#0b0f14', color: '#e2eaf4' }}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: '#111720', borderBottom: '1px solid #1e2a38' }}>
          <div>
            <h3 className="font-bold text-sm">{titulo}</h3>
            <p className="text-xs" style={{ color: '#5a7190' }}>{itens.length} conversa{itens.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5"><X className="w-4 h-4" style={{ color: '#5a7190' }} /></button>
        </div>
        <div className="p-4 space-y-2">
          {itens.length === 0 && <p className="text-center text-xs py-8" style={{ color: '#5a7190' }}>Nenhuma conversa encontrada</p>}
          {itens.map(item => (
            <div key={item.id} className="rounded-xl p-3" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{item.cliente}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,158,255,.12)', color: '#3b9eff' }}>{item.canal}</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: '#5a7190' }}>{item.telefone} · Vendedor: {item.vendedor}</p>
              <p className="text-xs mt-1 truncate" style={{ color: '#8296b0' }}>{item.ultimaMensagem}</p>
              <div className="flex items-center justify-between mt-1.5 text-[10px]" style={{ color: '#3a5068' }}>
                <span>{item.dataHora ? format(new Date(item.dataHora), "dd/MM HH:mm", { locale: ptBR }) : '—'}</span>
                <span>Espera: {item.tempoSemResposta}</span>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <button onClick={() => onAbrirConversa(item.id)} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: '#22d07a', color: '#0b0f14' }}>Abrir conversa</button>
                {onAssumir && <button onClick={() => onAssumir(item.id)} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: '#1e2a38', color: '#e2eaf4' }}>Assumir</button>}
                {onFinalizar && <button onClick={() => onFinalizar(item.id)} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: '#1e2a38', color: '#e2eaf4' }}>Finalizar</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
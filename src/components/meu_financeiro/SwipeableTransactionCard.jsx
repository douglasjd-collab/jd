import React, { useRef, useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const SWIPE_THRESHOLD = -80;

export default function SwipeableTransactionCard({ t, onClick, onSwipeDelete }) {
  const isReceita = t._tipo === 'receita';
  const touchStartX = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const statusBadge = isReceita
    ? { bg: 'bg-green-100', text: 'text-green-700', label: 'Recebida' }
    : { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pendente' };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(false);
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const diff = e.touches[0].clientX - touchStartX.current;
    if (diff < 0) {
      setSwipeOffset(Math.max(diff, -100));
      setIsSwiping(true);
    } else {
      setSwipeOffset(0);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset < SWIPE_THRESHOLD) {
      onSwipeDelete(t);
    }
    setSwipeOffset(0);
    touchStartX.current = null;
    setTimeout(() => setIsSwiping(false), 300);
  };

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ touchAction: 'pan-y' }}>
      {/* Fundo vermelho de exclusão */}
      <div className="absolute inset-0 flex items-center justify-end pr-6 bg-red-500 rounded-xl">
        <div className="flex items-center gap-2 text-white">
          <Trash2 className="w-5 h-5" />
          <span className="text-sm font-semibold">Excluir</span>
        </div>
      </div>

      {/* Card */}
      <div
        className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 cursor-pointer active:bg-slate-50 relative"
        onClick={() => !isSwiping && swipeOffset === 0 && onClick(t)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: touchStartX.current === null ? 'transform 0.3s ease' : 'none',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Ícone */}
          <div className={`w-10 h-10 rounded-full ${isReceita ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center flex-shrink-0`}>
            <div className={`w-7 h-7 rounded-full ${isReceita ? 'bg-green-500' : 'bg-red-500'} flex items-center justify-center`}>
              {isReceita ? (
                <ArrowUpCircle className="w-4 h-4 text-white" />
              ) : (
                <ArrowDownCircle className="w-4 h-4 text-white" />
              )}
            </div>
          </div>

          {/* Informações */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-semibold text-slate-800 truncate">
                {(t._descricaoExibicao || t.descricao)?.length > 28
                  ? (t._descricaoExibicao || t.descricao).substring(0, 28) + '...'
                  : (t._descricaoExibicao || t.descricao)}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {t.categoria || 'Sem categoria'} · {t.data ? format(parseISO(t.data), 'dd/MM/yy') : '-'}
            </p>
            <div className="mt-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                {statusBadge.label}
              </span>
            </div>
          </div>

          {/* Valor */}
          <div className="text-right flex-shrink-0">
            <p className={`font-bold text-sm ${isReceita ? 'text-green-600' : 'text-red-600'}`}>
              {isReceita ? '+' : '-'} {fmtMoeda(t.valor)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
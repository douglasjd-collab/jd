import React, { useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, DollarSign, Calendar, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ConfirmarPagamentoDrawer({ item, onClose, onConfirmar }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataEfetiva, setDataEfetiva] = useState(hoje);
  const [salvando, setSalvando] = useState(false);

  if (!item) return null;

  const isReceita = item._tipo === 'receita';

  const dataFormatada = item.data
    ? format(parseISO(item.data), "d 'de' MMM. 'de' yyyy", { locale: ptBR })
    : '—';

  const handleConfirmar = async () => {
    setSalvando(true);
    await onConfirmar(dataEfetiva);
    setSalvando(false);
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isReceita ? 'bg-green-500' : 'bg-red-500'}`}>
            {isReceita
              ? <ArrowUpCircle className="w-5 h-5 text-white" />
              : <ArrowDownCircle className="w-5 h-5 text-white" />}
          </div>
          <p className="flex-1 font-bold text-base text-slate-800 dark:text-slate-100 truncate">{item.descricao}</p>
          <button onClick={onClose} className="p-1 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Infos */}
        <div className="px-5 py-4 space-y-0 divide-y divide-slate-100 dark:divide-slate-700">
          <div className="flex items-center gap-3 py-3">
            <DollarSign className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <span className={`text-base font-bold ${isReceita ? 'text-green-500' : 'text-red-500'}`}>
              {isReceita ? '+' : '-'} {fmtMoeda(item.valor)}
            </span>
          </div>
          <div className="flex items-center gap-3 py-3">
            <Calendar className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <span className="text-sm text-slate-600 dark:text-slate-300">{dataFormatada}</span>
          </div>

          {/* Seleção de data efetiva */}
          <div className="py-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Data de {isReceita ? 'recebimento' : 'pagamento'}
            </p>
            <input
              type="date"
              value={dataEfetiva}
              onChange={e => setDataEfetiva(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
        </div>

        {/* Botões */}
        <div className="px-5 pb-8 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={salvando}
            className={`flex-1 py-3 rounded-full font-semibold text-sm text-white ${isReceita ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} disabled:opacity-60`}
          >
            {salvando ? 'Salvando...' : (isReceita ? 'Receber' : 'Pagar')}
          </button>
        </div>
      </div>
    </>
  );
}
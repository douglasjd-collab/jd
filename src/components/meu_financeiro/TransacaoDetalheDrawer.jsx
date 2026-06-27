import React, { useState, useRef } from 'react';
import { ArrowUpCircle, ArrowDownCircle, DollarSign, Calendar, Tag, FileText, Pencil, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function TransacaoDetalheDrawer({ item, onClose, onEditar, onExcluir, onPagar, onSaved }) {
  const [editandoData, setEditandoData] = useState(false);
  const [novaData, setNovaData] = useState(item?.data || '');
  const [salvandoData, setSalvandoData] = useState(false);
  const inputDataRef = useRef(null);

  if (!item) return null;

  const isReceita = item._tipo === 'receita';
  const jaQuitado = isReceita ? item.status === 'recebida' : item.status === 'pago';

  const dataFormatada = novaData
    ? format(parseISO(novaData), "d 'de' MMM. 'de' yyyy", { locale: ptBR })
    : '—';

  const handleSalvarData = async () => {
    if (!novaData) return;
    setSalvandoData(true);
    try {
      const entidade = isReceita ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
      await base44.entities[entidade].update(item.id, { data: novaData });
      toast.success('Data atualizada!');
      setEditandoData(false);
      if (onSaved) onSaved();
    } catch {
      toast.error('Erro ao salvar data');
    } finally {
      setSalvandoData(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
        </div>

        {/* Header com ícone e título */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isReceita ? 'bg-green-500' : 'bg-red-500'}`}>
            {isReceita
              ? <ArrowUpCircle className="w-5 h-5 text-white" />
              : <ArrowDownCircle className="w-5 h-5 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-slate-800 dark:text-slate-100 truncate">{item.descricao}</p>
            <p className="text-xs text-slate-400">{isReceita ? 'Receita' : 'Despesa'}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Detalhes */}
        <div className="px-5 py-4 space-y-0 divide-y divide-slate-100 dark:divide-slate-700">
          {/* Valor */}
          <div className="flex items-center gap-3 py-3">
            <DollarSign className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <span className={`text-base font-bold ${isReceita ? 'text-green-500' : 'text-red-500'}`}>
              {isReceita ? '+' : '-'} {fmtMoeda(item.valor)}
            </span>
          </div>

          {/* Data — clicável para editar */}
          <div className="flex items-center gap-3 py-3">
            <Calendar className="w-5 h-5 text-slate-400 flex-shrink-0" />
            {editandoData ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  ref={inputDataRef}
                  type="date"
                  value={novaData}
                  onChange={e => setNovaData(e.target.value)}
                  className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  autoFocus
                />
                <button
                  onClick={handleSalvarData}
                  disabled={salvandoData}
                  className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg disabled:opacity-60"
                >
                  {salvandoData ? '...' : 'OK'}
                </button>
                <button
                  onClick={() => { setEditandoData(false); setNovaData(item.data || ''); }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditandoData(true)}
                className="text-sm text-slate-700 dark:text-slate-200 hover:text-violet-600 dark:hover:text-violet-400 underline underline-offset-2 text-left"
              >
                {dataFormatada}
              </button>
            )}
          </div>

          {/* Categoria */}
          {item.categoria && (
            <div className="flex items-center gap-3 py-3">
              <Tag className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-700 dark:text-slate-200">{item.categoria}</span>
            </div>
          )}

          {/* Observação */}
          {item.observacao && (
            <div className="flex items-start gap-3 py-3">
              <FileText className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-slate-700 dark:text-slate-200">{item.observacao}</span>
            </div>
          )}
        </div>

        {/* Botões de ação */}
        <div className="px-5 pb-6 pt-2 space-y-3">
          {/* Editar */}
          <button
            onClick={onEditar}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-full border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-sm"
          >
            <Pencil className="w-4 h-4" />
            Editar {isReceita ? 'receita' : 'despesa'}
          </button>

          {/* Pagar/Receber ou já quitado */}
          {jaQuitado ? (
            <button
              onClick={onPagar}
              className="w-full py-3 rounded-full border-2 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 font-semibold text-sm"
            >
              ✓ {isReceita ? 'Recebida' : 'Pago'} — Clique para desfazer
            </button>
          ) : (
            <button
              onClick={onPagar}
              className={`w-full py-3 rounded-full font-semibold text-sm text-white ${isReceita ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {isReceita ? 'Receber' : 'Pagar'}
            </button>
          )}

          {/* Excluir */}
          <button
            onClick={onExcluir}
            className="w-full flex items-center justify-center gap-2 py-2 text-red-500 font-semibold text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>
        </div>
      </div>
    </>
  );
}
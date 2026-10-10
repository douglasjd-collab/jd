import React, { useState } from 'react';
import { Plus, X, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import FormModalFinanceiro from '@/components/meu_financeiro/FormModalFinanceiro';

/**
 * Botão flutuante (+) da tela inicial do Meu Financeiro.
 * Abre as opções de novo lançamento (Receita / Despesa) e o formulário correspondente.
 */
export default function FabNovoLancamento({ user, onSaved }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [tipo, setTipo] = useState(null);

  const abrir = (novoTipo) => {
    setMenuAberto(false);
    setTipo(novoTipo);
  };

  return (
    <>
      {/* Fundo invisível para fechar o menu ao tocar fora */}
      {menuAberto && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuAberto(false)} />
      )}

      {/* Opções de lançamento */}
      {menuAberto && (
        <div className="fixed bottom-24 right-6 z-30 flex flex-col items-end gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); abrir('receita'); }}
            className="flex items-center gap-2 h-11 pl-4 pr-3 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg transition-transform active:scale-95"
          >
            <span className="text-sm font-semibold">Nova Receita</span>
            <ArrowUpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); abrir('despesa'); }}
            className="flex items-center gap-2 h-11 pl-4 pr-3 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg transition-transform active:scale-95"
          >
            <span className="text-sm font-semibold">Nova Despesa</span>
            <ArrowDownCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Botão + */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuAberto(v => !v); }}
        title="Novo lançamento"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-xl flex items-center justify-center z-30 transition-transform active:scale-95"
      >
        {menuAberto ? <X className="w-7 h-7" /> : <Plus className="w-7 h-7" />}
      </button>

      {tipo && (
        <FormModalFinanceiro
          open={!!tipo}
          onClose={() => setTipo(null)}
          item={null}
          tipo={tipo}
          user={user}
          onSaved={() => { setTipo(null); onSaved?.(); }}
        />
      )}
    </>
  );
}
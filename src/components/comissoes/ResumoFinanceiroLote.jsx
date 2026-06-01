import React from 'react';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Bloco de Resumo Financeiro exibido abaixo da tabela de contratos de cada lote pago.
 * Props:
 *   comissoes   – array de ComissaoAPagar do lote
 *   lote        – objeto PagamentoComissaoLote (possui total_adiantamento, acrescimos)
 */
export default function ResumoFinanceiroLote({ comissoes = [], lote = {} }) {
  const subtotal = comissoes.reduce((s, c) => s + (c.valor_a_pagar || 0), 0);

  // Adiantamentos: campo no lote ou somatório dos itens
  const adiantamentos = lote.total_adiantamento || lote.adiantamento || 0;

  // Acréscimos: campo no lote ou array JSON de acrescimos
  let acrescimosLista = [];
  try {
    if (lote.acrescimos) {
      acrescimosLista = typeof lote.acrescimos === 'string'
        ? JSON.parse(lote.acrescimos)
        : lote.acrescimos;
    }
  } catch {}
  const totalAcrescimos = acrescimosLista.reduce((s, a) => s + (a.valor || 0), 0);

  const valorLiquido = subtotal - adiantamentos + totalAcrescimos;

  return (
    <div className="border-t bg-slate-50 px-4 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Resumo Financeiro */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Resumo Financeiro
          </h4>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Subtotal de Comissões</span>
              <span className="font-semibold text-slate-800">{fmt(subtotal)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">(-) Adiantamentos</span>
              <span className={`font-semibold ${adiantamentos > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {fmt(adiantamentos)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">(+) Acréscimos</span>
              <span className={`font-semibold ${totalAcrescimos > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                {fmt(totalAcrescimos)}
              </span>
            </div>

            <div className="border-t border-slate-200 pt-3 mt-3 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm">Valor Líquido a Pagar</span>
              <span className="font-extrabold text-lg text-[#23BE84]">{fmt(valorLiquido)}</span>
            </div>
          </div>
        </div>

        {/* Detalhes dos Acréscimos — só exibe se houver */}
        {acrescimosLista.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Detalhes dos Acréscimos
            </h4>
            <p className="text-[11px] text-slate-400 mb-3 flex items-center gap-1">
              <span>ⓘ</span> Acréscimos lançados manualmente.
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-2 text-xs font-semibold text-slate-500">Descrição do Acréscimo</th>
                  <th className="text-left pb-2 text-xs font-semibold text-slate-500">Tipo</th>
                  <th className="text-right pb-2 text-xs font-semibold text-slate-500">Valor</th>
                </tr>
              </thead>
              <tbody>
                {acrescimosLista.map((a, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700">{a.descricao || '-'}</td>
                    <td className="py-2 text-slate-500">{a.tipo || 'Manual'}</td>
                    <td className="py-2 text-right font-semibold text-slate-700">{fmt(a.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={2} className="pt-3 font-bold text-slate-700 text-xs uppercase tracking-wide">
                    Total de Acréscimos
                  </td>
                  <td className="pt-3 text-right font-bold text-slate-800">{fmt(totalAcrescimos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Se não houver acréscimos, mostrar placeholder vazio para manter grid */}
        {acrescimosLista.length === 0 && (
          <div className="hidden md:block" />
        )}
      </div>
    </div>
  );
}
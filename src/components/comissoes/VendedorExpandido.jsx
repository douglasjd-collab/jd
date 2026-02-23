import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2 } from 'lucide-react';

export default function VendedorExpandido({
  vendedor, expandedVendedores, setExpandedVendedores,
  editingId, editingValue, setEditingValue,
  isAdmin, startEditing, saveEditing, cancelEditing,
  setVendedorModal, setModalSelecionados, setModalSearch,
  setFormaPagamento, setObservacao, setPagarModal,
  fmt, formatDateBR,
}) {
  const STATUS_A_PAGAR = ['a_pagar', 'a_apagar', 'pendente'];
  const selKey = vendedor.vendedor_id + '_sel';
  const selecionados = expandedVendedores[selKey];
  const comissoesAPagar = vendedor.comissoes.filter(c => STATUS_A_PAGAR.includes(c.status_pagamento));
  const todosSel = comissoesAPagar.length > 0 && comissoesAPagar.every(c => selecionados?.has(c.id));

  const toggleTodos = () => {
    setExpandedVendedores(prev => {
      const cur = new Set(prev[selKey] || []);
      if (todosSel) { comissoesAPagar.forEach(c => cur.delete(c.id)); }
      else { comissoesAPagar.forEach(c => cur.add(c.id)); }
      return { ...prev, [selKey]: cur };
    });
  };

  const toggleItem = (id) => {
    setExpandedVendedores(prev => {
      const cur = new Set(prev[selKey] || []);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      return { ...prev, [selKey]: cur };
    });
  };

  const abrirPagamentoSelecionados = (e) => {
    e.stopPropagation();
    const ids = selecionados ? Array.from(selecionados) : [];
    setVendedorModal(vendedor);
    setModalSelecionados(new Set(ids));
    setModalSearch('');
    setFormaPagamento('PIX');
    setObservacao('');
    setPagarModal(true);
  };

  const qtdSel = selecionados?.size || 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-slate-600">
            <th className="p-3 w-10">
              {comissoesAPagar.length > 0 && (
                <Checkbox checked={todosSel} onCheckedChange={toggleTodos} onClick={e => e.stopPropagation()} />
              )}
            </th>
            <th className="p-3 text-left font-semibold">Data</th>
            <th className="p-3 text-left font-semibold">Cliente</th>
            <th className="p-3 text-left font-semibold">Grupo/Cota</th>
            <th className="p-3 text-left font-semibold">Parcela</th>
            <th className="p-3 text-left font-semibold">Administradora</th>
            <th className="p-3 text-right font-semibold">Valor Recebido</th>
            <th className="p-3 text-center font-semibold">% Com.</th>
            <th className="p-3 text-right font-semibold">A Pagar</th>
            <th className="p-3 text-center font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {vendedor.comissoes.map((comissao) => {
            const isPagar = comissao.status_pagamento === 'a_pagar';
            const isSel = !!(selecionados?.has(comissao.id));
            return (
              <tr key={comissao.id} className={`border-b transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <td className="p-3">
                  {isPagar ? (
                    <Checkbox checked={isSel} onCheckedChange={() => toggleItem(comissao.id)} onClick={e => e.stopPropagation()} />
                  ) : <div className="w-4" />}
                </td>
                <td className="p-3 text-slate-600">{formatDateBR(comissao.data_recebimento)}</td>
                <td className="p-3 font-medium text-slate-800">{comissao.cliente_nome || '-'}</td>
                <td className="p-3 text-slate-600">
                  {comissao.grupo && comissao.cota ? `${comissao.grupo}/${comissao.cota}` : comissao.contrato || '-'}
                </td>
                <td className="p-3 text-slate-600">{comissao.parcela_numero ? `${comissao.parcela_numero}º` : '-'}</td>
                <td className="p-3 text-slate-600">{comissao.administradora_nome || '-'}</td>
                <td className="p-3 text-right font-semibold text-slate-700">{fmt(comissao.valor_recebido)}</td>
                <td className="p-3 text-center">
                  {editingId === comissao.id ? (
                    <div className="inline-flex items-center gap-1">
                      <Input
                        type="number" value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={() => saveEditing(comissao.id)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEditing(comissao.id); if (e.key === 'Escape') cancelEditing(); }}
                        autoFocus onFocus={e => e.target.select()}
                        className="w-14 h-7 text-xs text-center" min="0" max="100"
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  ) : (
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${isPagar && isAdmin ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50 bg-white border-slate-200' : 'bg-slate-100 border-slate-200 cursor-default'}`}
                      onClick={() => isPagar && isAdmin && startEditing(comissao)}
                    >
                      {comissao.percentual_comissao || 0}%
                    </span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {comissao.status_pagamento === 'paga' ? (
                    <span className="font-bold text-green-600 flex items-center justify-end gap-1">
                      <CheckCircle2 className="w-4 h-4" />{fmt(comissao.valor_a_pagar)}
                    </span>
                  ) : (
                    <span className="font-bold text-blue-600">{fmt(comissao.valor_a_pagar)}</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {comissao.status_pagamento === 'paga' ? (
                    <Badge className="bg-green-100 text-green-800 text-xs">Paga</Badge>
                  ) : (
                    <Badge className="bg-orange-100 text-orange-800 text-xs">A Pagar</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {vendedor.comissoes.length} comissão(ões)
        </span>
        {qtdSel > 0 && (
          <Button size="sm" className="bg-[#23BE84] hover:bg-[#1da872] text-white" onClick={abrirPagamentoSelecionados}>
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Pagar {qtdSel} selecionado(s)
          </Button>
        )}
      </div>
    </div>
  );
}
import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';
import 'moment/locale/pt-br';
moment.locale('pt-br');

const BRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const PCT = (v, total) => total > 0 ? `${((v/total)*100).toFixed(1)}%` : '0%';

export default function AbaDRE({ despesas, receitas, comissoes }) {
  const [periodo, setPeriodo] = useState(() => moment().format('YYYY-MM'));

  const meses = useMemo(() => Array.from({length:12},(_,i) => {
    const d = moment().subtract(i,'months');
    return { value: d.format('YYYY-MM'), label: d.format('MMMM [de] YYYY') };
  }), []);

  const filtrarPorPeriodo = (items, campoData) => items.filter(i => (i[campoData] || i.data || '').startsWith(periodo));

  const receitasBrutas = useMemo(() =>
    filtrarPorPeriodo(receitas.filter(r => r.status === 'recebida'), 'data_recebimento')
      .reduce((s,r) => s+(r.valor||0),0), [receitas, periodo]);

  const comissoesPagas = useMemo(() =>
    filtrarPorPeriodo(comissoes.filter(c => ['pago','paga'].includes(c.status_pagamento)), 'data_pagamento')
      .reduce((s,c) => s+(c.valor_vendedor||0),0), [comissoes, periodo]);

  const despesasOperacionais = useMemo(() =>
    filtrarPorPeriodo(despesas.filter(d => ['pago','paga'].includes(d.status)), 'data_pagamento')
      .reduce((s,d) => s+(d.valor||0),0), [despesas, periodo]);

  // Impostos estimados (assumir que estão como categoria 'impostos' ou 'imposto')
  const impostos = useMemo(() =>
    filtrarPorPeriodo(despesas.filter(d => ['pago','paga'].includes(d.status) && (d.categoria||'').toLowerCase().includes('imposto')), 'data_pagamento')
      .reduce((s,d) => s+(d.valor||0),0), [despesas, periodo]);

  const despesasSemImpostos = despesasOperacionais - impostos;
  const lucroOperacional = receitasBrutas - comissoesPagas - despesasSemImpostos - impostos;
  const lucroLiquido = lucroOperacional;

  const linhas = [
    { label: 'RECEITA BRUTA', valor: receitasBrutas, tipo: 'titulo', destaque: true },
    { label: '(-) Comissões Pagas', valor: -comissoesPagas, tipo: 'subtracao' },
    { label: '(-) Impostos', valor: -impostos, tipo: 'subtracao' },
    { label: '(-) Despesas Operacionais', valor: -despesasSemImpostos, tipo: 'subtracao' },
    { label: 'LUCRO OPERACIONAL', valor: lucroOperacional, tipo: 'subtotal', destaque: true },
    { label: 'LUCRO LÍQUIDO', valor: lucroLiquido, tipo: 'total', destaque: true },
  ];

  // Detalhamento de despesas por categoria
  const despesasPorCategoria = useMemo(() => {
    const map = {};
    filtrarPorPeriodo(despesas.filter(d => ['pago','paga'].includes(d.status)), 'data_pagamento')
      .forEach(d => {
        const cat = d.categoria || 'Sem categoria';
        map[cat] = (map[cat]||0) + (d.valor||0);
      });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [despesas, periodo]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-slate-800">Demonstrativo de Resultado (DRE)</h2>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-48"><SelectValue/></SelectTrigger>
          <SelectContent>
            {meses.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* DRE */}
        <Card className="overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-3">
            <h3 className="font-bold text-sm">DRE — {moment(periodo).format('MMMM [de] YYYY')}</h3>
          </div>
          <div>
            {linhas.map((l, i) => {
              const isNeg = l.valor < 0;
              const isTipo = l.tipo === 'titulo' || l.tipo === 'subtotal' || l.tipo === 'total';
              return (
                <div key={i} className={`flex items-center justify-between px-4 py-3 border-b last:border-0 ${
                  l.tipo === 'total' ? 'bg-blue-600 text-white font-bold' :
                  l.tipo === 'subtotal' ? 'bg-slate-100 font-semibold' :
                  l.tipo === 'titulo' ? 'bg-green-50 font-semibold' :
                  'hover:bg-slate-50'
                }`}>
                  <span className={`text-sm ${l.tipo === 'total' ? 'text-white' : 'text-slate-700'}`}>{l.label}</span>
                  <span className={`font-bold text-sm ${
                    l.tipo === 'total' ? 'text-white' :
                    isNeg ? 'text-red-600' :
                    l.valor > 0 ? 'text-green-600' : 'text-slate-500'
                  }`}>
                    {BRL(Math.abs(l.valor))}
                    {receitasBrutas > 0 && <span className="text-xs opacity-60 ml-1">({PCT(Math.abs(l.valor), receitasBrutas)})</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Detalhamento despesas */}
        <Card className="overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-3">
            <h3 className="font-bold text-sm">Despesas por Categoria</h3>
          </div>
          {despesasPorCategoria.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">Sem despesas no período</p>
          ) : (
            <div>
              {despesasPorCategoria.map(([cat, valor], i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-slate-50">
                  <span className="text-sm text-slate-700">{cat}</span>
                  <div className="text-right">
                    <span className="font-semibold text-red-600 text-sm">{BRL(valor)}</span>
                    <span className="text-xs text-slate-400 ml-1">({PCT(valor, despesasOperacionais)})</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-100 font-bold">
                <span className="text-sm">Total</span>
                <span className="text-red-700">{BRL(despesasOperacionais)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
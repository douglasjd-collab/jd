import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, AlertCircle, Clock, Wallet, Users, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import moment from 'moment';
import 'moment/locale/pt-br';
moment.locale('pt-br');

const BRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const PRODUTOS = ['Consórcio','Financiamento','Empréstimo Consignado','Proteção Veicular','Seguros','Microcrédito','Outros'];
const CORES_PRODUTO = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#64748b'];

export default function DashboardFinanceiro({ despesas, receitas, comissoes, periodo }) {
  const hoje = moment().format('YYYY-MM-DD');

  const receitasRealizadas = useMemo(() =>
    receitas.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0), [receitas]);

  const receitasPrevistas = useMemo(() =>
    receitas.filter(r => r.status !== 'recebida' && r.status !== 'cancelada').reduce((s, r) => s + (r.valor || 0), 0), [receitas]);

  const totalDespesas = useMemo(() =>
    despesas.filter(d => ['pago', 'paga'].includes(d.status)).reduce((s, d) => s + (d.valor || 0), 0), [despesas]);

  const comissoesPagas = useMemo(() =>
    comissoes.filter(c => c.status_pagamento === 'pago').reduce((s, c) => s + (c.valor_vendedor || 0), 0), [comissoes]);

  const lucroLiquido = receitasRealizadas - totalDespesas - comissoesPagas;

  const contasReceber = useMemo(() =>
    receitas.filter(r => r.status !== 'recebida' && r.status !== 'cancelada').reduce((s, r) => s + (r.valor || 0), 0), [receitas]);

  const contasPagar = useMemo(() =>
    despesas.filter(d => !['pago', 'paga'].includes(d.status)).reduce((s, d) => s + (d.valor || 0), 0), [despesas]);

  const atrasadas = useMemo(() =>
    despesas.filter(d => !['pago', 'paga'].includes(d.status) && (d.data_vencimento || d.data) < hoje), [despesas, hoje]);

  const comissoesPendentes = useMemo(() =>
    comissoes.filter(c => !['pago', 'paga'].includes(c.status_pagamento)).reduce((s, c) => s + (c.valor_vendedor || 0), 0), [comissoes]);

  // Gráfico: Receitas x Despesas por mês (últimos 6 meses)
  const dadosMensais = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const m = moment().subtract(5 - i, 'months');
      const mesStr = m.format('YYYY-MM');
      const rec = receitas.filter(r => r.status === 'recebida' && (r.data_recebimento || r.data || '').startsWith(mesStr)).reduce((s, r) => s + (r.valor || 0), 0);
      const desp = despesas.filter(d => ['pago', 'paga'].includes(d.status) && (d.data_pagamento || d.data || '').startsWith(mesStr)).reduce((s, d) => s + (d.valor || 0), 0);
      return { mes: MESES[m.month()], Receitas: rec, Despesas: desp };
    });
  }, [receitas, despesas]);

  // Receita por produto
  const receitaPorProduto = useMemo(() => {
    const map = {};
    receitas.forEach(r => {
      const p = r.produto || r.origem || 'Outros';
      map[p] = (map[p] || 0) + (r.valor || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [receitas]);

  // Despesa por categoria
  const despesaPorCategoria = useMemo(() => {
    const map = {};
    despesas.forEach(d => {
      const c = d.categoria || 'Sem categoria';
      map[c] = (map[c] || 0) + (d.valor || 0);
    });
    return Object.entries(map).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [despesas]);

  // Alertas
  const alertas = [];
  if (atrasadas.length > 0) alertas.push({ tipo: 'danger', msg: `${atrasadas.length} conta(s) vencida(s) — ${BRL(atrasadas.reduce((s,d)=>s+(d.valor||0),0))}` });
  const recv7d = receitas.filter(r => r.status !== 'recebida' && (r.data||'') >= hoje && (r.data||'') <= moment().add(7,'days').format('YYYY-MM-DD'));
  if (recv7d.length > 0) alertas.push({ tipo: 'success', msg: `${recv7d.length} receita(s) prevista(s) para os próximos 7 dias — ${BRL(recv7d.reduce((s,r)=>s+(r.valor||0),0))}` });
  const desp7d = despesas.filter(d => !['pago','paga'].includes(d.status) && (d.data_vencimento||d.data||'') >= hoje && (d.data_vencimento||d.data||'') <= moment().add(7,'days').format('YYYY-MM-DD'));
  if (desp7d.length > 0) alertas.push({ tipo: 'warning', msg: `${desp7d.length} despesa(s) vencendo nos próximos 7 dias — ${BRL(desp7d.reduce((s,d)=>s+(d.valor||0),0))}` });
  if (comissoesPendentes > 0) alertas.push({ tipo: 'orange', msg: `Comissões pendentes: ${BRL(comissoesPendentes)}` });

  const kpis = [
    { label: 'Receita Realizada', value: BRL(receitasRealizadas), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
    { label: 'Receita Prevista', value: BRL(receitasPrevistas), icon: BarChart2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    { label: 'Total Despesas', value: BRL(totalDespesas), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
    { label: 'Lucro Líquido', value: BRL(lucroLiquido), icon: DollarSign, color: lucroLiquido >= 0 ? 'text-blue-700' : 'text-red-700', bg: lucroLiquido >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200' },
    { label: 'A Receber', value: BRL(contasReceber), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    { label: 'A Pagar', value: BRL(contasPagar), icon: Wallet, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
    { label: 'Contas Atrasadas', value: BRL(atrasadas.reduce((s,d)=>s+(d.valor||0),0)), icon: AlertCircle, color: 'text-red-700', bg: 'bg-red-100 border-red-300' },
    { label: 'Comissões Pendentes', value: BRL(comissoesPendentes), icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  ];

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => {
            const cls = { danger: 'bg-red-50 border-red-300 text-red-800', success: 'bg-green-50 border-green-300 text-green-800', warning: 'bg-yellow-50 border-yellow-300 text-yellow-800', orange: 'bg-orange-50 border-orange-300 text-orange-800' };
            return <div key={i} className={`px-4 py-2.5 rounded-lg border text-sm font-medium flex items-center gap-2 ${cls[a.tipo]}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{a.msg}
            </div>;
          })}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className={`p-4 border ${k.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 font-medium">{k.label}</p>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">Receitas x Despesas (últimos 6 meses)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosMensais}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => BRL(v)} />
              <Legend />
              <Bar dataKey="Receitas" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="Despesas" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">Receita por Produto</h3>
          {receitaPorProduto.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={receitaPorProduto} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {receitaPorProduto.map((_, i) => <Cell key={i} fill={CORES_PRODUTO[i % CORES_PRODUTO.length]} />)}
                </Pie>
                <Tooltip formatter={v => BRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-slate-400 text-sm py-16">Sem dados</p>}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">Despesa por Categoria</h3>
          {despesaPorCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={despesaPorCategoria} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={v => BRL(v)} />
                <Bar dataKey="value" fill="#f59e0b" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-slate-400 text-sm py-16">Sem dados</p>}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">A Receber x A Pagar</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={[{ name: 'Situação atual', 'A Receber': contasReceber, 'A Pagar': contasPagar }]}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => BRL(v)} />
              <Legend />
              <Bar dataKey="A Receber" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="A Pagar" fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
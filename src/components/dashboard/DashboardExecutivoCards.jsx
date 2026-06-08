import React from 'react';
import { TrendingUp, TrendingDown, Users, DollarSign, Target, Zap, BarChart2, Clock } from 'lucide-react';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Card({ icon: Icon, title, value, sub, color = 'blue', trend }) {
  const colors = {
    green: 'bg-green-50 text-green-600 border-green-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    pink: 'bg-pink-50 text-pink-600 border-pink-100',
  };
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border flex items-start gap-3 ${colors[color]?.split(' ').slice(2).join(' ') || 'border-slate-100'}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color]?.split(' ').slice(0, 2).join(' ')}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 font-medium">{title}</p>
        <p className="text-xl font-bold text-slate-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend >= 0 ? '+' : ''}{trend}% vs mês ant.
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardExecutivoCards({ vendas, oportunidades, propostas, user, periodo }) {
  const isVendedor = ['vendedor', 'colaborador', 'funcionario'].includes(user?.perfil);

  const vendasPeriodo = vendas.filter(v => {
    if (v.status === 'cancelada') return false;
    if (!v.data_venda) return false;
    return v.data_venda >= periodo.inicio && v.data_venda <= periodo.fim;
  });

  const producaoTotal = vendasPeriodo.reduce((a, v) => a + (v.valorCredito || 0), 0);
  const ticketMedio = vendasPeriodo.length > 0 ? producaoTotal / vendasPeriodo.length : 0;
  const oportunidadesAbertas = oportunidades.filter(o => o.status === 'aberta').length;
  const valorNegociacao = oportunidades.filter(o => o.status === 'aberta').reduce((a, o) => a + (o.valor_estimado || 0), 0);
  const totalLeads = oportunidades.length;

  const vendidas = oportunidades.filter(o => o.status === 'ganha').length;
  const conversao = totalLeads > 0 ? ((vendidas / totalLeads) * 100).toFixed(1) : 0;

  const propostasAtivas = propostas.filter(p => !['cancelado', 'cancelada'].includes(p.status)).length;
  const valorPropostas = propostas.filter(p => !['cancelado', 'cancelada'].includes(p.status)).reduce((a, p) => a + (p.valor_credito || 0), 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card icon={DollarSign} title="Produção Total" value={BRL(producaoTotal)} sub={`${vendasPeriodo.length} vendas`} color="green" />
      <Card icon={TrendingUp} title="Oportunidades Abertas" value={oportunidadesAbertas} sub={BRL(valorNegociacao)} color="purple" />
      <Card icon={Users} title="Total de Leads" value={totalLeads} sub={`${vendidas} convertidos`} color="blue" />
      <Card icon={Target} title="Taxa de Conversão" value={`${conversao}%`} sub="Leads → Vendas" color="teal" />
      <Card icon={BarChart2} title="Ticket Médio" value={BRL(ticketMedio)} sub="Por venda" color="indigo" />
      <Card icon={Zap} title="Valor em Negociação" value={BRL(valorNegociacao)} sub={`${oportunidadesAbertas} oportunidades`} color="amber" />
      <Card icon={Clock} title="Propostas Ativas" value={propostasAtivas} sub={BRL(valorPropostas)} color="pink" />
      <Card icon={DollarSign} title="Receita Prevista" value={BRL(valorNegociacao * 0.15)} sub="Estimativa comissões" color="green" />
    </div>
  );
}
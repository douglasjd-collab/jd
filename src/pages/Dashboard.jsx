import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatsCard from '@/components/ui/StatsCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { 
  ShoppingCart, 
  Wallet, 
  Users, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Building2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

const COLORS = ['#1e3a5f', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const userData = await base44.auth.me();
    setUser(userData);
  };

  const isAdmin = user?.perfil === 'master' || user?.perfil === 'admin';
  const isGerente = user?.perfil === 'gerente';

  // Queries
  const { data: vendas = [], isLoading: loadingVendas } = useQuery({
    queryKey: ['vendas-dashboard'],
    queryFn: () => base44.entities.Venda.list('-created_date', 100),
  });

  const { data: comissoes = [], isLoading: loadingComissoes } = useQuery({
    queryKey: ['comissoes-dashboard'],
    queryFn: () => base44.entities.Comissao.list('-created_date', 200),
  });

  const { data: parcelas = [], isLoading: loadingParcelas } = useQuery({
    queryKey: ['parcelas-dashboard'],
    queryFn: () => base44.entities.Parcela.list('-created_date', 500),
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-dashboard'],
    queryFn: () => base44.entities.User.filter({ status: 'ativo' }),
  });

  const { data: oportunidades = [], isLoading: loadingOportunidades } = useQuery({
    queryKey: ['oportunidades-dashboard'],
    queryFn: () => base44.entities.Oportunidade.list('-data_ultima_movimentacao', 100),
  });

  // Filtrar dados por perfil
  const filteredVendas = vendas.filter(v => {
    if (isAdmin) return true;
    if (isGerente) return v.gerente_id === user?.id || v.vendedor_id === user?.id;
    return v.vendedor_id === user?.id;
  });

  const filteredOportunidades = oportunidades.filter(o => {
    if (isAdmin) return true;
    if (isGerente) return o.gerente_id === user?.id || o.vendedor_id === user?.id;
    return o.vendedor_id === user?.id;
  });

  const vendasMes = filteredVendas.filter(v => {
    const dataVenda = new Date(v.data_venda);
    return dataVenda >= dateRange.start && dataVenda <= dateRange.end;
  });

  // Calcular métricas
  const totalVendasMes = vendasMes.length;
  const valorTotalVendas = vendasMes.reduce((acc, v) => acc + (v.valor_carta || 0), 0);
  
  const comissoesReceber = comissoes
    .filter(c => c.tipo === 'receber' && c.status === 'prevista')
    .reduce((acc, c) => acc + c.valor, 0);
  
  const comissoesPagar = comissoes
    .filter(c => c.tipo === 'pagar' && c.status !== 'paga')
    .reduce((acc, c) => acc + c.valor, 0);

  const parcelasAtrasadas = parcelas.filter(p => p.status === 'atrasada').length;

  const oportunidadesAbertas = filteredOportunidades.filter(o => o.status === 'aberta').length;
  const valorOportunidades = filteredOportunidades
    .filter(o => o.status === 'aberta')
    .reduce((acc, o) => acc + (o.valor_estimado || 0), 0);

  // Dados para gráficos
  const vendasPorMes = React.useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      const count = filteredVendas.filter(v => {
        const dataVenda = new Date(v.data_venda);
        return dataVenda >= monthStart && dataVenda <= monthEnd;
      }).length;
      months.push({
        name: format(date, 'MMM', { locale: ptBR }),
        vendas: count
      });
    }
    return months;
  }, [filteredVendas]);

  const vendasPorStatus = React.useMemo(() => {
    const statusCount = { ativa: 0, cancelada: 0, contemplada: 0 };
    filteredVendas.forEach(v => {
      statusCount[v.status] = (statusCount[v.status] || 0) + 1;
    });
    return Object.entries(statusCount)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filteredVendas]);

  const rankingVendedores = React.useMemo(() => {
    const vendedorCount = {};
    vendasMes.forEach(v => {
      const nome = v.vendedor_nome || 'Sem vendedor';
      vendedorCount[nome] = (vendedorCount[nome] || 0) + 1;
    });
    return Object.entries(vendedorCount)
      .map(([nome, vendas]) => ({ nome, vendas }))
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 5);
  }, [vendasMes]);

  const vendasRecentes = filteredVendas.slice(0, 5);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
          Olá, {user?.full_name?.split(' ')[0] || 'Usuário'}!
        </h1>
        <p className="text-slate-500 mt-1">
          {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Vendas do Mês"
          value={totalVendasMes}
          subtitle={formatCurrency(valorTotalVendas)}
          icon={ShoppingCart}
          color="blue"
        />
        <StatsCard
          title="Oportunidades Abertas"
          value={oportunidadesAbertas}
          subtitle={formatCurrency(valorOportunidades)}
          icon={TrendingUp}
          color="purple"
        />
        <StatsCard
          title="Comissão a Receber"
          value={formatCurrency(comissoesReceber)}
          icon={Wallet}
          color="green"
        />
        <StatsCard
          title="Comissão a Pagar"
          value={formatCurrency(comissoesPagar)}
          icon={Wallet}
          color="yellow"
        />
        <StatsCard
          title="Parcelas Atrasadas"
          value={parcelasAtrasadas}
          icon={Calendar}
          color={parcelasAtrasadas > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vendas por Mês */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Vendas por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vendasPorMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                    }}
                  />
                  <Bar dataKey="vendas" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Vendas por Status */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Status das Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={vendasPorStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {vendasPorStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4">
                {vendasPorStatus.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm text-slate-600 capitalize">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking Vendedores */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Ranking do Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rankingVendedores.length > 0 ? (
                rankingVendedores.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{v.nome}</p>
                      <p className="text-sm text-slate-500">{v.vendas} vendas</p>
                    </div>
                    <div className="text-right">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#1e3a5f] rounded-full"
                          style={{ width: `${(v.vendas / (rankingVendedores[0]?.vendas || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-500 py-8">Nenhuma venda no período</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vendas Recentes */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Vendas do Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {vendasMes.length > 0 ? (
                vendasMes.slice(0, 5).map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-full flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-[#1e3a5f]" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{v.cliente_nome}</p>
                        <p className="text-sm text-slate-500">
                          Grupo {v.grupo} • Cota {v.cota}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {formatCurrency(v.valor_carta || 0)}
                      </p>
                      <StatusBadge status={v.status} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-500 py-8">Nenhuma venda no mês</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Oportunidades Recentes */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Oportunidades em Aberto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredOportunidades.filter(o => o.status === 'aberta').slice(0, 8).length > 0 ? (
              filteredOportunidades.filter(o => o.status === 'aberta').slice(0, 8).map((op) => (
                <div key={op.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{op.titulo}</p>
                      <p className="text-sm text-slate-500">
                        {op.etapa_nome} • {op.vendedor_nome}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {formatCurrency(op.valor_estimado || 0)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {op.data_cadastro_lead ? format(new Date(op.data_cadastro_lead), 'dd/MM/yyyy') : '-'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-500 py-8">Nenhuma oportunidade em aberto</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
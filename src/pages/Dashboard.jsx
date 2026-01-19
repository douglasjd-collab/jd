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
  Building2,
  Cake,
  AlertCircle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, isSameDay } from 'date-fns';
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
    try {
      const me = await base44.auth.me();

      if (!me) {
        setUser(null);
        return;
      }

      // Primeiro: tenta reconhecer super_admin pelo próprio auth
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setUser({
          ...me,
          auth_id: me.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'super_admin',
          nome_perfil: me.full_name,
          gerente_id: null,
        });
        return;
      }

      // Depois: busca Colaborador e se o perfil dele for super_admin, também vira super_admin
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date'
      );

      if (!colabs || colabs.length === 0) {
        console.warn('Usuário sem Colaborador vinculado:', me.email);
        setUser({
          ...me,
          auth_id: me.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'vendedor',
          nome_perfil: me.full_name || '',
          gerente_id: null,
        });
        return;
      }

      const colab = colabs[0];

      if (colab?.perfil === 'super_admin' || colab?.perfil === 'master') {
        setUser({
          ...me,
          auth_id: me.id,
          colaborador_id: colab.id,
          empresa_id: null,
          perfil: 'super_admin',
          nome_perfil: colab.nome || me.full_name || '',
          gerente_id: null,
        });
        return;
      }

      const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === me.empresa_id);
      const colabFinal = byEmpresa || colab;

      setUser({
        ...me,
        auth_id: me.id,
        colaborador_id: colabFinal.id,
        empresa_id: colabFinal.empresa_id || null,
        perfil: colabFinal.perfil || 'vendedor',
        nome_perfil: colabFinal.nome || me.full_name || '',
        gerente_id: colabFinal.gerente_id || null,
      });
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
      setUser(null);
    }
  };

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-dashboard'],
    enabled: !!user,
    queryFn: () => base44.entities.Colaborador.list(),
  });

  const isAdmin = user?.perfil === 'master' || user?.perfil === 'super_admin' || user?.perfil === 'admin';
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
    enabled: !!user && isAdmin,
    queryFn: () => base44.entities.Colaborador.filter({ status: 'ativo' }),
  });

  const { data: oportunidades = [], isLoading: loadingOportunidades } = useQuery({
    queryKey: ['oportunidades-dashboard'],
    queryFn: () => base44.entities.Oportunidade.list('-data_ultima_movimentacao', 100),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-dashboard'],
    queryFn: () => base44.entities.Cliente.filter({ status: 'ativo' }),
  });

  // Filtrar dados por perfil (excluir vendas canceladas)
  const filteredVendas = vendas.filter(v => {
    // Não contar vendas canceladas
    if (v.status === 'cancelada') return false;
    
    if (isAdmin) return true;
    if (isGerente) return v.gerente_id === user?.colaborador_id || v.vendedor_id === user?.colaborador_id;
    return v.vendedor_id === user?.colaborador_id;
  });

  const filteredOportunidades = oportunidades.filter(o => {
    if (isAdmin) return true;
    if (isGerente) return o.gerente_id === user?.colaborador_id || o.vendedor_id === user?.colaborador_id;
    return o.vendedor_id === user?.colaborador_id;
  });

  const vendasMes = filteredVendas.filter(v => {
    // Não contar vendas canceladas no mês
    if (v.status === 'cancelada') return false;
    const dataVenda = new Date(v.data_venda + 'T12:00:00');
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

  // Dados para gráficos (excluir vendas canceladas)
  const vendasPorMes = React.useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      const vendasDoMes = filteredVendas.filter(v => {
        if (v.status === 'cancelada') return false;
        const dataVenda = new Date(v.data_venda + 'T12:00:00');
        return dataVenda >= monthStart && dataVenda <= monthEnd;
      });
      const count = vendasDoMes.length;
      const valor = vendasDoMes.reduce((acc, v) => acc + (v.valorCredito || 0), 0);
      months.push({
        name: format(date, 'MMM', { locale: ptBR }),
        vendas: count,
        valor: valor
      });
    }
    return months;
  }, [filteredVendas]);

  const vendasPorStatus = React.useMemo(() => {
    const statusCount = { ativa: 0, pendente: 0, aguardando_aprovacao: 0, cancelada: 0, em_atraso: 0, contemplada: 0 };
    vendas.forEach(v => {
      if (isAdmin || (isGerente && (v.gerente_id === user?.colaborador_id || v.vendedor_id === user?.colaborador_id)) || v.vendedor_id === user?.colaborador_id) {
        statusCount[v.status] = (statusCount[v.status] || 0) + 1;
      }
    });
    return Object.entries(statusCount)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [vendas, isAdmin, isGerente, user]);

  const rankingVendedores = React.useMemo(() => {
    const vendedorStats = {};
    vendasMes.forEach(v => {
      const nome = v.vendedor_nome || 'Sem vendedor';
      if (!vendedorStats[nome]) {
        vendedorStats[nome] = { vendas: 0, valor: 0 };
      }
      vendedorStats[nome].vendas += 1;
      vendedorStats[nome].valor += (v.valorCredito || 0);
    });
    return Object.entries(vendedorStats)
      .map(([nome, stats]) => ({ nome, vendas: stats.vendas, valor: stats.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  }, [vendasMes]);

  const vendasRecentes = filteredVendas.slice(0, 5);

  // Aniversariantes da semana e do dia
  const aniversariantesSemana = React.useMemo(() => {
    const hoje = new Date();
    const inicioSemana = startOfWeek(hoje, { weekStartsOn: 0 });
    const fimSemana = endOfWeek(hoje, { weekStartsOn: 0 });
    
    return clientes.filter(c => {
      if (!c.data_nascimento) return false;
      const nascimento = new Date(c.data_nascimento + 'T12:00:00');
      const aniversarioEsteAno = new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate());
      return aniversarioEsteAno >= inicioSemana && aniversarioEsteAno <= fimSemana;
    }).sort((a, b) => {
      const dateA = new Date(a.data_nascimento + 'T12:00:00');
      const dateB = new Date(b.data_nascimento + 'T12:00:00');
      return dateA.getMonth() * 100 + dateA.getDate() - (dateB.getMonth() * 100 + dateB.getDate());
    });
  }, [clientes]);

  const aniversariantesHoje = React.useMemo(() => {
    const hoje = new Date();
    return clientes.filter(c => {
      if (!c.data_nascimento) return false;
      const nascimento = new Date(c.data_nascimento + 'T12:00:00');
      return nascimento.getDate() === hoje.getDate() && nascimento.getMonth() === hoje.getMonth();
    });
  }, [clientes]);

  const [statusModalOpen, setStatusModalOpen] = React.useState(false);
  const [selectedStatus, setSelectedStatus] = React.useState(null);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-500">Carregando...</p>
      </div>
    );
  }

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

      {/* Alerta Aniversariantes do Dia */}
      {aniversariantesHoje.length > 0 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900">🎉 Aniversariantes de Hoje!</h3>
                <div className="mt-2 space-y-1">
                  {aniversariantesHoje.map(c => (
                    <p key={c.id} className="text-sm text-amber-800">
                      • {c.nome_completo || c.pj_razao_social} {c.celular && `- ${c.celular}`}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          title="Parcelas Atrasadas"
          value={parcelasAtrasadas}
          icon={Calendar}
          color={parcelasAtrasadas > 0 ? 'red' : 'green'}
        />
        <StatsCard
          title="Aniversariantes da Semana"
          value={aniversariantesSemana.length}
          subtitle={aniversariantesHoje.length > 0 ? `${aniversariantesHoje.length} hoje!` : 'Nenhum hoje'}
          icon={Cake}
          color={aniversariantesHoje.length > 0 ? 'amber' : 'blue'}
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
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendasPorMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} label={{ value: 'Qtd', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#23BE84" fontSize={12} tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                    }}
                    formatter={(value, name) => {
                      if (name === 'vendas') return [value, 'Quantidade'];
                      return [formatCurrency(value), 'Valor Total'];
                    }}
                  />
                  <Bar dataKey="vendas" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="valor" fill="#23BE84" radius={[4, 4, 0, 0]} yAxisId="right" />
                </BarChart>
              </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Vendas por Status */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Status das Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                  <Pie
                    data={vendasPorStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    onClick={(entry) => {
                      setSelectedStatus(entry.name);
                      setStatusModalOpen(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {vendasPorStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4 flex-wrap">
                {vendasPorStatus.map((entry, index) => (
                  <button
                    key={entry.name}
                    onClick={() => {
                      setSelectedStatus(entry.name);
                      setStatusModalOpen(true);
                    }}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  >
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm text-slate-600 capitalize">{entry.name.replace('_', ' ')}</span>
                  </button>
                ))}
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
                      <p className="text-sm text-slate-500">{v.vendas} vendas • {formatCurrency(v.valor)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#1e3a5f] mb-1">{formatCurrency(v.valor)}</p>
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#1e3a5f] rounded-full"
                          style={{ width: `${(v.valor / (rankingVendedores[0]?.valor || 1)) * 100}%` }}
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

      {/* Bottom Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                        {op.data_cadastro_lead ? format(new Date(op.data_cadastro_lead + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
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

        {/* Aniversariantes da Semana */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Cake className="w-5 h-5 text-pink-500" />
              Aniversariantes da Semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aniversariantesSemana.length > 0 ? (
                aniversariantesSemana.map((cliente) => {
                  const nascimento = new Date(cliente.data_nascimento + 'T12:00:00');
                  const hoje = new Date();
                  const ehHoje = nascimento.getDate() === hoje.getDate() && nascimento.getMonth() === hoje.getMonth();
                  
                  return (
                    <div 
                      key={cliente.id} 
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        ehHoje ? 'bg-amber-100 border-2 border-amber-400' : 'bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          ehHoje ? 'bg-amber-500 text-white' : 'bg-pink-100 text-pink-600'
                        }`}>
                          <Cake className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {cliente.nome_completo || cliente.pj_razao_social}
                            {ehHoje && <span className="ml-2 text-amber-600 font-bold">🎉 HOJE</span>}
                          </p>
                          <p className="text-sm text-slate-500">
                            {format(nascimento, 'dd/MM')}
                            {cliente.celular && ` • ${cliente.celular}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-slate-500 py-8">Nenhum aniversariante esta semana</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Vendas por Status */}
      {statusModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setStatusModalOpen(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-slate-900 capitalize">
                Vendas - {selectedStatus?.replace('_', ' ')}
              </h2>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
              <div className="space-y-3">
                {vendas.filter(v => v.status === selectedStatus).length > 0 ? (
                  vendas.filter(v => v.status === selectedStatus).map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{v.cliente_nome}</p>
                        <p className="text-sm text-slate-500">
                          Grupo {v.grupo} • Cota {v.cota || 'Pendente'} • {v.vendedor_nome}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {v.data_venda ? format(new Date(v.data_venda + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">
                          {formatCurrency(v.valorCredito || 0)}
                        </p>
                        <StatusBadge status={v.status} className="mt-1" />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-slate-500 py-8">Nenhuma venda encontrada</p>
                )}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setStatusModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
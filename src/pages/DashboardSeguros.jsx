import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Shield, TrendingUp, DollarSign, Clock, AlertTriangle, XCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, differenceInDays, subMonths, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function DashboardSeguros() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [periodoMeses, setPeriodoMeses] = useState('6');

  useEffect(() => { loadUser(); }, []);
  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    if (me.empresa_id) { setEmpresaId(me.empresa_id); return; }
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 1);
    if (colabs?.[0]?.empresa_id) setEmpresaId(colabs[0].empresa_id);
  };

  const { data: propostas = [], isLoading, refetch } = useQuery({
    queryKey: ['dash-seguros', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.PropostaSeguro.filter({ empresa_id: empresaId }, '-created_date', 5000),
  });

  const { data: seguradoras = [] } = useQuery({
    queryKey: ['seguradoras', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Seguradora.filter({ empresa_id: empresaId }, 'nome'),
  });

  const hoje = new Date();
  const meses = parseInt(periodoMeses);
  const inicio = subMonths(hoje, meses);

  // Stats gerais
  const ativos = propostas.filter(p => p.status === 'em_dia').length;
  const emRenovacao = propostas.filter(p => p.status === 'em_renovacao').length;
  const atrasados = propostas.filter(p => p.status === 'atrasado').length;
  const vencidos = propostas.filter(p => p.status === 'vencido').length;
  const totalAdesoes = propostas.reduce((s, p) => s + (p.valor_adesao || 0), 0);
  const proximosRenovacao = propostas.filter(p => {
    if (!p.data_vencimento) return false;
    const d = differenceInDays(parseISO(p.data_vencimento), hoje);
    return d >= 0 && d <= 30 && p.status !== 'cancelado';
  }).length;

  // Vendas por mês
  const vendasPorMes = [];
  for (let i = meses - 1; i >= 0; i--) {
    const mesRef = subMonths(hoje, i);
    const label = format(mesRef, 'MMM/yy', { locale: ptBR });
    const count = propostas.filter(p => {
      if (!p.created_date) return false;
      const d = new Date(p.created_date);
      return d.getMonth() === mesRef.getMonth() && d.getFullYear() === mesRef.getFullYear();
    }).length;
    const adesoes = propostas.filter(p => {
      if (!p.created_date) return false;
      const d = new Date(p.created_date);
      return d.getMonth() === mesRef.getMonth() && d.getFullYear() === mesRef.getFullYear();
    }).reduce((s, p) => s + (p.valor_adesao || 0), 0);
    vendasPorMes.push({ mes: label, vendas: count, adesoes });
  }

  // Receita por seguradora
  const receitaPorSeguradora = [];
  const segMap = {};
  propostas.forEach(p => {
    const k = p.seguradora_nome || 'Outros';
    segMap[k] = (segMap[k] || 0) + (p.valor_adesao || 0);
  });
  Object.entries(segMap).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([nome, valor]) => {
    receitaPorSeguradora.push({ nome, valor });
  });

  // Status distribuição
  const statusData = [
    { name: 'Em Dia', value: ativos, color: '#10b981' },
    { name: 'Em Renovação', value: emRenovacao, color: '#f59e0b' },
    { name: 'Atrasado', value: atrasados, color: '#ef4444' },
    { name: 'Vencido', value: vencidos, color: '#94a3b8' },
  ].filter(s => s.value > 0);

  // Previsão de receita (próximos 30/60/90 dias)
  const previsaoReceita = (dias) => propostas
    .filter(p => p.status !== 'cancelado' && p.status !== 'vencido')
    .filter(p => {
      if (!p.data_vencimento) return false;
      const d = differenceInDays(parseISO(p.data_vencimento), hoje);
      return d >= 0 && d <= dias;
    })
    .reduce((s, p) => s + (p.valor_parcela || 0), 0);

  if (!user) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" /> Dashboard de Seguros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Visão estratégica do portfólio</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodoMeses} onValueChange={setPeriodoMeses}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Seguros Ativos', value: ativos, sub: 'apólices vigentes', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Adesões', value: `R$ ${totalAdesoes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, sub: 'comissão acumulada', icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Renovações', value: emRenovacao + proximosRenovacao, sub: 'pendentes nos 30 dias', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Inadimplentes', value: atrasados + vencidos, sub: 'atrasados + vencidos', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-3 rounded-xl ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-[10px] text-slate-400">{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Previsão de receita */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Próximos 30 dias', dias: 30, color: 'text-emerald-600' },
          { label: 'Próximos 60 dias', dias: 60, color: 'text-blue-600' },
          { label: 'Próximos 90 dias', dias: 90, color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>
                R$ {previsaoReceita(s.dias).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-400">previsão de parcelas</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Vendas por mês */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Vendas por Período</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={vendasPorMes} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="vendas" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Vendas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Receita por seguradora */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Receita por Seguradora</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={receitaPorSeguradora} layout="vertical" barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <YAxis dataKey="nome" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={v => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]} name="Adesões">
                  {receitaPorSeguradora.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição por status */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                  {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {statusData.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-slate-600">{s.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-900">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Adesões por mês */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Receita de Adesão por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={vendasPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Line type="monotone" dataKey="adesoes" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Adesões" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ver Propostas', href: '/Seguros', color: 'bg-blue-600' },
          { label: 'Renovações Pendentes', href: '/RenovacoesSeguro', color: 'bg-amber-500' },
          { label: 'Cobranças', href: '/CobrancaSeguro', color: 'bg-red-500' },
          { label: 'Configurações', href: '/ConfiguracaoSeguros', color: 'bg-slate-600' },
        ].map(a => (
          <Link key={a.label} to={a.href}>
            <div className={`${a.color} hover:opacity-90 transition text-white rounded-xl px-4 py-3 text-sm font-semibold text-center cursor-pointer`}>
              {a.label}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
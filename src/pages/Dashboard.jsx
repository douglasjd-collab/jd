import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import DashboardEmprestimos from '@/components/dashboard/DashboardEmprestimos';
import DashboardExecutivoCards from '@/components/dashboard/DashboardExecutivoCards';
import DashboardRankingVendedores from '@/components/dashboard/DashboardRankingVendedores';
import DashboardRankingFiliais from '@/components/dashboard/DashboardRankingFiliais';
import DashboardFunilConsolidado from '@/components/dashboard/DashboardFunilConsolidado';
import DashboardProducaoPorProduto from '@/components/dashboard/DashboardProducaoPorProduto';
import DashboardInsights from '@/components/dashboard/DashboardInsights';
import DashboardOportunidadesParadas from '@/components/dashboard/DashboardOportunidadesParadas';
import CipRetornoModal from '@/components/emprestimos/CipRetornoModal';
import LancesDoGrupoPanel from '@/components/simulador/LancesDoGrupoPanel';
import GraficoProducao from '@/components/dashboard/GraficoProducao';
import StatusBadge from '@/components/ui/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import {
  LayoutDashboard, TrendingUp, DollarSign, Users, Target, Cake, Search,
  Upload, ShoppingCart, AlertCircle, Building2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ABAS = [
  { key: 'executivo', label: '📊 Executivo', perfis: ['master', 'super_admin', 'admin', 'gerente', 'vendedor', 'colaborador', 'funcionario'] },
  { key: 'consorcio', label: '🛒 Consórcio', perfis: ['master', 'super_admin', 'admin', 'gerente', 'vendedor', 'colaborador', 'funcionario'] },
  { key: 'emprestimo', label: '📋 Empréstimo', perfis: ['master', 'super_admin', 'admin', 'gerente', 'vendedor', 'colaborador', 'funcionario'] },
];

const PERIODOS_RAPIDOS = [
  { label: 'Hoje', getRange: () => ({ inicio: format(new Date(), 'yyyy-MM-dd'), fim: format(new Date(), 'yyyy-MM-dd') }) },
  { label: '7 dias', getRange: () => ({ inicio: format(subDays(new Date(), 6), 'yyyy-MM-dd'), fim: format(new Date(), 'yyyy-MM-dd') }) },
  { label: '15 dias', getRange: () => ({ inicio: format(subDays(new Date(), 14), 'yyyy-MM-dd'), fim: format(new Date(), 'yyyy-MM-dd') }) },
  { label: '30 dias', getRange: () => ({ inicio: format(subDays(new Date(), 29), 'yyyy-MM-dd'), fim: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Este mês', getRange: () => ({ inicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'), fim: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState('executivo');
  const [periodo, setPeriodo] = useState(() => ({
    inicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    fim: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  }));
  const [periodoTemp, setPeriodoTemp] = useState(periodo);
  const [rapidoAtivo, setRapidoAtivo] = useState('Este mês');
  const [filtroVendedor, setFiltroVendedor] = useState('todos');
  const [filtroFilial, setFiltroFilial] = useState('todos');
  const [filtroProduto, setFiltroProduto] = useState('todos');
  const [cipModalOpen, setCipModalOpen] = useState(false);
  const [gruposModalOpen, setGruposModalOpen] = useState(false);
  const [grupoSelecionado, setGrupoSelecionado] = useState('');
  const [empPeriodo, setEmpPeriodo] = useState(() => ({
    inicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    fim: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  }));

  useEffect(() => {
    base44.auth.me().then(me => {
      if (!me) return;
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setUser({ ...me, perfil: 'super_admin', empresa_id: null, colaborador_id: null, nome_perfil: me.full_name });
        return;
      }
      base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date').then(colabs => {
        const colab = colabs?.[0];
        if (!colab) { setUser({ ...me, perfil: 'vendedor', empresa_id: null, colaborador_id: null, nome_perfil: me.full_name }); return; }
        if (['super_admin', 'master'].includes(colab.perfil)) {
          setUser({ ...me, perfil: colab.perfil, empresa_id: null, colaborador_id: colab.id, nome_perfil: colab.nome || me.full_name });
          return;
        }
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, colaborador_id: colab.id, nome_perfil: colab.nome || me.full_name, gerente_id: colab.gerente_id });
      });
    }).catch(() => {});
  }, []);

  const isAdmin = ['master', 'super_admin', 'admin'].includes(user?.perfil);
  const isGerente = user?.perfil === 'gerente';
  const isVendedor = ['vendedor', 'colaborador', 'funcionario'].includes(user?.perfil);
  const isParceiro = user?.perfil === 'parceiro';

  const { data: vendas = [] } = useQuery({
    queryKey: ['vendas-exec', user?.empresa_id, user?.perfil, user?.colaborador_id],
    enabled: !!user,
    queryFn: () => {
      const f = {};
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      if (isParceiro && user?.colaborador_id) f.vendedor_id = user.colaborador_id;
      return Object.keys(f).length > 0
        ? base44.entities.Venda.filter(f, '-data_venda', 300)
        : base44.entities.Venda.list('-data_venda', 300);
    },
    staleTime: 120000,
  });

  const { data: oportunidades = [] } = useQuery({
    queryKey: ['oport-exec', user?.empresa_id, isParceiro, user?.colaborador_id],
    enabled: !!user,
    queryFn: () => {
      const f = {};
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      if (isParceiro && user?.colaborador_id) f.vendedor_id = user.colaborador_id;
      return Object.keys(f).length > 0
        ? base44.entities.Oportunidade.filter(f, '-data_ultima_movimentacao', 200)
        : base44.entities.Oportunidade.list('-data_ultima_movimentacao', 200);
    },
    staleTime: 120000,
  });

  const { data: propostasEmprestimo = [] } = useQuery({
    queryKey: ['prop-emp-exec', user?.empresa_id, isParceiro, user?.colaborador_id],
    enabled: !!user,
    queryFn: () => {
      const f = { produto: 'emprestimo' };
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      if (isParceiro && user?.colaborador_id) f.vendedor_id = user.colaborador_id;
      return base44.entities.Proposta.filter(f, '-data_venda', 300);
    },
    staleTime: 120000,
  });

  const { data: propostasFinanciamento = [] } = useQuery({
    queryKey: ['prop-fin-exec', user?.empresa_id, isParceiro, user?.colaborador_id],
    enabled: !!user,
    queryFn: () => {
      const f = { produto: 'financiamento' };
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      if (isParceiro && user?.colaborador_id) f.vendedor_id = user.colaborador_id;
      return base44.entities.Proposta.filter(f, '-data_venda', 200);
    },
    staleTime: 120000,
  });

  const { data: propostasSeguros = [] } = useQuery({
    queryKey: ['prop-seg-exec', user?.empresa_id, isParceiro, user?.colaborador_id],
    enabled: !!user,
    queryFn: () => {
      const f = {};
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      if (isParceiro && user?.colaborador_id) f.vendedor_id = user.colaborador_id;
      return base44.entities.PropostaSeguro.filter(f, '-data_inicio', 200);
    },
    staleTime: 120000,
  });

  const { data: statusPropostaList = [] } = useQuery({
    queryKey: ['status-prop-exec', user?.empresa_id],
    enabled: !!user,
    queryFn: () => {
      const f = { ativo: true };
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      return base44.entities.StatusProposta.filter(f);
    },
    staleTime: 300000, // 5 minutos
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-exec', user?.empresa_id, isParceiro, user?.colaborador_id],
    enabled: !!user,
    queryFn: () => {
      const f = { status: 'ativo' };
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      if (isParceiro && user?.colaborador_id) f.vendedor_id = user.colaborador_id;
      return base44.entities.Cliente.filter(f, '-created_date', 500);
    },
    staleTime: 300000,
  });

  const { data: receitas = [] } = useQuery({
    queryKey: ['receitas-exec', user?.empresa_id],
    enabled: !!user && isAdmin,
    queryFn: () => {
      const f = user?.empresa_id ? { empresa_id: user.empresa_id } : {};
      return base44.entities.Receita.filter(f, '-data', 300);
    },
    staleTime: 120000,
  });

  const { data: despesas = [] } = useQuery({
    queryKey: ['despesas-exec', user?.empresa_id],
    enabled: !!user && isAdmin,
    queryFn: () => {
      const f = user?.empresa_id ? { empresa_id: user.empresa_id } : {};
      return base44.entities.Despesa.filter(f, '-data', 300);
    },
    staleTime: 120000,
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-exec', user?.empresa_id],
    enabled: !!user,
    queryFn: () => {
      const f = { status: 'ativa' };
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      return base44.entities.EtapaFunil.filter(f, 'ordem');
    },
    staleTime: 300000,
  });

  const { data: parcelas = [] } = useQuery({
    queryKey: ['parcelas-exec'],
    enabled: !!user,
    queryFn: () => base44.entities.Parcela.list('-created_date', 200),
    staleTime: 120000,
  });

  const { data: importacoes = [] } = useQuery({
    queryKey: ['importacoes-exec', user?.empresa_id],
    enabled: !!user?.empresa_id,
    queryFn: () => base44.entities.ImportacaoAssembleia.filter({ empresa_id: user.empresa_id }, '-created_date', 5),
    staleTime: 300000,
  });

  // Mapa colaborador_id → filial_nome para enriquecer o ranking de filiais
  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colabs-filial-exec', user?.empresa_id],
    enabled: !!user && isAdmin,
    queryFn: () => user?.empresa_id
      ? base44.entities.Colaborador.filter({ empresa_id: user.empresa_id }, 'nome', 300)
      : base44.entities.Colaborador.list('nome', 300),
    staleTime: 300000,
  });

  const mapaColaboradorFilial = useMemo(() => {
    const m = {};
    colaboradores.forEach(c => { if (c.id) m[c.id] = c.filial_nome || null; });
    return m;
  }, [colaboradores]);

  const { data: propostasCip = [] } = useQuery({
    queryKey: ['cip-exec', user?.empresa_id],
    enabled: !!user,
    queryFn: async () => {
      const hoje = format(new Date(), 'yyyy-MM-dd');
      const f = { produto: 'emprestimo' };
      if (user.empresa_id) f.empresa_id = user.empresa_id;
      if (isParceiro && user.colaborador_id) f.vendedor_id = user.colaborador_id;
      const todas = await base44.entities.Proposta.filter(f, '-created_date', 200);
      return todas.filter(p => p.cip_data_retorno_prevista === hoje);
    },
    staleTime: 300000, // 5 minutos
  });

  // Filtros aplicados
  const vendasFiltradas = useMemo(() => vendas.filter(v => {
    if (v.status === 'cancelada') return false;
    if ((isVendedor || isParceiro) && user?.colaborador_id && v.vendedor_id !== user.colaborador_id) return false;
    if (isGerente && user?.colaborador_id && v.gerente_id !== user.colaborador_id && v.vendedor_id !== user.colaborador_id) return false;
    if (filtroVendedor !== 'todos' && v.vendedor_nome !== filtroVendedor) return false;
    if (filtroFilial !== 'todos' && v.filial_nome !== filtroFilial) return false;
    return true;
  }), [vendas, isVendedor, isGerente, user, filtroVendedor, filtroFilial]);

  const oportunidadesFiltradas = useMemo(() => oportunidades.filter(o => {
    if ((isVendedor || isParceiro) && user?.colaborador_id && o.vendedor_id !== user.colaborador_id) return false;
    if (filtroVendedor !== 'todos' && o.vendedor_nome !== filtroVendedor) return false;
    return true;
  }), [oportunidades, isVendedor, user, filtroVendedor]);

  // Aniversariantes
  const clientesFiltrados = useMemo(() => (isVendedor || isParceiro) && user?.colaborador_id ? clientes.filter(c => c.vendedor_id === user.colaborador_id) : clientes, [clientes, isVendedor, isParceiro, user]);
  const hoje = new Date();
  const aniversariantesHoje = useMemo(() => clientesFiltrados.filter(c => {
    if (!c.data_nascimento) return false;
    const d = new Date(c.data_nascimento + 'T12:00:00');
    return d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth();
  }), [clientesFiltrados]);
  const aniversariantesSemana = useMemo(() => {
    const ini = startOfWeek(hoje, { weekStartsOn: 0 });
    const fim = endOfWeek(hoje, { weekStartsOn: 0 });
    return clientesFiltrados.filter(c => {
      if (!c.data_nascimento) return false;
      const d = new Date(c.data_nascimento + 'T12:00:00');
      const aniv = new Date(hoje.getFullYear(), d.getMonth(), d.getDate());
      return aniv >= ini && aniv <= fim;
    });
  }, [clientesFiltrados]);

  // Vendedores únicos para filtro
  const vendedoresUnicos = useMemo(() => [...new Set(vendas.map(v => v.vendedor_nome).filter(Boolean))].sort(), [vendas]);
  const filiaisUnicas = useMemo(() => [...new Set(vendas.map(v => v.filial_nome).filter(Boolean))].sort(), [vendas]);

  // Consórcio - gráfico por mês
  const vendasPorMes = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const mes = format(date, 'yyyy-MM');
      const vendasMes = vendasFiltradas.filter(v => (v.data_venda || '').startsWith(mes));
      months.push({ name: format(date, 'MMM', { locale: ptBR }), vendas: vendasMes.length, valor: vendasMes.reduce((a, v) => a + (v.valorCredito || 0), 0) });
    }
    return months;
  }, [vendasFiltradas]);

  const vendasMesPeriodo = useMemo(() => vendasFiltradas.filter(v => (v.data_venda || '') >= periodo.inicio && (v.data_venda || '') <= periodo.fim), [vendasFiltradas, periodo]);
  const rankingConsorc = useMemo(() => {
    const s = {};
    vendasMesPeriodo.forEach(v => {
      const n = v.vendedor_nome || 'Sem vendedor';
      if (!s[n]) s[n] = { nome: n, vendas: 0, valor: 0 };
      s[n].vendas++; s[n].valor += v.valorCredito || 0;
    });
    return Object.values(s).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [vendasMesPeriodo]);

  const parcelasAtrasadas = parcelas.filter(p => p.status === 'atrasada').length;

  const aplicarPeriodo = () => {
    setPeriodo(periodoTemp);
    setRapidoAtivo('');
  };
  const aplicarRapido = (label, range) => {
    setPeriodo(range);
    setPeriodoTemp(range);
    setRapidoAtivo(label);
  };

  if (!user) return <div className="flex items-center justify-center min-h-[400px]"><p className="text-slate-500">Carregando...</p></div>;

  return (
    <ErrorBoundary>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
              Olá, {user?.nome_perfil?.split(' ')[0] || user?.full_name?.split(' ')[0]}! 👋
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">{format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
          </div>
          {propostasCip.length > 0 && (
            <button onClick={() => setCipModalOpen(true)} className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2 text-sm font-medium hover:bg-amber-100 transition-colors">
              <AlertCircle className="w-4 h-4" />
              {propostasCip.length} CIP(s) com retorno hoje
            </button>
          )}
        </div>

        {/* Aniversariantes */}
        {aniversariantesHoje.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
            <span className="text-xl">🎉</span>
            <div>
              <p className="font-semibold text-amber-900 text-sm">Aniversariantes de Hoje!</p>
              <p className="text-amber-800 text-sm">{aniversariantesHoje.map(c => c.nome_completo || c.pj_razao_social).join(' • ')}</p>
            </div>
          </div>
        )}

        {/* Abas */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
          {ABAS.map(aba => (
            <button key={aba.key} onClick={() => setAbaAtiva(aba.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${abaAtiva === aba.key ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
              {aba.label}
            </button>
          ))}
        </div>

        {/* Filtros Globais */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1 flex-wrap">
              {PERIODOS_RAPIDOS.map(({ label, getRange }) => (
                <button key={label} onClick={() => aplicarRapido(label, getRange())}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${rapidoAtivo === label ? 'bg-[#23BE84] text-white border-[#23BE84]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#23BE84]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <input type="date" value={periodoTemp.inicio} onChange={e => { setPeriodoTemp(p => ({ ...p, inicio: e.target.value })); setRapidoAtivo(''); }}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#23BE84]" />
              <span className="text-slate-400 text-xs">até</span>
              <input type="date" value={periodoTemp.fim} onChange={e => { setPeriodoTemp(p => ({ ...p, fim: e.target.value })); setRapidoAtivo(''); }}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#23BE84]" />
              <Button onClick={aplicarPeriodo} size="sm" className="bg-[#23BE84] hover:bg-[#1da570] text-white text-xs h-8">Aplicar</Button>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Todos vendedores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos vendedores</SelectItem>
                  {vendedoresUnicos.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroFilial} onValueChange={setFiltroFilial}>
                <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Todas filiais" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas filiais</SelectItem>
                  {filiaisUnicas.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
              {(filtroVendedor !== 'todos' || filtroFilial !== 'todos') && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFiltroVendedor('todos'); setFiltroFilial('todos'); }}>✕ Limpar</Button>
              )}
            </div>
          )}
        </div>

        {/* ─── ABA EXECUTIVO ─── */}
        {abaAtiva === 'executivo' && (
          <div className="space-y-5">
            <DashboardExecutivoCards vendas={vendasFiltradas} oportunidades={oportunidadesFiltradas} propostas={propostasEmprestimo} propostasFinanciamento={propostasFinanciamento} propostasSeguros={propostasSeguros} user={user} periodo={periodo} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <DashboardFunilConsolidado oportunidades={oportunidadesFiltradas} etapas={etapas} />
              <DashboardInsights vendas={vendasFiltradas} oportunidades={oportunidadesFiltradas} propostas={propostasEmprestimo} periodo={periodo} />
            </div>

            <DashboardProducaoPorProduto vendas={vendasFiltradas} propostas={propostasEmprestimo} periodo={periodo} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <DashboardRankingVendedores vendas={vendasFiltradas} propostas={propostasEmprestimo} propostasFinanciamento={propostasFinanciamento} propostasSeguros={propostasSeguros} periodo={periodo} />
              {isAdmin && <DashboardRankingFiliais vendas={vendasFiltradas} propostas={propostasEmprestimo} propostasFinanciamento={propostasFinanciamento} propostasSeguros={propostasSeguros} periodo={periodo} mapaColaboradorFilial={mapaColaboradorFilial} />}
            </div>

            <DashboardOportunidadesParadas oportunidades={oportunidadesFiltradas} />

            {/* Aniversariantes da semana */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Cake className="w-5 h-5 text-pink-500" />
                  Aniversariantes da Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aniversariantesSemana.length === 0 ? (
                  <p className="text-center text-slate-400 py-4">Nenhum aniversariante esta semana</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {aniversariantesSemana.map(c => {
                      const d = new Date(c.data_nascimento + 'T12:00:00');
                      const ehHoje = d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth();
                      return (
                        <div key={c.id} onClick={() => navigate(`/ClienteDetalhes?id=${c.id}`)}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${ehHoje ? 'bg-amber-100 border border-amber-300' : 'bg-slate-50 hover:bg-slate-100'}`}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${ehHoje ? 'bg-amber-500 text-white' : 'bg-pink-100 text-pink-600'}`}>
                            <Cake className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{c.nome_completo || c.pj_razao_social} {ehHoje && '🎉'}</p>
                            <p className="text-xs text-slate-500">{format(d, 'dd/MM')}{c.celular ? ` • ${c.celular}` : ''}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── ABA CONSÓRCIO ─── */}
        {abaAtiva === 'consorcio' && (
          <div className="space-y-5">
            {/* Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: DollarSign, title: 'Total Vendas', value: BRL(vendasMesPeriodo.reduce((a, v) => a + (v.valorCredito || 0), 0)), sub: `${vendasMesPeriodo.length} vendas`, color: 'green' },
                { icon: TrendingUp, title: 'Oportunidades', value: oportunidadesFiltradas.filter(o => o.status === 'aberta').length, sub: BRL(oportunidadesFiltradas.filter(o => o.status === 'aberta').reduce((a, o) => a + (o.valor_estimado || 0), 0)), color: 'purple' },
                { icon: AlertCircle, title: 'Parcelas Atrasadas', value: parcelasAtrasadas, color: parcelasAtrasadas > 0 ? 'red' : 'green' },
                { icon: Cake, title: 'Aniversariantes', value: aniversariantesSemana.length, sub: aniversariantesHoje.length > 0 ? `${aniversariantesHoje.length} hoje!` : 'Nenhum hoje', color: aniversariantesHoje.length > 0 ? 'amber' : 'blue' },
              ].map((c, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                  <p className="text-xs text-slate-500">{c.title}</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{c.value}</p>
                  {c.sub && <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>

            <GraficoProducao 
              dados={vendasPorMes.map(d => ({ ...d, quantidade: d.vendas }))}
              titulo="Produção de Consórcios por Mês"
              subtitle="Acompanhe a evolução mensal da produção em quantidade e valor."
              tipo="consorcio"
              meta={150} // Exemplo de meta
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <DashboardRankingVendedores vendas={vendasMesPeriodo} propostas={[]} propostasFinanciamento={[]} propostasSeguros={[]} periodo={periodo} />

              {/* Vendas do período */}
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle>Vendas do Período</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-72 overflow-y-auto">
                    {vendasMesPeriodo.length === 0 ? (
                      <p className="text-center text-slate-400 py-8">Nenhuma venda no período</p>
                    ) : vendasMesPeriodo.slice(0, 10).map(v => (
                      <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                            <ShoppingCart className="w-4 h-4 text-blue-700" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{v.cliente_nome}</p>
                            <p className="text-xs text-slate-500">Grupo {v.grupo} • Cota {v.cota || 'Pendente'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{BRL(v.valorCredito || 0)}</p>
                          <StatusBadge status={v.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Importações */}
            {importacoes.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-blue-500" />Últimas Importações de Assembleia</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {importacoes.map(imp => (
                      <div key={imp.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <div>
                          <p className="font-medium text-sm">{imp.arquivo_nome}</p>
                          <p className="text-xs text-slate-500">{imp.assembleia_data ? format(new Date(imp.assembleia_data + 'T12:00:00'), 'dd/MM/yyyy') : '-'} • {imp.chamada}</p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={imp.status} />
                          <p className="text-xs text-slate-400 mt-1">{imp.total_registros || 0} registros</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Modal grupos */}
            {gruposModalOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setGruposModalOpen(false)}>
                <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="p-6 border-b">
                    <h2 className="text-xl font-bold mb-4">Histórico de Lances dos Grupos</h2>
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <Input placeholder="Digite o número do grupo" value={grupoSelecionado} onChange={e => setGrupoSelecionado(e.target.value)} className="pl-10" />
                      </div>
                      <Button onClick={() => setGrupoSelecionado('')} variant="outline">Limpar</Button>
                    </div>
                  </div>
                  <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
                    {grupoSelecionado ? <LancesDoGrupoPanel grupo={grupoSelecionado} /> : (
                      <div className="text-center py-12 text-slate-500">
                        <Search className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                        <p>Digite um número de grupo para visualizar o histórico</p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t flex justify-end">
                    <button onClick={() => { setGruposModalOpen(false); setGrupoSelecionado(''); }} className="px-4 py-2 bg-slate-200 rounded-lg font-medium">Fechar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── ABA EMPRÉSTIMO ─── */}
        {abaAtiva === 'emprestimo' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-2">📅 Período de Produção (Empréstimos)</p>
              <div className="flex flex-wrap gap-2 items-center">
                {PERIODOS_RAPIDOS.map(({ label, getRange }) => (
                  <button key={label} onClick={() => setEmpPeriodo(getRange())}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${JSON.stringify(empPeriodo) === JSON.stringify(getRange()) ? 'bg-[#23BE84] text-white border-[#23BE84]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#23BE84]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <DashboardEmprestimos
              propostasEmprestimo={propostasEmprestimo}
              statusPropostaList={statusPropostaList}
              filtroInicio={empPeriodo.inicio}
              filtroFim={empPeriodo.fim}
              isVendedor={isVendedor}
              user={user}
              formatCurrency={BRL}
            />
          </div>
        )}

        <CipRetornoModal open={cipModalOpen} onOpenChange={setCipModalOpen} propostas={propostasCip} />
      </div>
    </ErrorBoundary>
  );
}
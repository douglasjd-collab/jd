import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Car, Bike, Truck, FileText, TrendingUp, TrendingDown, RefreshCw, Users, Building2, Store, Trophy, Medal, ChevronUp, ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const STATUS_LABELS = {
  em_analise: 'Em Análise', aguardando_documentacao: 'Aguard. Doc.', aprovado: 'Aprovado',
  reprovado: 'Reprovado', contrato_emitido: 'Contrato Emitido', pago_pelo_banco: 'Pago pelo Banco',
  comissao_recebida: 'Comissão Recebida', cancelado: 'Cancelado',
};

const PERIODOS = [
  { value: '7', label: 'Últimos 7 dias' }, { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' }, { value: '365', label: 'Este ano' }, { value: 'all', label: 'Todos' },
];

const DONUT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
const fmtNumber = val => new Intl.NumberFormat('pt-BR').format(val || 0);

// ─── Medalha + Barra de Desempenho ────────────────────────────────────────────
const RankBar = ({ pos, nome, valor, contratos, percentual, valorMax, cor, comparacao }) => {
  const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '';
  const barWidth = valorMax > 0 ? (valor / valorMax) * 100 : 0;
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {medal ? <span className="text-lg">{medal}</span> : <span className="w-5 text-center text-sm font-bold text-slate-400">{pos}º</span>}
          <span className="font-medium text-sm text-slate-700 truncate max-w-32">{nome}</span>
          {comparacao != null && (
            <span className={`flex items-center text-xs font-semibold ${comparacao >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {comparacao >= 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {Math.abs(comparacao)}%
            </span>
          )}
        </div>
        <span className="text-sm font-bold text-slate-700">{fmt(valor)}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barWidth}%`, backgroundColor: cor }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{contratos} contrato{contratos !== 1 ? 's' : ''}</span>
        <span>{percentual.toFixed(1)}%</span>
      </div>
    </div>
  );
};

// ─── Card KPI individual ──────────────────────────────────────────────────────
const KPICard = ({ icon: Icon, label, value, sub, color, bgColor }) => (
  <div className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bgColor}`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
    </div>
  </div>
);

export default function DashboardFinanciamento({ user }) {
  const [propostas, setPropostas] = useState([]);
  const [propostasAnteriores, setPropostasAnteriores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState('30');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const empresaId = user?.empresa_id;

  const carregar = async () => {
    setLoading(true);
    const filtro = empresaId ? { empresa_id: empresaId } : {};
    const p = await base44.entities.FinanciamentoVeiculo.filter(filtro, '-created_date', 2000);
    setPropostas(p || []);
    setPropostasAnteriores(p || []); // snapshot completo para comparação
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  const hoje = new Date();

  // Filtro principal
  const filtradas = useMemo(() => propostas.filter(p => {
    if (filtroStatus !== 'all' && p.status !== filtroStatus) return false;
    if (filtroTipo !== 'all' && p.tipo_veiculo !== filtroTipo) return false;
    if (filtroPeriodo !== 'all') {
      const dias = parseInt(filtroPeriodo);
      const limite = new Date(); limite.setDate(hoje.getDate() - dias);
      const dp = p.data_proposta ? new Date(p.data_proposta) : new Date(p.created_date);
      if (dp < limite) return false;
    }
    return true;
  }), [propostas, filtroStatus, filtroTipo, filtroPeriodo]);

  // Período anterior (para comparação)
  const anteriores = useMemo(() => {
    if (filtroPeriodo === 'all') return [];
    const dias = parseInt(filtroPeriodo) || 30;
    const fim = new Date(); fim.setDate(hoje.getDate() - dias);
    const inicio = new Date(fim); inicio.setDate(fim.getDate() - dias);
    return propostasAnteriores.filter(p => {
      const dp = p.data_proposta ? new Date(p.data_proposta) : new Date(p.created_date);
      return dp >= inicio && dp < fim;
    });
  }, [propostasAnteriores, filtroPeriodo]);

  // ─── KPIs Gerais ──────────────────────────────────────────────────────────
  const totalContratos = filtradas.length;
  const totalFinanciado = filtradas.reduce((s, p) => s + (p.valor_financiado || 0), 0);
  const ticketMedioGeral = totalContratos > 0 ? totalFinanciado / totalContratos : 0;

  // Ranking por Vendedor
  const rankingVendedores = useMemo(() => {
    const map = {};
    filtradas.forEach(p => {
      const nome = p.vendedor_nome || 'Não informado';
      if (!map[nome]) map[nome] = { nome, valor: 0, contratos: 0 };
      map[nome].valor += p.valor_financiado || 0;
      map[nome].contratos += 1;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [filtradas]);

  // Ranking anterior para comparação
  const rankingAnterior = useMemo(() => {
    const map = {};
    anteriores.forEach(p => {
      const nome = p.vendedor_nome || 'Não informado';
      if (!map[nome]) map[nome] = { nome, valor: 0 };
      map[nome].valor += p.valor_financiado || 0;
    });
    return map;
  }, [anteriores]);

  const melhorVendedor = rankingVendedores[0];
  const valorMaxVendedor = rankingVendedores[0]?.valor || 1;

  // Ranking por Banco (Donut)
  const rankingBancos = useMemo(() => {
    const map = {};
    filtradas.forEach(p => {
      const banco = p.banco || 'Outros';
      if (!map[banco]) map[banco] = { name: banco, value: 0, contratos: 0 };
      map[banco].value += p.valor_financiado || 0;
      map[banco].contratos += 1;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [filtradas]);

  const melhorBanco = rankingBancos[0];

  // Ranking por Loja Parceira
  const rankingParceiros = useMemo(() => {
    const map = {};
    filtradas.forEach(p => {
      const loja = p.empresa_parceira_nome || 'Não informada';
      if (!map[loja]) map[loja] = { loja, valor: 0, contratos: 0 };
      map[loja].valor += p.valor_financiado || 0;
      map[loja].contratos += 1;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [filtradas]);

  const melhorParceiro = rankingParceiros[0];
  const valorMaxParceiro = rankingParceiros[0]?.valor || 1;

  // Comissão estimada (exemplo: ~2%)
  const comissaoEstimada = rankingVendedores.map(v => ({ nome: v.nome, comissao: v.valor * 0.02 }));

  // ─── Gráfico de colunas: Vendedores ───────────────────────────────────────
  const chartVendedores = rankingVendedores.slice(0, 8).map(v => ({
    nome: v.nome.split(' ')[0], valor: v.valor, contratos: v.contratos,
  }));

  // ─── Comparação mensal ────────────────────────────────────────────────────
  const getComparacao = (nome) => {
    const atual = rankingVendedores.find(v => v.nome === nome)?.valor || 0;
    const ant = rankingAnterior[nome]?.valor || 0;
    if (ant === 0) return null;
    return Math.round(((atual - ant) / ant) * 100);
  };

  const totalAnterior = anteriores.reduce((s, p) => s + (p.valor_financiado || 0), 0);
  const compTotal = totalAnterior > 0 ? Math.round(((totalFinanciado - totalAnterior) / totalAnterior) * 100) : null;

  // ─── Tabela de status ─────────────────────────────────────────────────────
  const porStatus = Object.entries(STATUS_LABELS).map(([key, label]) => ({
    key, label,
    qtd: filtradas.filter(p => p.status === key).length,
    valor: filtradas.filter(p => p.status === key).reduce((s, p) => s + (p.valor_financiado || 0), 0),
  })).filter(s => s.qtd > 0);

  if (loading) return <div className="text-center py-20 text-slate-400">Carregando dashboard...</div>;

  return (
    <div className="space-y-6">
      {/* Cabeçalho + Filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Dashboard Executivo</h2>
          <p className="text-sm text-slate-500">Visão consolidada da performance de financiamentos</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={carregar}><RefreshCw className="w-4 h-4 mr-1" />Atualizar</Button>
        </div>
      </div>

      {/* KPIs Gerais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={FileText} label="Total Financiado" value={fmt(totalFinanciado)}
          sub={compTotal != null ? `${compTotal >= 0 ? '▲' : '▼'} ${Math.abs(compTotal)}% vs anterior` : null}
          color="text-blue-600" bgColor="bg-blue-50" />
        <KPICard icon={TrendingUp} label="Contratos" value={fmtNumber(totalContratos)}
          color="text-green-600" bgColor="bg-green-50" />
        <KPICard icon={TrendingUp} label="Ticket Médio" value={fmt(ticketMedioGeral)}
          color="text-purple-600" bgColor="bg-purple-50" />
        <KPICard icon={Trophy} label="Melhor Vendedor" value={melhorVendedor?.nome || '—'}
          sub={melhorVendedor ? fmt(melhorVendedor.valor) : ''} color="text-amber-600" bgColor="bg-amber-50" />
        <KPICard icon={Building2} label="Melhor Banco" value={melhorBanco?.name || '—'}
          sub={melhorBanco ? fmt(melhorBanco.value) : ''} color="text-teal-600" bgColor="bg-teal-50" />
        <KPICard icon={Store} label="Melhor Parceiro" value={melhorParceiro?.loja || '—'}
          sub={melhorParceiro ? fmt(melhorParceiro.valor) : ''} color="text-orange-600" bgColor="bg-orange-50" />
      </div>

      {/* Gráficos: Vendedores (colunas) + Bancos (donut) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-600" />Valor Financiado por Vendedor</CardTitle></CardHeader>
          <CardContent>
            {chartVendedores.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartVendedores} layout="vertical" margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" fontSize={11} tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="nome" fontSize={12} width={80} />
                  <Tooltip formatter={(value, name) => [fmt(value ?? 0), 'Valor Financiado']} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="valor" name="Valor" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-green-600" />Participação dos Bancos</CardTitle></CardHeader>
          <CardContent>
            {rankingBancos.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Sem dados</p> : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={240}>
                  <PieChart>
                    <Pie data={rankingBancos} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={55}>
                      {rankingBancos.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 text-xs">
                  {rankingBancos.slice(0, 6).map((b, i) => (
                    <div key={b.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-slate-600 truncate max-w-24">{b.name}</span>
                      <span className="font-semibold text-slate-700">{fmt(b.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Líder do Período */}
      {melhorVendedor && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
                <Trophy className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">🏆 Líder do Período</p>
                <p className="text-xl font-bold text-slate-800">{melhorVendedor.nome}</p>
              </div>
              <div className="flex gap-6 ml-auto">
                <div className="text-center"><p className="text-lg font-bold text-slate-800">{fmt(melhorVendedor.valor)}</p><p className="text-xs text-slate-500">Valor Financiado</p></div>
                <div className="text-center"><p className="text-lg font-bold text-slate-800">{melhorVendedor.contratos}</p><p className="text-xs text-slate-500">Contratos</p></div>
                <div className="text-center"><p className="text-lg font-bold text-slate-800">{fmt(melhorVendedor.valor / melhorVendedor.contratos)}</p><p className="text-xs text-slate-500">Ticket Médio</p></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rankings com barras de desempenho */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ranking Vendedores */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" />Ranking de Vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            {rankingVendedores.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Sem dados</p> : (
              <div className="space-y-4">
                {rankingVendedores.slice(0, 8).map((v, i) => (
                  <RankBar key={v.nome} pos={i + 1} nome={v.nome} valor={v.valor}
                    contratos={v.contratos} percentual={totalFinanciado > 0 ? (v.valor / totalFinanciado) * 100 : 0}
                    valorMax={valorMaxVendedor} cor={['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'][i] || '#94a3b8'}
                    comparacao={getComparacao(v.nome)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking Bancos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-green-600" />Ranking de Bancos</CardTitle>
          </CardHeader>
          <CardContent>
            {rankingBancos.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Sem dados</p> : (
              <div className="space-y-4">
                {rankingBancos.slice(0, 8).map((b, i) => (
                  <RankBar key={b.name} pos={i + 1} nome={b.name} valor={b.value}
                    contratos={b.contratos} percentual={totalFinanciado > 0 ? (b.value / totalFinanciado) * 100 : 0}
                    valorMax={rankingBancos[0]?.value || 1}
                    cor={['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'][i] || '#94a3b8'} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking Parceiros */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Store className="w-4 h-4 text-orange-600" />Ranking de Lojas Parceiras</CardTitle>
          </CardHeader>
          <CardContent>
            {rankingParceiros.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Sem dados</p> : (
              <div className="space-y-4">
                {rankingParceiros.slice(0, 8).map((p, i) => (
                  <RankBar key={p.loja} pos={i + 1} nome={p.loja} valor={p.valor}
                    contratos={p.contratos} percentual={totalFinanciado > 0 ? (p.valor / totalFinanciado) * 100 : 0}
                    valorMax={valorMaxParceiro}
                    cor={['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'][i] || '#94a3b8'} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline por Status */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pipeline por Status</CardTitle></CardHeader>
        <CardContent>
          {porStatus.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Sem dados</p> : (
            <div className="space-y-3">
              {porStatus.map(s => {
                const pct = totalContratos > 0 ? (s.qtd / totalContratos) * 100 : 0;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-40 shrink-0 truncate">{s.label}</span>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(pct, 2)}%` }}>
                        {pct > 10 && <span className="text-xs text-white font-medium">{pct.toFixed(0)}%</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-slate-700 w-8 text-right">{s.qtd}</span>
                    <span className="text-xs text-slate-500 w-28 text-right">{fmt(s.valor)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle, Upload, X, Calendar, Building2, CreditCard, Hash, Key, MoreVertical, Eye, AlertTriangle, DollarSign, Clock, PieChart, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts';
import TransacoesTab from '@/components/meu_financeiro/TransacoesTab';
import DRETab from '@/components/meu_financeiro/DRETab';
import FormModalFinanceiro from '@/components/meu_financeiro/FormModalFinanceiro';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Helpers ───────────────────────────────────────────────
const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const hoje = () => format(new Date(), 'yyyy-MM-dd');
const inicioMes = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');
const fimMes = () => format(endOfMonth(new Date()), 'yyyy-MM-dd');

// ─── Componente Principal ──────────────────────────────────
const ABAS_OPTIONS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'transacoes', label: 'Transações' },
  { value: 'receitas', label: 'Receitas' },
  { value: 'despesas', label: 'Despesas' },
  { value: 'contas', label: 'Contas' },
  { value: 'projecao', label: 'Projeção' },
  { value: 'dre', label: 'DRE' },
];

export default function MeuFinanceiro() {
  const [user, setUser] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me) { setCarregando(false); return; }
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date');
        const colab = colabs.find(c => c.status === 'ativo') || colabs[0];
        setUser({ ...me, colaborador_id: colab?.id, empresa_id: colab?.empresa_id, nome_perfil: colab?.nome || me.full_name });
      } catch (e) { console.error(e); } finally { setCarregando(false); }
    })();
  }, []);

  const onSaved = () => setRefreshKey(k => k + 1);

  if (carregando) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (!user) return <div className="text-center py-20 text-slate-500">Usuário não encontrado.</div>;

  const abaLabel = ABAS_OPTIONS.find(a => a.value === aba)?.label || 'Dashboard';

  return (
    <div className="space-y-4">
      {/* Header com select de navegação estilo app */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Meu Financeiro</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{user.nome_perfil || user.full_name}</p>
        </div>
        {/* Select estilo pill roxo */}
        <Select value={aba} onValueChange={setAba}>
          <SelectTrigger className="w-auto gap-2 bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-full px-5 h-10 font-semibold text-sm focus:ring-0 [&>svg]:text-white">
            <SelectValue>{abaLabel} ▾</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ABAS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsContent value="dashboard"><DashboardTab user={user} refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="transacoes"><TransacoesTab user={user} refreshKey={refreshKey} onSaved={onSaved} /></TabsContent>
        <TabsContent value="receitas"><ReceitasTab user={user} refreshKey={refreshKey} onSaved={onSaved} /></TabsContent>
        <TabsContent value="despesas"><DespesasTab user={user} refreshKey={refreshKey} onSaved={onSaved} /></TabsContent>
        <TabsContent value="contas"><ContasTab user={user} refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="projecao"><ProjecaoTab user={user} refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="dre"><DRETab user={user} refreshKey={refreshKey} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────
const PIE_COLORS = ['#22c55e', '#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308'];

function DashboardTab({ user, refreshKey }) {
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mesFiltro, setMesFiltro] = useState(format(new Date(), 'yyyy-MM'));

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const filtro = { usuario_id: user.id, empresa_id: user.empresa_id };
      const [r, d, c] = await Promise.all([
        base44.entities.MeuFinanceiroReceita.filter(filtro, '-data', 2000),
        base44.entities.MeuFinanceiroDespesa.filter(filtro, '-data', 2000),
        base44.entities.MeuFinanceiroContaBancaria.filter({ usuario_id: user.id, empresa_id: user.empresa_id }, 'nome_conta', 50),
      ]);
      setReceitas(r); setDespesas(d); setContas(c);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const filtrarPorMes = (arr) => arr.filter(item => item.data?.startsWith(mesFiltro));
  const receitasMes = filtrarPorMes(receitas);
  const despesasMes = filtrarPorMes(despesas);

  // Totais do mês
  const receitaRealizada = receitasMes.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
  const receitaPrevista = receitasMes.filter(r => r.status === 'pendente').reduce((s, r) => s + (r.valor || 0), 0) + receitaRealizada;
  const totalDespesas = despesasMes.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
  const lucroLiquido = receitaRealizada - totalDespesas;
  // A Receber: receitas pendentes/previstas do mês filtrado
  const aReceber = receitasMes.filter(r => r.status === 'pendente' || r.status === 'previsto').reduce((s, r) => s + (r.valor || 0), 0);

  // A Pagar: despesas não pagas do mês filtrado + todas as atrasadas (vencidas antes do mês filtrado)
  const [mesFiltroAno, mesFiltroMes] = mesFiltro.split('-').map(Number);
  const inicioMesFiltrado = `${mesFiltro}-01`;
  const fimMesFiltrado = format(endOfMonth(new Date(mesFiltroAno, mesFiltroMes - 1, 1)), 'yyyy-MM-dd');
  const aPagar = despesas.filter(d => {
    if (d.status === 'pago' || d.status === 'cancelado') return false;
    const dataRef = d.data_vencimento || d.data;
    if (!dataRef) return false;
    // Do mês filtrado ou antes (atrasadas)
    return dataRef <= fimMesFiltrado;
  }).reduce((s, d) => s + (d.valor || 0), 0);

  // Contas atrasadas: sempre baseado na data atual (independente do filtro)
  const hojeStr = hoje();
  const contasAtrasadas = despesas.filter(d => (d.status === 'pendente' || d.status === 'previsto' || d.status === 'atrasado') && d.data_vencimento && d.data_vencimento < hojeStr).reduce((s, d) => s + (d.valor || 0), 0);
  const qtdAtrasadas = despesas.filter(d => (d.status === 'pendente' || d.status === 'previsto' || d.status === 'atrasado') && d.data_vencimento && d.data_vencimento < hojeStr).length;

  // Saldo bancário — calculado das movimentações (não depende do campo saldo_atual)
  const saldoInicialContas = contas.filter(c => c.status === 'ativa').reduce((s, c) => s + (c.saldo_inicial || 0), 0);
  const todasReceitasRecebidas = receitas.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
  const todasDespesasPagas = despesas.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
  const saldoBancario = saldoInicialContas + todasReceitasRecebidas - todasDespesasPagas;

  // Dados por mês (últimos 6 meses)
  const mesesMap = useMemo(() => {
    const map = {};
    for (let i = 5; i >= 0; i--) {
      const mes = format(subMonths(new Date(), i), 'yyyy-MM');
      map[mes] = { mes: format(subMonths(new Date(), i), 'MMM/yy', { locale: ptBR }), receitas: 0, despesas: 0 };
    }
    receitas.forEach(r => {
      if (!r.data) return;
      const mes = r.data.substring(0, 7);
      if (map[mes]) map[mes].receitas += r.valor || 0;
    });
    despesas.forEach(d => {
      if (!d.data) return;
      const mes = d.data.substring(0, 7);
      if (map[mes]) map[mes].despesas += d.valor || 0;
    });
    return Object.values(map);
  }, [receitas, despesas]);

  // Receitas por categoria (para o gráfico de pizza)
  const receitasPorCategoria = useMemo(() => {
    const map = {};
    receitasMes.filter(r => r.status === 'recebida').forEach(r => {
      const cat = r.categoria || 'Sem categoria';
      map[cat] = (map[cat] || 0) + (r.valor || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [receitasMes]);

  // Despesas por categoria (para o gráfico de pizza)
  const despesasPorCategoria = useMemo(() => {
    const map = {};
    despesasMes.filter(d => d.status === 'pago').forEach(d => {
      const cat = d.categoria || 'Sem categoria';
      map[cat] = (map[cat] || 0) + (d.valor || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [despesasMes]);

  // Opções de meses para o filtro
  const opcoesMeses = useMemo(() => {
    const meses = [];
    // 6 meses futuros + mês atual + 12 meses passados
    for (let i = -6; i <= 12; i++) {
      const d = subMonths(new Date(), i);
      meses.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM/yyyy', { locale: ptBR }) });
    }
    return meses;
  }, []);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5 mt-4">
      {/* Filtros e Alertas */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{opcoesMeses.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs text-slate-400">Filtrar por mês</span>
      </div>

      {/* Alerta de contas atrasadas */}
      {qtdAtrasadas > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{qtdAtrasadas} conta(s) vencida(s)</strong> — {fmtMoeda(contasAtrasadas)}</span>
        </div>
      )}

      {/* Cards Métricos — 2 linhas de 4 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-white border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">Receita Realizada</p>
              <ArrowUpCircle className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-xl font-bold text-green-600">{fmtMoeda(receitaRealizada)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">Receita Prevista</p>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-xl font-bold text-blue-600">{fmtMoeda(receitaPrevista)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">Total Despesas</p>
              <ArrowDownCircle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-xl font-bold text-red-600">{fmtMoeda(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-indigo-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">Lucro Líquido</p>
              <DollarSign className="w-4 h-4 text-indigo-500" />
            </div>
            <p className={`text-xl font-bold ${lucroLiquido >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{fmtMoeda(lucroLiquido)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">A Receber</p>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl font-bold text-amber-600">{fmtMoeda(aReceber)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">A Pagar</p>
              <Calendar className="w-4 h-4 text-orange-500" />
            </div>
            <p className="text-xl font-bold text-orange-600">{fmtMoeda(aPagar)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-rose-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">Contas Atrasadas</p>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-xl font-bold text-rose-600">{fmtMoeda(contasAtrasadas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">Saldo Bancário</p>
              <Building2 className="w-4 h-4 text-violet-500" />
            </div>
            <p className={`text-xl font-bold ${saldoBancario >= 0 ? 'text-violet-600' : 'text-red-600'}`}>{fmtMoeda(saldoBancario)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Despesas Fixas / Recorrentes */}
      <DespesasFixasCard despesas={despesas} />

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Barras — Receitas x Despesas */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-5 h-5 text-slate-500" /> Receitas x Despesas (6 meses)</CardTitle></CardHeader>
          <CardContent>
            {mesesMap.every(m => m.receitas === 0 && m.despesas === 0) ? (
              <div className="text-center py-10 text-slate-400 text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={mesesMap} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip formatter={(v) => [fmtMoeda(v), '']} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="receitas" name="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pizza — Receita por Categoria */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PieChart className="w-5 h-5 text-slate-500" /> Receita por Categoria</CardTitle></CardHeader>
          <CardContent>
            {receitasPorCategoria.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">Sem receitas recebidas no mês</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPieChart>
                  <Pie data={receitasPorCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {receitasPorCategoria.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v, name) => [fmtMoeda(v), name]} contentStyle={{ fontSize: 12 }} />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pizza — Despesa por Categoria */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PieChart className="w-5 h-5 text-red-500" /> Despesa por Categoria</CardTitle></CardHeader>
          <CardContent>
            {despesasPorCategoria.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">Sem despesas pagas no mês</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPieChart>
                  <Pie data={despesasPorCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {despesasPorCategoria.map((_, i) => <Cell key={i} fill={['#ef4444','#f97316','#eab308','#8b5cf6','#ec4899','#14b8a6','#3b82f6'][i % 7]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v, name) => [fmtMoeda(v), name]} contentStyle={{ fontSize: 12 }} />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Navegador de Mês (reutilizável) ─────────────────────
function NavegadorMes({ mesSelecionado, onChange }) {
  const mesLabel = format(new Date(mesSelecionado + '-15'), 'MMMM yyyy', { locale: ptBR });
  const capitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  const anterior = () => {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const d = new Date(ano, mes - 2, 1);
    onChange(format(d, 'yyyy-MM'));
  };
  const proximo = () => {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const d = new Date(ano, mes, 1);
    onChange(format(d, 'yyyy-MM'));
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 mb-2">
      <button onClick={anterior} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <span className="text-base font-semibold text-slate-800 dark:text-slate-100">{capitalizado}</span>
      <button onClick={proximo} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

// ─── Modal Detalhes do Lançamento ─────────────────────────
function ModalDetalhesLancamento({ open, onClose, item, tipo, user, onSaved, contas }) {
  const [modalPagamento, setModalPagamento] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);

  if (!item) return null;

  const isPago = tipo === 'despesa' ? item.status === 'pago' : item.status === 'recebida';
  const dataRef = item.data_vencimento || item.data;
  const contaNome = contas.find(c => c.id === item.conta_bancaria_id)?.nome_conta || item.conta_bancaria_id || 'Não informada';

  return (
    <>
      <Dialog open={open && !modalEditar && !modalPagamento} onOpenChange={onClose}>
        <DialogContent className="max-w-sm w-full p-0 overflow-hidden rounded-3xl">
          {/* Header colorido */}
          <div className={`px-6 pt-6 pb-4 ${tipo === 'despesa' ? 'bg-red-50' : 'bg-green-50'}`}>
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${tipo === 'despesa' ? 'bg-red-500' : 'bg-green-500'}`}>
                {tipo === 'despesa' ? <ArrowDownCircle className="w-6 h-6 text-white" /> : <ArrowUpCircle className="w-6 h-6 text-white" />}
              </div>
              <div>
                <p className="font-bold text-lg text-slate-800 leading-tight">{item.descricao}</p>
                <StatusBadgeMeuFin status={item.status} tipo={tipo} />
              </div>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center gap-3 py-2 border-b border-slate-100">
              <DollarSign className="w-5 h-5 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Valor</p>
                <p className={`font-bold text-base ${tipo === 'despesa' ? 'text-red-600' : 'text-green-600'}`}>{fmtMoeda(item.valor)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-slate-100">
              <Calendar className="w-5 h-5 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">{tipo === 'despesa' ? 'Vencimento' : 'Data'}</p>
                <p className="font-medium text-slate-700">{dataRef ? format(parseISO(dataRef), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-slate-100">
              <Building2 className="w-5 h-5 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Conta</p>
                <p className="font-medium text-slate-700">{contaNome}</p>
              </div>
            </div>
            {item.categoria && (
              <div className="flex items-center gap-3 py-2 border-b border-slate-100">
                <Hash className="w-5 h-5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Categoria</p>
                  <p className="font-medium text-slate-700">{item.categoria}</p>
                </div>
              </div>
            )}
            {item.observacao && (
              <div className="flex items-center gap-3 py-2">
                <Pencil className="w-5 h-5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Observação</p>
                  <p className="font-medium text-slate-700">{item.observacao}</p>
                </div>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="px-6 pb-6 space-y-2">
            <Button className="w-full rounded-full bg-slate-700 hover:bg-slate-800" onClick={() => setModalEditar(true)}>
              Editar {tipo === 'despesa' ? 'despesa' : 'receita'}
            </Button>
            {!isPago && (
              <Button
                className={`w-full rounded-full ${tipo === 'despesa' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
                onClick={() => setModalPagamento(true)}
              >
                {tipo === 'despesa' ? 'Pagar' : 'Receber'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de edição */}
      {modalEditar && (
        <FormModalFinanceiro
          open={modalEditar}
          onClose={() => setModalEditar(false)}
          item={item}
          tipo={tipo}
          user={user}
          onSaved={() => { onSaved(); setModalEditar(false); onClose(); }}
        />
      )}

      {/* Modal de pagamento/recebimento */}
      {modalPagamento && (
        <ModalConfirmarPagamento
          open={modalPagamento}
          onClose={() => setModalPagamento(false)}
          item={item}
          tipo={tipo}
          contas={contas}
          onConfirmar={() => { onSaved(); setModalPagamento(false); onClose(); }}
        />
      )}
    </>
  );
}

// ─── Modal Confirmar Pagamento/Recebimento ─────────────────
function ModalConfirmarPagamento({ open, onClose, item, tipo, contas, onConfirmar }) {
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [contaSelecionada, setContaSelecionada] = useState(item?.conta_bancaria_id || '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setDataPagamento(format(new Date(), 'yyyy-MM-dd'));
    setContaSelecionada(item?.conta_bancaria_id || '');
  }, [item, open]);

  const confirmar = async () => {
    setSalvando(true);
    try {
      if (tipo === 'despesa') {
        await base44.entities.MeuFinanceiroDespesa.update(item.id, {
          status: 'pago',
          data_pagamento: dataPagamento,
          conta_bancaria_id: contaSelecionada || item.conta_bancaria_id,
        });
        toast.success('Despesa marcada como paga!');
      } else {
        await base44.entities.MeuFinanceiroReceita.update(item.id, {
          status: 'recebida',
          data_recebimento: dataPagamento,
          conta_bancaria_id: contaSelecionada || item.conta_bancaria_id,
        });
        toast.success('Receita marcada como recebida!');
      }
      onConfirmar();
    } catch (e) {
      toast.error('Erro ao confirmar pagamento');
    } finally {
      setSalvando(false);
    }
  };

  const contaAtual = contas.find(c => c.id === (contaSelecionada || item?.conta_bancaria_id));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm w-full p-0 overflow-hidden rounded-3xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${tipo === 'despesa' ? 'bg-red-500' : 'bg-green-500'}`}>
              {tipo === 'despesa' ? <ArrowDownCircle className="w-6 h-6 text-white" /> : <ArrowUpCircle className="w-6 h-6 text-white" />}
            </div>
            <div>
              <p className="font-bold text-slate-800">{item?.descricao}</p>
              <p className={`text-sm font-semibold ${tipo === 'despesa' ? 'text-red-500' : 'text-green-600'}`}>{fmtMoeda(item?.valor)}</p>
            </div>
          </div>
        </div>

        {/* Corpo */}
        <div className="px-6 py-4 space-y-4">
          {/* Data */}
          <div className="flex items-center gap-3 py-2 border-b border-slate-100">
            <Calendar className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-1">Data do {tipo === 'despesa' ? 'pagamento' : 'recebimento'}</p>
              <Input
                type="date"
                value={dataPagamento}
                onChange={e => setDataPagamento(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Conta */}
          <div className="flex items-center gap-3 py-2">
            <Building2 className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-1">Conta utilizada</p>
              {contas.length > 0 ? (
                <Select value={contaSelecionada} onValueChange={setContaSelecionada}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecionar conta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_conta} — {c.banco}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-slate-500 italic">Nenhuma conta cadastrada</p>
              )}
              {contaAtual && (
                <p className="text-xs text-slate-400 mt-1">{contaAtual.banco}</p>
              )}
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="px-6 pb-6 flex gap-3">
          <Button variant="outline" className="flex-1 rounded-full" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            className={`flex-1 rounded-full ${tipo === 'despesa' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
            onClick={confirmar}
            disabled={salvando}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : (tipo === 'despesa' ? 'Pagar' : 'Receber')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lista de Receitas ─────────────────────────────────────
function ReceitasTab({ user, refreshKey, onSaved }) {
  const [itens, setItens] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalForm, setModalForm] = useState({ open: false, item: null });
  const [detalhes, setDetalhes] = useState(null);
  const [mesSelecionado, setMesSelecionado] = useState(format(new Date(), 'yyyy-MM'));

  const filtroBase = { usuario_id: user.id, empresa_id: user.empresa_id };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        base44.entities.MeuFinanceiroReceita.filter(filtroBase, '-data', 2000),
        base44.entities.MeuFinanceiroContaBancaria.filter(filtroBase, 'nome_conta', 50),
      ]);
      setItens(r); setContas(c);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const itensMes = itens.filter(r => r.data?.startsWith(mesSelecionado));
  const total = itensMes.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
  const pendente = itensMes.filter(r => r.status === 'pendente' || r.status === 'previsto').reduce((s, r) => s + (r.valor || 0), 0);

  return (
    <div className="space-y-3 mt-4 pb-24">
      <NavegadorMes mesSelecionado={mesSelecionado} onChange={setMesSelecionado} />

      <div className="flex gap-4 text-sm">
        <span className="text-green-700 dark:text-green-400 font-semibold">Recebido: {fmtMoeda(total)}</span>
        <span className="text-amber-600 dark:text-amber-400 font-semibold">Pendente: {fmtMoeda(pendente)}</span>
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : itensMes.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Nenhuma receita em {format(new Date(mesSelecionado + '-15'), 'MMMM', { locale: ptBR })}.</div>
      ) : (
        <div className="space-y-2">
          {itensMes.map(item => (
            <div key={item.id} onClick={() => setDetalhes(item)} className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3 border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer active:scale-[0.98] transition-transform">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <ArrowUpCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{item.descricao}</p>
                <p className="text-xs text-slate-400 truncate">{item.categoria || 'Sem categoria'} · {item.data ? format(parseISO(item.data), 'dd/MM/yy') : '-'}</p>
                <StatusBadgeMeuFin status={item.status} tipo="receita" />
              </div>
              <p className="text-sm font-bold text-green-600 flex-shrink-0">+{fmtMoeda(item.valor)}</p>
            </div>
          ))}
        </div>
      )}

      {/* FAB verde */}
      <button
        onClick={e => { e.stopPropagation(); setModalForm({ open: true, item: null }); }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-xl flex items-center justify-center z-30 transition-transform active:scale-95"
      >
        <Plus className="w-7 h-7" />
      </button>

      {modalForm.open && <FormModalFinanceiro open={modalForm.open} onClose={() => setModalForm({ open: false, item: null })} item={modalForm.item} tipo="receita" user={user} onSaved={() => { carregar(); onSaved?.(); setModalForm({ open: false, item: null }); }} />}

      {detalhes && (
        <ModalDetalhesLancamento
          open={!!detalhes}
          onClose={() => setDetalhes(null)}
          item={detalhes}
          tipo="receita"
          user={user}
          contas={contas}
          onSaved={() => { carregar(); onSaved?.(); setDetalhes(null); }}
        />
      )}
    </div>
  );
}

// ─── Lista de Despesas ─────────────────────────────────────
function DespesasTab({ user, refreshKey, onSaved }) {
  const [itens, setItens] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalForm, setModalForm] = useState({ open: false, item: null });
  const [detalhes, setDetalhes] = useState(null);
  const [mesSelecionado, setMesSelecionado] = useState(format(new Date(), 'yyyy-MM'));

  const filtroBase = { usuario_id: user.id, empresa_id: user.empresa_id };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        base44.entities.MeuFinanceiroDespesa.filter(filtroBase, '-data_vencimento', 2000),
        base44.entities.MeuFinanceiroContaBancaria.filter(filtroBase, 'nome_conta', 50),
      ]);
      setItens(d); setContas(c);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const hojeStr = format(new Date(), 'yyyy-MM-dd');

  const itensMes = itens.filter(d => {
    if (d.status === 'cancelado') return false;
    const dataRef = d.data_vencimento || d.data;
    return dataRef?.startsWith(mesSelecionado);
  });

  const totalPago = itensMes.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
  const totalPendente = itensMes.filter(d => d.status !== 'pago' && d.status !== 'cancelado').reduce((s, d) => s + (d.valor || 0), 0);

  return (
    <div className="space-y-3 mt-4 pb-24">
      <NavegadorMes mesSelecionado={mesSelecionado} onChange={setMesSelecionado} />

      <div className="flex gap-4 text-sm">
        <span className="text-red-600 dark:text-red-400 font-semibold">Pago: {fmtMoeda(totalPago)}</span>
        <span className="text-amber-600 dark:text-amber-400 font-semibold">Pendente: {fmtMoeda(totalPendente)}</span>
        <span className="text-slate-400 text-xs self-center">{itensMes.length} item(s)</span>
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : itensMes.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Nenhuma despesa em {format(new Date(mesSelecionado + '-15'), 'MMMM', { locale: ptBR })}.</div>
      ) : (
        <div className="space-y-2">
          {itensMes.map(item => {
            const dataVencRef = item.data_vencimento || item.data;
            const atrasada = (item.status === 'pendente' || item.status === 'previsto' || item.status === 'atrasado') && dataVencRef && dataVencRef < hojeStr;
            const statusVisual = atrasada && (item.status === 'previsto' || item.status === 'pendente') ? 'atrasado' : item.status;
            return (
              <div key={item.id} onClick={() => setDetalhes(item)} className={`bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3 border shadow-sm cursor-pointer active:scale-[0.98] transition-transform ${atrasada ? 'border-red-200 dark:border-red-800' : 'border-slate-100 dark:border-slate-700'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${atrasada ? 'bg-red-600' : 'bg-orange-500'}`}>
                  <ArrowDownCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                    {item.descricao}
                    {atrasada && <span className="ml-1 text-xs text-red-500">⚠</span>}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {item.categoria || 'Sem categoria'} · {item.data_vencimento ? format(parseISO(item.data_vencimento), 'dd/MM/yy') : item.data ? format(parseISO(item.data), 'dd/MM/yy') : '-'}
                  </p>
                  <StatusBadgeMeuFin status={statusVisual} tipo="despesa" />
                </div>
                <p className="text-sm font-bold text-red-600 flex-shrink-0">-{fmtMoeda(item.valor)}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB vermelho */}
      <button
        onClick={e => { e.stopPropagation(); setModalForm({ open: true, item: null }); }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xl flex items-center justify-center z-30 transition-transform active:scale-95"
      >
        <Plus className="w-7 h-7" />
      </button>

      {modalForm.open && <FormModalFinanceiro open={modalForm.open} onClose={() => setModalForm({ open: false, item: null })} item={modalForm.item} tipo="despesa" user={user} onSaved={() => { carregar(); setModalForm({ open: false, item: null }); }} />}

      {detalhes && (
        <ModalDetalhesLancamento
          open={!!detalhes}
          onClose={() => setDetalhes(null)}
          item={detalhes}
          tipo="despesa"
          user={user}
          contas={contas}
          onSaved={() => { carregar(); onSaved?.(); setDetalhes(null); }}
        />
      )}
    </div>
  );
}

// ─── Despesas Fixas Card ──────────────────────────────────
function DespesasFixasCard({ despesas }) {
  const hojeStr = hoje();
  const anoAtual = new Date().getFullYear();
  const fimAno = `${anoAtual}-12-31`;

  const recorrentes = despesas.filter(d =>
    d.tipo_lancamento === 'recorrente' && !d.recorrencia_origem_id
  );

  const fixas = despesas
    .filter(d => d.recorrencia_origem_id && d.status !== 'cancelado')
    .reduce((acc, d) => {
      const chave = d.recorrencia_origem_id;
      if (!acc[chave]) acc[chave] = { descricao: d.descricao, valor: d.valor, categorias: new Set(), quantidade: 0, total: 0 };
      acc[chave].quantidade++;
      acc[chave].total += d.valor || 0;
      acc[chave].categorias.add(d.categoria);
      return acc;
    }, {});

  // Também incluir originais recorrentes que podem não ter gerado previstos ainda
  recorrentes.forEach(r => {
    const previstas = despesas.filter(d => d.recorrencia_origem_id === r.id);
    if (!fixas[r.id]) {
      fixas[r.id] = { descricao: r.descricao, valor: r.valor, categorias: new Set([r.categoria]), quantidade: previstas.length, total: r.valor * Math.max(1, previstas.length || 1) };
    }
  });

  const entries = Object.values(fixas);

  if (entries.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-500" /> Minhas Despesas Fixas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {entries.map((f, i) => (
            <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-700">{f.descricao}</p>
                <p className="text-xs text-slate-400">{f.quantidade} mes{f.quantidade > 1 ? 'es' : ''} restante{f.quantidade > 1 ? 's' : ''} · Total previsto: {fmtMoeda(f.total)}</p>
              </div>
              <span className="text-sm font-bold text-amber-600">{fmtMoeda(f.valor)}/mês</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Projeção Financeira ───────────────────────────────────
function ProjecaoTab({ user, refreshKey }) {
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAlertaRenovacao, setShowAlertaRenovacao] = useState(false);
  const [recorrentesEncerrando, setRecorrentesEncerrando] = useState([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const filtro = { usuario_id: user.id, empresa_id: user.empresa_id };
      const [r, d] = await Promise.all([
        base44.entities.MeuFinanceiroReceita.filter(filtro, '-data', 2000),
        base44.entities.MeuFinanceiroDespesa.filter(filtro, '-data', 2000),
      ]);
      setReceitas(r); setDespesas(d);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  // Detectar dezembro — alerta de renovação
  useEffect(() => {
    const mesAtual = new Date().getMonth() + 1; // 1-12
    if (mesAtual === 12) {
      const encerrando = despesas.filter(d =>
        d.tipo_lancamento === 'recorrente' &&
        !d.recorrencia_origem_id &&
        d.repetir_ate_tipo === 'fim_ano'
      );
      if (encerrando.length > 0) {
        setRecorrentesEncerrando(encerrando);
        setShowAlertaRenovacao(true);
      }
    }
  }, [despesas]);

  const hojeStr = hoje();
  const anoAtual = new Date().getFullYear();
  const fimAno = `${anoAtual}-12-31`;

  // Próximo mês
  const agora = new Date();
  const proxMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const proxMesStr = format(proxMes, 'yyyy-MM');
  const fimProxMes = format(new Date(agora.getFullYear(), agora.getMonth() + 2, 0), 'yyyy-MM-dd');

  const despesasProxMes = despesas.filter(d =>
    d.status !== 'cancelado' && d.data >= format(proxMes, 'yyyy-MM-01') && d.data <= fimProxMes
  ).reduce((s, d) => s + (d.valor || 0), 0);

  const receitasProxMes = receitas.filter(r =>
    r.status !== 'cancelada' && r.data >= format(proxMes, 'yyyy-MM-01') && r.data <= fimProxMes
  ).reduce((s, r) => s + (r.valor || 0), 0);

  const saldoPrevisto = receitasProxMes - despesasProxMes;

  // Total comprometido até dezembro (despesas previstas + pendentes do ano)
  const totalComprometido = despesas.filter(d =>
    d.status !== 'cancelado' && d.data <= fimAno && d.data >= hojeStr
  ).reduce((s, d) => s + (d.valor || 0), 0);

  // Despesas fixas restantes do ano
  const fixasRestantes = despesas.filter(d =>
    (d.tipo_lancamento === 'recorrente' || d.recorrencia_origem_id) &&
    d.status !== 'cancelado' && d.data >= hojeStr && d.data <= fimAno
  ).reduce((s, d) => s + (d.valor || 0), 0);

  const renovarRecorrentes = async (alterarValores) => {
    try {
      for (const r of recorrentesEncerrando) {
        const novoAno = anoAtual + 1;
        const novaDataLimite = `${novoAno}-12-31`;
        await base44.entities.MeuFinanceiroDespesa.update(r.id, {
          repetir_ate_tipo: 'fim_ano',
          repetir_ate_data: null,
          repetir_ate_meses: null,
        });
        // Gerar novos lançamentos para o próximo ano
        await base44.functions.invoke('gerarLancamentosRecorrentes', {
          tipo: 'despesa',
          dados: {
            ...r,
            origem_id: r.id,
            frequencia: r.frequencia || 'mensal',
            dia_vencimento: r.dia_vencimento || parseInt(r.data?.split('-')[2] || '1'),
            repetir_ate_tipo: 'data',
            repetir_ate_data: novaDataLimite,
          },
          user_id: user.id,
          empresa_id: user.empresa_id,
        });
      }
      toast.success('Recorrentes renovadas para o próximo ano!');
      setShowAlertaRenovacao(false);
      carregar();
    } catch (e) {
      toast.error('Erro ao renovar');
      console.error(e);
    }
  };

  const encerrarRecorrencia = async (id) => {
    try {
      await base44.entities.MeuFinanceiroDespesa.update(id, { tipo_lancamento: 'unico' });
      toast.success('Recorrência encerrada');
      carregar();
    } catch (e) { toast.error('Erro ao encerrar'); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5 mt-4">
      {/* Alerta de renovação (dezembro) */}
      {showAlertaRenovacao && recorrentesEncerrando.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Existem despesas recorrentes encerrando em 31/12. Deseja renovar para o próximo ano?</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => renovarRecorrentes(false)}>
                  Renovar mantendo valores
                </Button>
                <Button size="sm" variant="outline" onClick={() => renovarRecorrentes(true)}>
                  Renovar alterando valores
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setShowAlertaRenovacao(false)}>
                  Encerrar recorrência
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cards de projeção */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-white border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Despesas Previstas (Próx. Mês)</p>
            <p className="text-xl font-bold text-orange-600">{fmtMoeda(despesasProxMes)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Receitas Previstas (Próx. Mês)</p>
            <p className="text-xl font-bold text-green-600">{fmtMoeda(receitasProxMes)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Saldo Previsto</p>
            <p className={`text-xl font-bold ${saldoPrevisto >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{fmtMoeda(saldoPrevisto)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Total Comprometido até Dez</p>
            <p className="text-xl font-bold text-violet-600">{fmtMoeda(totalComprometido)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo despesas fixas restantes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" /> Despesas Fixas Restantes do Ano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-slate-800">{fmtMoeda(fixasRestantes)}</p>
          <p className="text-xs text-slate-400 mt-1">Soma de todas as despesas recorrentes previstas até 31/12/{anoAtual}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Status Badge para Meu Financeiro ─────────────────────
function StatusBadgeMeuFin({ status, tipo }) {
  const mapa = {
    receita: {
      previsto: { label: 'Previsto', classes: 'bg-blue-100 text-blue-700' },
      pendente: { label: 'Pendente', classes: 'bg-amber-100 text-amber-700' },
      recebida: { label: 'Recebida', classes: 'bg-green-100 text-green-700' },
      cancelada: { label: 'Cancelada', classes: 'bg-slate-100 text-slate-500' },
    },
    despesa: {
      previsto: { label: 'Previsto', classes: 'bg-blue-100 text-blue-700' },
      pendente: { label: 'Pendente', classes: 'bg-amber-100 text-amber-700' },
      pago: { label: 'Pago', classes: 'bg-green-100 text-green-700' },
      atrasado: { label: 'Atrasado', classes: 'bg-red-100 text-red-700' },
      cancelado: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-500' },
    },
  };
  const cfg = (mapa[tipo] || {})[status] || { label: status, classes: 'bg-slate-100 text-slate-500' };
  return <Badge className={cfg.classes}>{cfg.label}</Badge>;
}

// ─── Contas Bancárias ─────────────────────────────────────
const BANCOS_CONFIG = {
  'Itaú': { bg: 'bg-orange-500', text: 'text-white', abbr: 'IT' },
  'Nubank': { bg: 'bg-purple-600', text: 'text-white', abbr: 'NU' },
  'Bradesco': { bg: 'bg-red-600', text: 'text-white', abbr: 'BD' },
  'Santander': { bg: 'bg-red-700', text: 'text-white', abbr: 'SN' },
  'Banco do Brasil': { bg: 'bg-yellow-500', text: 'text-white', abbr: 'BB' },
  'Caixa Econômica Federal': { bg: 'bg-blue-600', text: 'text-white', abbr: 'CE' },
  'Inter': { bg: 'bg-orange-600', text: 'text-white', abbr: 'IN' },
  'C6 Bank': { bg: 'bg-slate-800', text: 'text-white', abbr: 'C6' },
  'Sicoob': { bg: 'bg-green-700', text: 'text-white', abbr: 'SC' },
  'BTG Pactual': { bg: 'bg-blue-800', text: 'text-white', abbr: 'BT' },
  'PicPay': { bg: 'bg-green-500', text: 'text-white', abbr: 'PP' },
  'Mercado Pago': { bg: 'bg-blue-500', text: 'text-white', abbr: 'MP' },
  'Carteira/Dinheiro': { bg: 'bg-green-600', text: 'text-white', abbr: '💵' },
  'Outro': { bg: 'bg-slate-500', text: 'text-white', abbr: 'OT' },
};
const BANCOS_COMUNS = Object.keys(BANCOS_CONFIG);

function BancoAvatar({ banco, logoUrl = '', size = 'md' }) {
  const cfg = BANCOS_CONFIG[banco] || { bg: 'bg-slate-400', text: 'text-white', abbr: (banco || '?').substring(0, 2).toUpperCase() };
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
  if (logoUrl) {
    return <div className={`${sz} rounded-xl border border-slate-200 bg-white flex-shrink-0 overflow-hidden`}><img src={logoUrl} alt={banco} className="w-full h-full object-cover" /></div>;
  }
  return <div className={`${cfg.bg} ${cfg.text} ${sz} rounded-xl flex items-center justify-center font-bold flex-shrink-0`}>{cfg.abbr}</div>;
}

function ContasTab({ user, refreshKey }) {
  const [contas, setContas] = useState([]);
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [contaAcoes, setContaAcoes] = useState(null); // id da conta com menu aberto

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const filtro = { usuario_id: user.id, empresa_id: user.empresa_id };
      const [c, r, d] = await Promise.all([
        base44.entities.MeuFinanceiroContaBancaria.filter(filtro, 'nome_conta', 50),
        base44.entities.MeuFinanceiroReceita.filter(filtro, '-data', 2000),
        base44.entities.MeuFinanceiroDespesa.filter(filtro, '-data', 2000),
      ]);
      setContas(c); setReceitas(r); setDespesas(d);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const saldoPorConta = useMemo(() => {
    const map = {};
    contas.forEach(c => { map[c.id] = c.saldo_inicial || 0; });
    receitas.filter(r => r.status === 'recebida' && r.conta_bancaria_id).forEach(r => {
      if (map[r.conta_bancaria_id] !== undefined) map[r.conta_bancaria_id] += (r.valor || 0);
    });
    despesas.filter(d => d.status === 'pago' && d.conta_bancaria_id).forEach(d => {
      if (map[d.conta_bancaria_id] !== undefined) map[d.conta_bancaria_id] -= (d.valor || 0);
    });
    const semConta = receitas.filter(r => r.status === 'recebida' && !r.conta_bancaria_id).reduce((s, r) => s + (r.valor || 0), 0)
      - despesas.filter(d => d.status === 'pago' && !d.conta_bancaria_id).reduce((s, d) => s + (d.valor || 0), 0);
    return { map, semConta };
  }, [contas, receitas, despesas]);

  const contasAtivas = contas.filter(c => c.status === 'ativa');
  const saldoTotal = contasAtivas.reduce((s, c) => s + (saldoPorConta.map[c.id] || 0), 0) + saldoPorConta.semConta;

  const excluir = async (id) => {
    if (!confirm('Excluir esta conta bancária?')) return;
    try { await base44.entities.MeuFinanceiroContaBancaria.delete(id); toast.success('Conta excluída'); carregar(); } catch (e) { toast.error('Erro ao excluir'); }
  };

  return (
    <div className="mt-4 pb-24">
      {/* Header: saldo total + botão nova conta */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Saldo Total</p>
          <p className={`text-2xl font-bold ${saldoTotal >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmtMoeda(saldoTotal)}</p>
          <p className="text-xs text-slate-400">{contasAtivas.length} conta{contasAtivas.length !== 1 ? 's' : ''} ativa{contasAtivas.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditando(null); setModalOpen(true); }}
          className="w-11 h-11 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-md transition-transform active:scale-95"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : contas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Nenhuma conta bancária cadastrada.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditando(null); setModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Cadastrar primeira conta
          </Button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
          {contas.map((conta) => {
            const saldo = saldoPorConta.map[conta.id] || 0;
            const inativa = conta.status === 'inativa';
            return (
              <div
                key={conta.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${inativa ? 'opacity-50' : ''}`}
              >
                <BancoAvatar banco={conta.banco} logoUrl={conta.logo_url} size="md" />
                <div className="flex-1 min-w-0" onClick={() => setContaAcoes(contaAcoes === conta.id ? null : conta.id)}>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{conta.nome_conta}</p>
                  <p className={`text-sm font-bold ${saldo >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmtMoeda(saldo)}</p>
                </div>
                <button
                  onClick={() => { setEditando(conta); setModalOpen(true); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => excluir(conta.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ContaBancariaModal open={modalOpen} onClose={() => setModalOpen(false)} conta={editando} user={user} onSaved={carregar} />
    </div>
  );
}

function ContaBancariaModal({ open, onClose, conta, user, onSaved }) {
  const [form, setForm] = useState({ nome_conta: '', banco: '', tipo_conta: 'Conta Corrente', agencia: '', conta: '', chave_pix: '', saldo_inicial: '0', status: 'ativa', observacoes: '', logo_url: '' });
  const [salvando, setSalvando] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const editando = !!conta;

  useEffect(() => {
    if (conta) {
      setForm({
        nome_conta: conta.nome_conta || '', banco: conta.banco || '', tipo_conta: conta.tipo_conta || 'Conta Corrente',
        agencia: conta.agencia || '', conta: conta.conta || '', chave_pix: conta.chave_pix || '',
        saldo_inicial: String(conta.saldo_inicial ?? 0), status: conta.status || 'ativa',
        observacoes: conta.observacoes || '', logo_url: conta.logo_url || '',
      });
    } else {
      setForm({ nome_conta: '', banco: '', tipo_conta: 'Conta Corrente', agencia: '', conta: '', chave_pix: '', saldo_inicial: '0', status: 'ativa', observacoes: '', logo_url: '' });
    }
  }, [conta, open]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, logo_url: file_url }));
    setUploadingLogo(false);
    e.target.value = '';
  };

  const salvar = async () => {
    if (!form.nome_conta || !form.banco) return toast.error('Preencha nome e banco');
    setSalvando(true);
    const saldoInicial = parseFloat(form.saldo_inicial) || 0;
    const payload = {
      empresa_id: user.empresa_id, usuario_id: user.id, usuario_nome: user.nome_perfil || user.full_name,
      nome_conta: form.nome_conta, banco: form.banco, tipo_conta: form.tipo_conta,
      agencia: form.agencia, conta: form.conta, chave_pix: form.chave_pix,
      saldo_inicial: saldoInicial,
      saldo_atual: editando ? conta.saldo_atual : saldoInicial,
      status: form.status, observacoes: form.observacoes, logo_url: form.logo_url || '',
    };
    if (editando) await base44.entities.MeuFinanceiroContaBancaria.update(conta.id, payload);
    else await base44.entities.MeuFinanceiroContaBancaria.create(payload);
    toast.success(editando ? 'Conta atualizada!' : 'Conta criada!');
    setSalvando(false); onClose(); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editando ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Logo do Banco (opcional)</label>
            <div className="mt-1 flex items-center gap-3">
              {form.logo_url ? <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white flex-shrink-0 overflow-hidden"><img src={form.logo_url} alt="logo" className="w-full h-full object-cover" /></div>
                : <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0"><Building2 className="w-7 h-7" /></div>}
              <div>
                <label className="cursor-pointer"><span className="inline-block text-xs px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600">{uploadingLogo ? 'Enviando...' : 'Escolher imagem'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                </label>
                {form.logo_url && <button className="ml-2 text-xs text-red-500 hover:underline" onClick={() => setForm(f => ({ ...f, logo_url: '' }))}>Remover</button>}
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Nome da Conta *</label>
            <Input className="mt-1" placeholder="Ex: Minha Conta Principal" value={form.nome_conta} onChange={e => setForm(f => ({ ...f, nome_conta: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Banco *</label>
              <Select value={form.banco} onValueChange={v => setForm(f => ({ ...f, banco: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{BANCOS_COMUNS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Tipo de Conta</label>
              <Select value={form.tipo_conta} onValueChange={v => setForm(f => ({ ...f, tipo_conta: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{['Conta Corrente', 'Conta Poupança', 'Conta Salário', 'Conta de Pagamento', 'Carteira/Dinheiro'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-slate-700">Agência</label><Input className="mt-1" placeholder="0000" value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Conta</label><Input className="mt-1" placeholder="00000-0" value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} /></div>
          </div>
          <div><label className="text-sm font-medium text-slate-700">Chave PIX</label><Input className="mt-1" placeholder="CPF, e-mail, telefone ou chave aleatória" value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} /></div>
          {!editando && (
            <div><label className="text-sm font-medium text-slate-700">Saldo Inicial (R$)</label><Input className="mt-1" type="number" step="0.01" placeholder="0,00" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} /><p className="text-xs text-slate-400 mt-1">Saldo atual da conta no momento do cadastro</p></div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ativa">Ativa</SelectItem><SelectItem value="inativa">Inativa</SelectItem></SelectContent>
            </Select>
          </div>
          <div><label className="text-sm font-medium text-slate-700">Observações</label><Input className="mt-1" placeholder="Opcional" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">{salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar Conta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
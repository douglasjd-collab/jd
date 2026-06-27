import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const PIE_COLORS = ['#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#22c55e', '#64748b'];

export default function DRETab({ user, refreshKey }) {
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mesFiltro, setMesFiltro] = useState(format(new Date(), 'yyyy-MM'));

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

  const filtrarPorMes = (arr) => arr.filter(item => item.data?.startsWith(mesFiltro));

  const receitasMes = useMemo(() => filtrarPorMes(receitas), [receitas, mesFiltro]);
  const despesasMes = useMemo(() => filtrarPorMes(despesas), [despesas, mesFiltro]);

  // Cálculos DRE
  const receitaBruta = receitasMes.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
  const comissoesPagas = despesasMes.filter(d => d.status === 'pago' && (d.categoria || '').toLowerCase().includes('comissão')).reduce((s, d) => s + (d.valor || 0), 0);
  const impostos = despesasMes.filter(d => d.status === 'pago' && (d.categoria || '').toLowerCase().includes('imposto')).reduce((s, d) => s + (d.valor || 0), 0);
  const despesasOperacionais = despesasMes.filter(d => d.status === 'pago' && !(d.categoria || '').toLowerCase().includes('comissão') && !(d.categoria || '').toLowerCase().includes('imposto')).reduce((s, d) => s + (d.valor || 0), 0);
  const lucroOperacional = receitaBruta - comissoesPagas - impostos - despesasOperacionais;
  const lucroLiquido = lucroOperacional; // Simplificado - sem outras deduções

  const totalDespesas = comissoesPagas + impostos + despesasOperacionais;

  // Despesas por categoria
  const despesasPorCategoria = useMemo(() => {
    const map = {};
    despesasMes.filter(d => d.status === 'pago').forEach(d => {
      const cat = d.categoria || 'Geral';
      map[cat] = (map[cat] || 0) + (d.valor || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [despesasMes]);

  // Opções de meses
  const opcoesMeses = useMemo(() => {
    const meses = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      meses.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM/yyyy', { locale: ptBR }) });
    }
    return meses;
  }, []);

  const mesAtualLabel = opcoesMeses.find(m => m.value === mesFiltro)?.label || mesFiltro;

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const pct = (v, t) => t > 0 ? ((v / t) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-4 mt-4">
      {/* Filtros */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-600">DRE</span>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{opcoesMeses.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Resumo rápido — 2 colunas no mobile */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-white border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">Receita Bruta</p>
            <p className="text-sm font-bold text-green-600">{fmtMoeda(receitaBruta)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">Total Despesas</p>
            <p className="text-sm font-bold text-red-600">{fmtMoeda(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">Lucro Operacional</p>
            <p className={`text-sm font-bold ${lucroOperacional >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{fmtMoeda(lucroOperacional)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-l-4 border-l-indigo-500">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">Margem</p>
            <p className="text-sm font-bold text-indigo-600">{receitaBruta > 0 ? pct(lucroLiquido, receitaBruta) : '0.0'}%</p>
          </CardContent>
        </Card>
      </div>

      {/* DRE — cards empilhados (mobile-first) */}
      <Card>
        <CardHeader className="pb-2 bg-slate-800 rounded-t-lg">
          <CardTitle className="text-sm text-white">DRE — {mesAtualLabel}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Receita Bruta */}
          <div className="flex items-center justify-between px-4 py-3 bg-green-50 border-b">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span className="font-semibold text-green-800 text-sm">RECEITA BRUTA</span>
            </div>
            <div className="text-right">
              <p className="font-bold text-green-700 text-sm">{fmtMoeda(receitaBruta)}</p>
              <p className="text-xs text-green-600">100%</p>
            </div>
          </div>

          {/* Deduções */}
          {[
            { label: 'Comissões Pagas', valor: comissoesPagas, p: pct(comissoesPagas, receitaBruta) },
            { label: 'Impostos', valor: impostos, p: pct(impostos, receitaBruta) },
            { label: 'Despesas Operacionais', valor: despesasOperacionais, p: pct(despesasOperacionais, receitaBruta) },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b hover:bg-slate-50">
              <span className="text-sm text-slate-600">(-) {item.label}</span>
              <div className="text-right">
                <p className="text-sm text-red-600 font-medium">{fmtMoeda(item.valor)}</p>
                <p className="text-xs text-slate-400">{item.p}%</p>
              </div>
            </div>
          ))}

          {/* Lucro Operacional */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="font-semibold text-slate-800 text-sm">LUCRO OPERACIONAL</span>
            </div>
            <div className="text-right">
              <p className={`font-bold text-sm ${lucroOperacional >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmtMoeda(lucroOperacional)}</p>
              <p className="text-xs text-slate-400">{pct(lucroOperacional, receitaBruta)}%</p>
            </div>
          </div>

          {/* Lucro Líquido */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-blue-600 rounded-b-lg">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-white" />
              <span className="font-bold text-white text-sm">LUCRO LÍQUIDO</span>
            </div>
            <div className="text-right">
              <p className="font-bold text-white text-base">{fmtMoeda(lucroLiquido)}</p>
              <p className="text-xs text-blue-200">{pct(lucroLiquido, receitaBruta)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Despesas por Categoria */}
      <Card>
        <CardHeader className="pb-2 bg-slate-800 rounded-t-lg">
          <CardTitle className="text-sm text-white">Despesas por Categoria</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {despesasPorCategoria.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <TrendingDown className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Sem despesas no período</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={despesasPorCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                    {despesasPorCategoria.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v) => [fmtMoeda(v), '']} contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {despesasPorCategoria.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-600 truncate">{item.name}</span>
                    </div>
                    <span className="text-slate-700 font-medium ml-2 flex-shrink-0">{fmtMoeda(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
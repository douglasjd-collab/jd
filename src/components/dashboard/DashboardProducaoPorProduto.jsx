import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BarChart2 } from 'lucide-react';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const PRODUTOS = ['Consórcio', 'Financiamento', 'Empréstimo Consignado', 'Proteção Veicular', 'Seguros', 'Microcrédito'];

export default function DashboardProducaoPorProduto({ vendas, propostas, periodo }) {
  const dados = React.useMemo(() => {
    const stats = {};
    PRODUTOS.forEach(p => { stats[p] = { nome: p, qtd: 0, valor: 0 }; });

    vendas.filter(v => v.status !== 'cancelada' && (v.data_venda || '') >= periodo.inicio && (v.data_venda || '') <= periodo.fim)
      .forEach(v => {
        const prod = v.produto === 'consorcio' ? 'Consórcio' : v.produto || 'Consórcio';
        if (!stats[prod]) stats[prod] = { nome: prod, qtd: 0, valor: 0 };
        stats[prod].qtd++;
        stats[prod].valor += v.valorCredito || 0;
      });

    propostas.filter(p => {
      const d = p.emprestimo_data_liberacao || p.data_venda || '';
      return !['cancelado'].includes(p.status) && d >= periodo.inicio && d <= periodo.fim;
    }).forEach(p => {
      const prod = p.produto === 'emprestimo' ? 'Empréstimo Consignado' : p.produto === 'financiamento' ? 'Financiamento' : 'Empréstimo Consignado';
      if (!stats[prod]) stats[prod] = { nome: prod, qtd: 0, valor: 0 };
      stats[prod].qtd++;
      stats[prod].valor += p.valor_credito || 0;
    });

    const total = Object.values(stats).reduce((a, s) => a + s.valor, 0) || 1;
    return Object.values(stats).map(s => ({ ...s, pct: ((s.valor / total) * 100).toFixed(1) })).filter(s => s.qtd > 0);
  }, [vendas, propostas, periodo]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-blue-500" />
          Produção por Produto
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dados.length === 0 ? (
          <p className="text-center text-slate-400 py-8">Nenhuma produção no período</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dados} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" fontSize={10} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nome" fontSize={10} width={100} />
                <Tooltip formatter={(v) => BRL(v)} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {dados.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {dados.map((d, i) => (
                <div key={d.nome} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-slate-700 font-medium truncate">{d.nome}</span>
                      <span className="text-slate-500 ml-1">{d.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{d.qtd} neg. • {BRL(d.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
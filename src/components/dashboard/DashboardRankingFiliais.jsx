import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const medalhas = ['🥇', '🥈', '🥉'];

export default function DashboardRankingFiliais({ vendas, propostas, receitas, despesas, periodo }) {
  const ranking = React.useMemo(() => {
    const stats = {};

    vendas.filter(v => v.status !== 'cancelada' && (v.data_venda || '') >= periodo.inicio && (v.data_venda || '') <= periodo.fim)
      .forEach(v => {
        const nome = v.filial_nome || 'Sem filial';
        if (!stats[nome]) stats[nome] = { nome, producao: 0, receita: 0, despesas: 0 };
        stats[nome].producao += v.valorCredito || 0;
      });

    propostas.filter(p => {
      const d = p.emprestimo_data_liberacao || p.data_venda || '';
      return !['cancelado'].includes(p.status) && d >= periodo.inicio && d <= periodo.fim;
    }).forEach(p => {
      const nome = p.filial_nome || 'Sem filial';
      if (!stats[nome]) stats[nome] = { nome, producao: 0, receita: 0, despesas: 0 };
      stats[nome].producao += p.valor_credito || 0;
    });

    receitas.filter(r => (r.data || '') >= periodo.inicio && (r.data || '') <= periodo.fim)
      .forEach(r => {
        const nome = r.filial_nome || 'Sem filial';
        if (!stats[nome]) stats[nome] = { nome, producao: 0, receita: 0, despesas: 0 };
        stats[nome].receita += r.valor || 0;
      });

    despesas.filter(d => (d.data || '') >= periodo.inicio && (d.data || '') <= periodo.fim)
      .forEach(d => {
        const nome = d.filial_nome || 'Sem filial';
        if (!stats[nome]) stats[nome] = { nome, producao: 0, receita: 0, despesas: 0 };
        stats[nome].despesas += d.valor || 0;
      });

    return Object.values(stats)
      .map(s => ({ ...s, lucro: s.receita - s.despesas }))
      .sort((a, b) => b.producao - a.producao);
  }, [vendas, propostas, receitas, despesas, periodo]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-500" />
          Ranking de Filiais
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ranking.length === 0 ? (
          <p className="text-center text-slate-400 py-8">Nenhum dado no período</p>
        ) : (
          <div className="space-y-3">
            {ranking.map((f, i) => (
              <div key={f.nome} className={`p-3 rounded-xl border ${i === 0 ? 'bg-amber-50 border-amber-200' : i === 1 ? 'bg-slate-50 border-slate-200' : i === 2 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{medalhas[i] || `${i + 1}º`}</span>
                    <p className="font-semibold text-slate-900 text-sm">{f.nome}</p>
                  </div>
                  <p className="font-bold text-slate-900 text-sm">{BRL(f.producao)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-slate-500">Receita</p><p className="font-medium text-green-700">{BRL(f.receita)}</p></div>
                  <div><p className="text-slate-500">Despesas</p><p className="font-medium text-red-600">{BRL(f.despesas)}</p></div>
                  <div><p className="text-slate-500">Lucro</p><p className={`font-medium ${f.lucro >= 0 ? 'text-green-700' : 'text-red-600'}`}>{BRL(f.lucro)}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
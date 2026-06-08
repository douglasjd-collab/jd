import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy } from 'lucide-react';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const medalhas = ['🥇', '🥈', '🥉'];

export default function DashboardRankingVendedores({ vendas, propostas, periodo }) {
  const ranking = React.useMemo(() => {
    const stats = {};

    vendas.filter(v => v.status !== 'cancelada' && v.data_venda >= periodo.inicio && v.data_venda <= periodo.fim)
      .forEach(v => {
        const nome = v.vendedor_nome || 'Sem vendedor';
        if (!stats[nome]) stats[nome] = { nome, vendas: 0, valor: 0, propostas: 0, valorProp: 0 };
        stats[nome].vendas++;
        stats[nome].valor += v.valorCredito || 0;
      });

    propostas.filter(p => {
      const data = p.emprestimo_data_liberacao || p.data_venda || '';
      return !['cancelado', 'cancelada'].includes(p.status) && data >= periodo.inicio && data <= periodo.fim;
    }).forEach(p => {
      const nome = p.vendedor_nome || 'Sem vendedor';
      if (!stats[nome]) stats[nome] = { nome, vendas: 0, valor: 0, propostas: 0, valorProp: 0 };
      stats[nome].propostas++;
      stats[nome].valorProp += p.valor_credito || 0;
    });

    return Object.values(stats)
      .map(s => ({ ...s, totalValor: s.valor + s.valorProp, totalNeg: s.vendas + s.propostas }))
      .sort((a, b) => b.totalValor - a.totalValor)
      .slice(0, 10);
  }, [vendas, propostas, periodo]);

  const max = ranking[0]?.totalValor || 1;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Ranking de Vendedores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ranking.length === 0 ? (
          <p className="text-center text-slate-400 py-8">Nenhum dado no período</p>
        ) : (
          <div className="space-y-3">
            {ranking.map((v, i) => (
              <div key={v.nome} className="flex items-center gap-3">
                <div className="w-7 text-center text-base">{medalhas[i] || `${i + 1}º`}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-slate-900 text-sm truncate">{v.nome}</p>
                    <p className="text-sm font-bold text-slate-700 ml-2">{BRL(v.totalValor)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-full"
                        style={{ width: `${(v.totalValor / max) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 whitespace-nowrap">{v.totalNeg} neg.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
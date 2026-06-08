import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const medalhas = ['🥇', '🥈', '🥉'];

export default function DashboardRankingFiliais({ vendas, propostas, propostasFinanciamento = [], propostasSeguros = [], periodo }) {
  const ranking = React.useMemo(() => {
    const stats = {};

    const add = (nome, valor, qtd = 1) => {
      const key = nome || 'Sem filial';
      if (!stats[key]) stats[key] = { nome: key, producao: 0, negocios: 0 };
      stats[key].producao += valor;
      stats[key].negocios += qtd;
    };

    const inPeriodo = d => d && d >= periodo.inicio && d <= periodo.fim;

    // Consórcio
    vendas.filter(v => v.status !== 'cancelada' && inPeriodo(v.data_venda))
      .forEach(v => add(v.filial_nome, v.valorCredito || 0));

    // Empréstimos
    propostas.filter(p => {
      const d = p.emprestimo_data_liberacao || p.data_venda || '';
      return !['cancelado', 'cancelada'].includes(p.status) && inPeriodo(d);
    }).forEach(p => add(p.filial_nome, p.valor_credito || 0));

    // Financiamentos
    propostasFinanciamento.filter(p => {
      const d = p.financiamento_data_liberacao || p.data_venda || '';
      return !['cancelado', 'cancelada'].includes(p.status) && inPeriodo(d);
    }).forEach(p => add(p.filial_nome, p.financiamento_valor_financiado || p.valor_credito || 0));

    // Seguros
    propostasSeguros.filter(p => p.status !== 'cancelado' && inPeriodo(p.data_inicio))
      .forEach(p => add(p.filial_nome, p.valor_parcela || 0));

    return Object.values(stats)
      .sort((a, b) => b.producao - a.producao);
  }, [vendas, propostas, propostasFinanciamento, propostasSeguros, periodo]);

  const max = ranking[0]?.producao || 1;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-500" />
          Ranking de Filiais por Produção
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
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-full"
                      style={{ width: `${(f.producao / max) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 whitespace-nowrap">{f.negocios} neg.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
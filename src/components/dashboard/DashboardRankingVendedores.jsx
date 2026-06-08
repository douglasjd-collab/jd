import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy } from 'lucide-react';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const medalhas = ['🥇', '🥈', '🥉'];

const PRODUTOS = [
  { key: 'geral', label: 'Geral' },
  { key: 'consorcio', label: 'Consórcio' },
  { key: 'emprestimo', label: 'Empréstimos' },
  { key: 'financiamento', label: 'Financiamentos' },
  { key: 'seguro', label: 'Seguros' },
];

export default function DashboardRankingVendedores({ vendas, propostas, propostasFinanciamento = [], propostasSeguros = [], periodo }) {
  const [produtoAtivo, setProdutoAtivo] = useState('geral');

  const ranking = useMemo(() => {
    const stats = {};

    const add = (nome, valor, qtd = 1) => {
      if (!nome) nome = 'Sem vendedor';
      if (!stats[nome]) stats[nome] = { nome, totalValor: 0, totalNeg: 0 };
      stats[nome].totalValor += valor;
      stats[nome].totalNeg += qtd;
    };

    const inPeriodo = (data) => data && data >= periodo.inicio && data <= periodo.fim;

    // Consórcio
    if (produtoAtivo === 'geral' || produtoAtivo === 'consorcio') {
      vendas.filter(v => v.status !== 'cancelada' && inPeriodo(v.data_venda))
        .forEach(v => add(v.vendedor_nome, v.valorCredito || 0));
    }

    // Empréstimos
    if (produtoAtivo === 'geral' || produtoAtivo === 'emprestimo') {
      propostas.filter(p => {
        const data = p.emprestimo_data_liberacao || p.data_venda || '';
        return !['cancelado', 'cancelada'].includes(p.status) && inPeriodo(data);
      }).forEach(p => add(p.vendedor_nome, p.valor_credito || 0));
    }

    // Financiamentos
    if (produtoAtivo === 'geral' || produtoAtivo === 'financiamento') {
      propostasFinanciamento.filter(p => {
        const data = p.financiamento_data_liberacao || p.data_venda || '';
        return !['cancelado', 'cancelada'].includes(p.status) && inPeriodo(data);
      }).forEach(p => add(p.vendedor_nome, p.financiamento_valor_financiado || p.valor_credito || 0));
    }

    // Seguros
    if (produtoAtivo === 'geral' || produtoAtivo === 'seguro') {
      propostasSeguros.filter(p => p.status !== 'cancelado' && inPeriodo(p.data_inicio))
        .forEach(p => add(p.vendedor_nome, p.valor_parcela || 0));
    }

    return Object.values(stats)
      .sort((a, b) => b.totalValor - a.totalValor)
      .slice(0, 10);
  }, [vendas, propostas, propostasFinanciamento, propostasSeguros, periodo, produtoAtivo]);

  const max = ranking[0]?.totalValor || 1;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Ranking de Vendedores
        </CardTitle>
        {/* Filtro por produto */}
        <div className="flex flex-wrap gap-1 mt-2">
          {PRODUTOS.map(p => (
            <button
              key={p.key}
              onClick={() => setProdutoAtivo(p.key)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium border transition-colors ${
                produtoAtivo === p.key
                  ? 'bg-[#23BE84] text-white border-[#23BE84]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#23BE84]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
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
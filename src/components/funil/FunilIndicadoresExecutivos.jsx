import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Target, Users, DollarSign, Calendar, Clock, Award } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

export default function FunilIndicadoresExecutivos({ 
  oportunidades, 
  etapas = [],
  vendedores = [],
  filterProduto = 'todos' 
}) {
  // Filtrar oportunidades por produto
  const filteredOportunidades = Array.isArray(oportunidades) ? oportunidades.filter(o => {
    if (filterProduto === 'todos') return true;
    const produtoOport = o.produto || 'consorcio';
    return produtoOport === filterProduto;
  }) : [];

  // Métricas principais
  const totalOportunidades = filteredOportunidades.filter(o => o.status === 'aberta').length;
  const totalGanhos = filteredOportunidades.filter(o => o.status === 'ganha').length;
  const totalPerdidos = filteredOportunidades.filter(o => o.status === 'perdida').length;
  const valorEmNegociacao = filteredOportunidades.filter(o => o.status === 'aberta').reduce((sum, o) => sum + (o.valor_estimado || 0), 0);
  const valorGanhos = filteredOportunidades.filter(o => o.status === 'ganha').reduce((sum, o) => sum + (o.valor_estimado || 0), 0);
  
  // Taxa de conversão
  const totalFechadas = totalGanhos + totalPerdidos;
  const taxaConversao = totalFechadas > 0 ? ((totalGanhos / totalFechadas) * 100).toFixed(1) : 0;

  // Ticket médio
  const ticketMedio = totalGanhos > 0 ? (valorGanhos / totalGanhos) : 0;

  // Oportunidades atrasadas
  const agora = new Date();
  const totalAtrasados = filteredOportunidades.filter(o =>
    o.data_fechamento_prevista && 
    o.data_fechamento_prevista < agora.toISOString().split('T')[0] && 
    o.status === 'aberta'
  ).length;

  // Sem resposta (>24h)
  const totalSemResposta = filteredOportunidades.filter(o => {
    const diffMs = agora - new Date(o.data_ultima_movimentacao || o.created_date || agora);
    return diffMs / (1000 * 60 * 60) >= 24 && o.status === 'aberta';
  }).length;

  // Tempo médio nas etapas
  const tempoMedioEtapa = (() => {
    const tempos = filteredOportunidades
      .filter(o => o.status === 'aberta' && o.data_ultima_movimentacao)
      .map(o => {
        const diffMs = agora - new Date(o.data_ultima_movimentacao);
        return diffMs / (1000 * 60 * 60 * 24); // dias
      });
    if (tempos.length === 0) return 0;
    return (tempos.reduce((sum, t) => sum + t, 0) / tempos.length).toFixed(1);
  })();

  // Ranking vendedores
  const rankingVendedores = (() => {
    const vendasPorVendedor = {};
    filteredOportunidades
      .filter(o => o.status === 'ganha' && o.vendedor_id)
      .forEach(o => {
        if (!vendasPorVendedor[o.vendedor_id]) {
          const vendedor = vendedores.find(v => v.id === o.vendedor_id);
          vendasPorVendedor[o.vendedor_id] = {
            id: o.vendedor_id,
            nome: vendedor?.nome || vendedor?.razao_social || 'Sem nome',
            quantidade: 0,
            valor: 0
          };
        }
        vendasPorVendedor[o.vendedor_id].quantidade += 1;
        vendasPorVendedor[o.vendedor_id].valor += (o.valor_estimado || 0);
      });
    
    return Object.values(vendasPorVendedor)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  })();

  // Distribuição por etapa
  const distribuicaoEtapas = etapas.map(etapa => {
    const oportEtapa = filteredOportunidades.filter(o => o.etapa_id === etapa.id && o.status === 'aberta');
    return {
      etapa: etapa.nome,
      quantidade: oportEtapa.length,
      valor: oportEtapa.reduce((sum, o) => sum + (o.valor_estimado || 0), 0),
      cor: etapa.cor
    };
  }).filter(e => e.quantidade > 0);

  return (
    <div className="space-y-6">
      {/* Cards Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-600 font-semibold uppercase">Em Negociação</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(valorEmNegociacao)}</p>
              <p className="text-xs text-slate-500 mt-1">{totalOportunidades} oportunidades</p>
            </div>
            <DollarSign className="w-10 h-10 text-blue-500 opacity-20" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-600 font-semibold uppercase">Ganhos</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(valorGanhos)}</p>
              <p className="text-xs text-slate-500 mt-1">{totalGanhos} vendas · {taxaConversao}% conversão</p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-500 opacity-20" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-purple-600 font-semibold uppercase">Ticket Médio</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(ticketMedio)}</p>
              <p className="text-xs text-slate-500 mt-1">Por venda fechada</p>
            </div>
            <Award className="w-10 h-10 text-purple-500 opacity-20" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-600 font-semibold uppercase">Atrasados</p>
              <p className="text-2xl font-bold text-orange-700 mt-1">{totalAtrasados}</p>
              <p className="text-xs text-slate-500 mt-1">{totalSemResposta} sem resposta</p>
            </div>
            <Clock className="w-10 h-10 text-orange-500 opacity-20" />
          </div>
        </Card>
      </div>

      {/* Tempo Médio e Distribuição */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Tempo Médio nas Etapas
          </h3>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-slate-800">{tempoMedioEtapa}</div>
            <div className="text-sm text-slate-500">dias</div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Tempo que as oportunidades ficam abertas sem movimentação</p>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Distribuição por Etapas
          </h3>
          <div className="space-y-2">
            {distribuicaoEtapas.slice(0, 5).map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.cor }}></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{d.etapa}</span>
                    <span className="font-semibold text-slate-700">{d.quantidade}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                    <div 
                      className="h-1.5 rounded-full" 
                      style={{ 
                        width: `${Math.min((d.quantidade / totalOportunidades) * 100, 100)}%`,
                        backgroundColor: d.cor 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Ranking Vendedores */}
      {rankingVendedores.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4" />
            Top 5 Vendedores
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {rankingVendedores.map((v, i) => (
              <div key={v.id} className="text-center p-3 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-800">#{i + 1}</div>
                <div className="text-xs text-slate-600 truncate mt-1">{v.nome}</div>
                <div className="text-sm font-semibold text-green-600 mt-1">{formatCurrency(v.valor)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{v.quantidade} vendas</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
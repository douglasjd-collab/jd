import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, AlertTriangle, DollarSign, TrendingDown } from 'lucide-react';

const MOTIVOS_PERDA = [
  'Sem interesse',
  'Não respondeu',
  'Fechou com concorrente',
  'Parcela alta',
  'Crédito insuficiente',
  'Crédito negado',
  'Sem documentação',
  'Cliente desistiu',
  'Sem entrada',
  'Produto inadequado',
  'Outro'
];

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

export default function FunilMotivosPerda({ oportunidades }) {
  const [selectedMotivo, setSelectedMotivo] = useState('todos');

  const statsPorMotivo = useMemo(() => {
    const stats = {};
    
    oportunidades
      .filter(o => o.status === 'perdida')
      .forEach(o => {
        const motivo = o.motivo_perda || 'Não informado';
        if (!stats[motivo]) {
          stats[motivo] = {
            motivo,
            quantidade: 0,
            valorPerdido: 0,
            percentual: 0
          };
        }
        stats[motivo].quantidade += 1;
        stats[motivo].valorPerdido += (o.valor_estimado || 0);
      });

    const totalPerdidas = Object.values(stats).reduce((sum, s) => sum + s.quantidade, 0);
    Object.values(stats).forEach(s => {
      s.percentual = totalPerdidas > 0 ? ((s.quantidade / totalPerdidas) * 100).toFixed(1) : 0;
    });

    return Object.values(stats).sort((a, b) => b.quantidade - a.quantidade);
  }, [oportunidades]);

  const totalPerdidas = statsPorMotivo.reduce((sum, s) => sum + s.quantidade, 0);
  const valorTotalPerdido = statsPorMotivo.reduce((sum, s) => sum + s.valorPerdido, 0);

  const filteredStats = selectedMotivo === 'todos' 
    ? statsPorMotivo 
    : statsPorMotivo.filter(s => s.motivo === selectedMotivo);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <X className="w-4 h-4" />
          Análise de Perdas
        </h3>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {totalPerdidas} perdidas
          </Badge>
          <Badge variant="outline" className="text-xs text-red-600">
            <DollarSign className="w-3 h-3 mr-1" />
            {formatCurrency(valorTotalPerdido)}
          </Badge>
        </div>
      </div>

      {/* Filtros de Motivo */}
      <div className="flex gap-2 flex-wrap mb-4">
        <Button
          size="sm"
          variant={selectedMotivo === 'todos' ? 'default' : 'outline'}
          onClick={() => setSelectedMotivo('todos')}
          className="h-7 text-xs"
        >
          Todos
        </Button>
        {statsPorMotivo.slice(0, 8).map(stat => (
          <Button
            key={stat.motivo}
            size="sm"
            variant={selectedMotivo === stat.motivo ? 'default' : 'outline'}
            onClick={() => setSelectedMotivo(stat.motivo)}
            className="h-7 text-xs"
          >
            {stat.motivo} ({stat.quantidade})
          </Button>
        ))}
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredStats.slice(0, 6).map((stat, i) => (
          <div key={stat.motivo} className="p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-red-800">{stat.motivo}</span>
              <Badge className="text-xs bg-red-600">{stat.quantidade}</Badge>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-red-600">Percentual:</span>
                <span className="font-semibold text-red-700">{stat.percentual}%</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-red-200">
                <span className="text-red-600">Valor perdido:</span>
                <span className="font-bold text-red-800">{formatCurrency(stat.valorPerdido)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela Detalhada */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-red-200">
              <th className="text-left py-2 px-2 font-semibold text-red-700">Motivo</th>
              <th className="text-center py-2 px-2 font-semibold text-red-700">Quantidade</th>
              <th className="text-center py-2 px-2 font-semibold text-red-700">Percentual</th>
              <th className="text-right py-2 px-2 font-semibold text-red-700">Valor Perdido</th>
            </tr>
          </thead>
          <tbody>
            {filteredStats.map((stat) => (
              <tr key={stat.motivo} className="border-b border-red-100 hover:bg-red-50">
                <td className="py-2 px-2 font-medium text-red-800">{stat.motivo}</td>
                <td className="text-center py-2 px-2">
                  <Badge className="bg-red-600 text-white">{stat.quantidade}</Badge>
                </td>
                <td className="text-center py-2 px-2 font-semibold text-red-700">{stat.percentual}%</td>
                <td className="text-right py-2 px-2 font-bold text-red-800">{formatCurrency(stat.valorPerdido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gráfico de Barras */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-2">
          <TrendingDown className="w-3 h-3" />
          Distribuição dos Motivos
        </h4>
        <div className="space-y-2">
          {filteredStats.slice(0, 10).map((stat) => (
            <div key={stat.motivo} className="flex items-center gap-2">
              <div className="w-32 text-xs text-slate-600 truncate">{stat.motivo}</div>
              <div className="flex-1 bg-red-100 rounded-full h-3">
                <div 
                  className="h-3 rounded-full bg-red-500" 
                  style={{ width: `${stat.percentual}%` }}
                ></div>
              </div>
              <div className="w-12 text-xs font-semibold text-red-700 text-right">{stat.percentual}%</div>
              <div className="w-20 text-xs text-red-600 text-right">{stat.quantidade}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
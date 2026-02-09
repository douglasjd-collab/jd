import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, AlertCircle } from 'lucide-react';

/**
 * Componente visual do Relógio Contemplador
 * Mostra a chance de contemplação baseada no índice calculado
 */
export default function RelogioContemplacao({ relogio, lanceOfertado }) {
  if (!relogio || relogio.nivel === 'desconhecido') {
    return (
      <Card className="border-slate-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-slate-500">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">Histórico insuficiente para análise</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const coresConfig = {
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      progress: 'bg-red-500',
      icon: 'text-red-500'
    },
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      progress: 'bg-yellow-500',
      icon: 'text-yellow-500'
    },
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      progress: 'bg-green-500',
      icon: 'text-green-500'
    },
    gray: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-700',
      progress: 'bg-slate-500',
      icon: 'text-slate-500'
    }
  };

  const config = coresConfig[relogio.cor] || coresConfig.gray;

  return (
    <Card className={`${config.border} border-2 ${config.bg}`}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Título e Ícone */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-5 h-5 ${config.icon}`} />
              <h3 className="font-semibold text-slate-900">Relógio Contemplador</h3>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded ${config.bg} ${config.text} border ${config.border}`}>
              Índice: {relogio.indice.toFixed(2)}x
            </span>
          </div>

          {/* Barra de Progresso */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>0%</span>
              <span className={`font-semibold ${config.text}`}>{relogio.label}</span>
              <span>100%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-4 relative overflow-hidden">
              <div 
                className={`${config.progress} h-full rounded-full transition-all duration-700 ease-out`}
                style={{ width: `${relogio.percentualRelogio}%` }}
              />
              {/* Marcador de posição */}
              <div 
                className="absolute top-0 h-full w-1 bg-slate-800 shadow-lg"
                style={{ left: `${relogio.percentualRelogio}%` }}
              />
            </div>
          </div>

          {/* Detalhes */}
          <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t">
            <div>
              <p className="text-slate-500 text-xs">Seu lance</p>
              <p className="font-semibold text-slate-900">{lanceOfertado.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Média histórica</p>
              <p className="font-semibold text-slate-900">{mediaHistorica.toFixed(2)}%</p>
            </div>
          </div>

          {/* Mensagem de Contexto */}
          <div className={`text-xs ${config.text} ${config.bg} border ${config.border} p-3 rounded-lg`}>
            <strong>💡 {textoDiferenca}</strong>
            <br />
            {relogio.nivel === 'muito_alta' || relogio.nivel === 'alta' 
              ? 'Seu lance está competitivo e tem boas chances de contemplação!'
              : relogio.nivel === 'media'
              ? 'Seu lance está na média. Considere aumentar para melhorar suas chances.'
              : 'Lance abaixo da média histórica. Recomendamos aumentar o valor.'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
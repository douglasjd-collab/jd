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
          {/* Título e Percentual */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-5 h-5 ${config.icon}`} />
              <h3 className="font-semibold text-slate-900">Relógio Contemplador</h3>
            </div>
            <span className={`text-lg font-bold ${config.text}`}>
              {relogio.chance_percentual}%
            </span>
          </div>

          {/* Barra de Progresso Semicircular */}
          <div className="space-y-2">
            <div className="flex justify-center">
              <div className="relative w-48 h-24">
                {/* Fundo do arco */}
                <svg className="w-full h-full" viewBox="0 0 200 100">
                  <path
                    d="M 20 90 A 80 80 0 0 1 180 90"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="16"
                    strokeLinecap="round"
                  />
                  {/* Arco colorido (progresso) */}
                  <path
                    d="M 20 90 A 80 80 0 0 1 180 90"
                    fill="none"
                    stroke={config.progress.replace('bg-', '')}
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeDasharray={`${relogio.percentualRelogio * 2.51}, 251`}
                    className="transition-all duration-1000 ease-out"
                    style={{ stroke: config.progress === 'bg-red-500' ? '#ef4444' : config.progress === 'bg-yellow-500' ? '#eab308' : '#22c55e' }}
                  />
                </svg>
                {/* Texto central */}
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
                  <span className={`text-3xl font-bold ${config.text}`}>
                    {relogio.chance_percentual}%
                  </span>
                  <span className="text-xs text-slate-600 mt-1">de chance</span>
                </div>
              </div>
            </div>
            <p className={`text-center text-sm font-medium ${config.text}`}>{relogio.label}</p>
          </div>

          {/* Detalhes do Lance */}
          <div className="grid grid-cols-1 gap-2 text-sm pt-3 border-t">
            <div className="flex justify-between">
              <span className="text-slate-600">Seu lance:</span>
              <span className="font-semibold text-slate-900">{lanceOfertado.toFixed(2)}%</span>
            </div>
          </div>

          {/* Mensagem de Contexto */}
          <div className={`text-xs ${config.text} ${config.bg} border ${config.border} p-3 rounded-lg`}>
            <strong>💡 {relogio.nivel === 'alta' 
              ? 'Você está acima da média do grupo!'
              : relogio.nivel === 'media'
              ? 'Você está na média do grupo.'
              : 'Seu lance está abaixo da média.'}</strong>
            <br />
            {relogio.nivel === 'alta' 
              ? 'Seu lance está competitivo e tem boas chances de contemplação!'
              : relogio.nivel === 'media'
              ? 'Seu lance está na média. Considere aumentar para melhorar suas chances.'
              : 'Lance abaixo da média histórica. Recomendamos aumentar o valor.'}
        </div>
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

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
            <p className="text-sm">Histórico insuficiente</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determinar cor do medidor baseado no nível
  let corFundo, corAgulha, textoNivel;
  
  if (relogio.nivel === 'baixa') {
    corFundo = '#ef4444'; // vermelho
    corAgulha = '#dc2626';
    textoNivel = 'Baixa Chance';
  } else if (relogio.nivel === 'media') {
    corFundo = '#22c55e'; // verde
    corAgulha = '#16a34a';
    textoNivel = 'Boa Chance';
  } else {
    corFundo = '#3b82f6'; // azul
    corAgulha = '#2563eb';
    textoNivel = 'Muita Chance';
  }

  // Calcular ângulo da agulha (de -90 a 90 graus, onde -90 é esquerda e 90 é direita)
  const anguloAgulha = -90 + (relogio.percentualRelogio * 1.8);

  return (
    <Card className="border-slate-200">
      <CardContent className="pt-6">
        <div className="space-y-3">
          {/* Título */}
          <h3 className="font-semibold text-slate-900 text-center text-sm">⏱️ Relógio Contemplador</h3>

          {/* Medidor Circular */}
          <div className="flex justify-center">
            <div className="relative w-40 h-24">
              {/* SVG do medidor */}
              <svg className="w-full h-full" viewBox="0 0 200 120">
                {/* Fundo do arco - vermelho */}
                <path
                  d="M 20 100 A 80 80 0 0 1 100 20"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="20"
                  strokeLinecap="round"
                />
                {/* Meio do arco - verde */}
                <path
                  d="M 100 20 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="20"
                  strokeLinecap="round"
                />
                {/* Área azul (5% acima do mínimo) */}
                <path
                  d="M 140 40 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="20"
                  strokeLinecap="round"
                />
                
                {/* Agulha indicadora */}
                <g transform={`rotate(${anguloAgulha} 100 100)`}>
                  <line
                    x1="100"
                    y1="100"
                    x2="100"
                    y2="40"
                    stroke={corAgulha}
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="100" cy="100" r="6" fill={corAgulha} />
                </g>

                {/* Labels */}
                <text x="30" y="115" fontSize="10" fill="#ef4444" fontWeight="bold">BAIXA</text>
                <text x="78" y="25" fontSize="10" fill="#22c55e" fontWeight="bold">BOA</text>
                <text x="155" y="115" fontSize="10" fill="#3b82f6" fontWeight="bold">ALTA</text>
              </svg>
            </div>
          </div>

          {/* Texto do nível */}
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: corFundo }}>{textoNivel}</p>
            <p className="text-xs text-slate-600 mt-1">Lance: {lanceOfertado.toFixed(2)}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

/**
 * Calcula nível de chance com base na diferença entre lance ofertado e menor lance da assembleia
 */
export function calcularChanceContemplacao(lanceOfertadoPct, menorLancePct) {
  const diff = lanceOfertadoPct - menorLancePct;
  if (diff > 10) return { nivel: 4, label: 'Forte chance', cor: 'green', diff };
  if (diff >= 0) return { nivel: 3, label: 'Boa chance', cor: 'blue', diff };
  if (diff >= -10) return { nivel: 2, label: 'Média chance', cor: 'yellow', diff };
  return { nivel: 1, label: 'Baixa chance', cor: 'red', diff };
}

const NIVEIS = [
  { label: 'Baixa chance', cor: 'bg-red-500', textCor: 'text-red-700', bgLight: 'bg-red-50 border-red-200' },
  { label: 'Média chance', cor: 'bg-yellow-400', textCor: 'text-yellow-700', bgLight: 'bg-yellow-50 border-yellow-200' },
  { label: 'Boa chance', cor: 'bg-blue-500', textCor: 'text-blue-700', bgLight: 'bg-blue-50 border-blue-200' },
  { label: 'Forte chance', cor: 'bg-green-500', textCor: 'text-green-700', bgLight: 'bg-green-50 border-green-200' },
];

export default function AnaliseContemplacao({ analise }) {
  if (!analise) return null;

  const { modalidade, menorLancePct, lanceOfertadoPct, sem_historico } = analise;
  const modalidadeLabel = modalidade === 'livre' ? 'Lance Livre' : 'Lance Limitado';

  if (sem_historico) {
    return (
      <Card className="border-0 shadow-sm border-l-4 border-l-slate-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-slate-500" />
            Análise de Contemplação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <AlertCircle className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600">
              Não existe menor lance cadastrado para essa modalidade, administradora ou grupo.
              Cadastre a última assembleia para gerar análise de contemplação.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chance = calcularChanceContemplacao(lanceOfertadoPct, menorLancePct);
  const nivelIdx = chance.nivel - 1;
  const nivelInfo = NIVEIS[nivelIdx];
  const diffAbs = Math.abs(chance.diff).toFixed(2);
  const diffSinal = chance.diff >= 0 ? '+' : '-';

  return (
    <Card className={`border-0 shadow-sm border-l-4 border-l-${nivelInfo.cor.replace('bg-','').split('-')[0]}-500`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-[#10353C]" />
          Análise de Contemplação — <span className="font-normal text-slate-500">{modalidadeLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Grid de dados */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Menor lance histórico</p>
            <p className="text-xl font-bold text-slate-800">{menorLancePct.toFixed(2)}%</p>
            <p className="text-xs text-slate-400">{modalidadeLabel}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Lance ofertado</p>
            <p className="text-xl font-bold text-slate-800">{lanceOfertadoPct.toFixed(2)}%</p>
            <p className="text-xs text-slate-400">Total</p>
          </div>
          <div className={`rounded-lg p-3 text-center border ${nivelInfo.bgLight}`}>
            <p className={`text-xs mb-1 ${nivelInfo.textCor}`}>Diferença</p>
            <p className={`text-xl font-bold ${nivelInfo.textCor}`}>{diffSinal}{diffAbs}%</p>
            <p className={`text-xs ${nivelInfo.textCor}`}>{chance.diff >= 0 ? 'acima' : 'abaixo'}</p>
          </div>
        </div>

        {/* Medidor visual */}
        <div>
          <p className="text-xs text-slate-500 mb-2 font-medium">Nível de Chance:</p>
          <div className="grid grid-cols-4 gap-1">
            {NIVEIS.map((n, i) => (
              <div
                key={i}
                className={`rounded-lg py-2 px-1 text-center transition-all ${
                  i === nivelIdx
                    ? `${n.cor} text-white shadow-md scale-105`
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                <p className="text-xs font-semibold leading-tight">{n.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Status destaque */}
        <div className={`rounded-xl p-3 border text-center ${nivelInfo.bgLight}`}>
          {chance.nivel === 4 && <TrendingUp className={`w-5 h-5 mx-auto mb-1 ${nivelInfo.textCor}`} />}
          {chance.nivel === 3 && <TrendingUp className={`w-5 h-5 mx-auto mb-1 ${nivelInfo.textCor}`} />}
          {chance.nivel === 2 && <Minus className={`w-5 h-5 mx-auto mb-1 ${nivelInfo.textCor}`} />}
          {chance.nivel === 1 && <TrendingDown className={`w-5 h-5 mx-auto mb-1 ${nivelInfo.textCor}`} />}
          <p className={`text-base font-bold ${nivelInfo.textCor}`}>{chance.label} de contemplação</p>
          <p className={`text-xs mt-0.5 ${nivelInfo.textCor} opacity-80`}>
            {chance.diff >= 0
              ? `Lance está ${diffAbs}% acima do menor lance da última assembleia`
              : `Lance está ${diffAbs}% abaixo do menor lance da última assembleia`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
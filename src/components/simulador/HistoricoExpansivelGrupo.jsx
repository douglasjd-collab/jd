import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Gavel, Lock, Tag, Trophy, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/components/utils/gruposConsorcioHelpers';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function nomeMesAno(dataStr) {
  const d = new Date(dataStr + 'T00:00:00');
  return `${MESES[d.getMonth()]} / ${d.getFullYear()}`;
}

function dataBR(dataStr) {
  return new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function HistoricoExpansivelGrupo({ assembleias, mediaLivre, mediaLimitado, totalContemplados }) {
  const [mesAberto, setMesAberto] = useState(null);
  const ultimas3 = (assembleias || []).slice(0, 3);

  return (
    <div className="mt-3 rounded-lg border border-[#E0E4EA] bg-[#F8F9FC] overflow-hidden">
      {/* Cabeçalho do histórico */}
      <div className="px-4 py-2.5 bg-white border-b border-[#E0E4EA]">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <span>📈</span> Histórico
        </p>
      </div>

      {/* Lista estilo explorador de arquivos */}
      <div className="divide-y divide-[#E0E4EA]">
        {ultimas3.map((a, idx) => {
          const chave = a.id || a.data_assembleia + '_' + idx;
          const aberto = mesAberto === chave;
          return (
            <div key={chave}>
              <button
                type="button"
                onClick={() => setMesAberto(aberto ? null : chave)}
                className={cn(
                  'w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors',
                  aberto ? 'bg-white' : 'hover:bg-white/60'
                )}
              >
                {aberto
                  ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                <span className="text-sm font-medium text-slate-700">{nomeMesAno(a.data_assembleia)}</span>
              </button>

              {aberto && (
                <div className="px-4 pb-3 pt-1 bg-white">
                  <div className="rounded-md border border-[#E0E4EA] divide-y divide-[#E0E4EA] overflow-hidden">
                    {/* Data da assembleia */}
                    <div className="px-3 py-2 bg-slate-50">
                      <p className="text-xs text-slate-400">Assembleia</p>
                      <p className="text-sm font-medium text-slate-700">{dataBR(a.data_assembleia)}</p>
                    </div>

                    {/* Lance Livre */}
                    <div className="px-3 py-2 flex items-center gap-3">
                      <Gavel className="w-4 h-4 text-[#2D559E] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Lance Livre</p>
                        <p className="text-xs text-slate-400">{a.lance_livre_qtd_contemplados || 0} contemplados</p>
                      </div>
                      <p className="text-sm font-bold text-[#2D559E]">{formatPercent(a.lance_livre_menor_percentual)}</p>
                    </div>

                    {/* Lance Limitado */}
                    <div className="px-3 py-2 flex items-center gap-3">
                      <Lock className="w-4 h-4 text-orange-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Lance Limitado</p>
                        <p className="text-xs text-slate-400">{a.lance_limitado_qtd_contemplados || 0} contemplados</p>
                      </div>
                      <p className="text-sm font-bold text-orange-600">{formatPercent(a.lance_limitado_menor_percentual)}</p>
                    </div>

                    {/* Fixo 30% */}
                    <div className="px-3 py-2 flex items-center gap-3">
                      <Tag className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Fixo 30%</p>
                      </div>
                      <p className="text-sm font-bold text-slate-600">{a.lance_fixo_30_qtd_contemplados || 0}</p>
                    </div>

                    {/* Fixo 50% */}
                    <div className="px-3 py-2 flex items-center gap-3">
                      <Tag className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Fixo 50%</p>
                      </div>
                      <p className="text-sm font-bold text-slate-600">{a.lance_fixo_50_qtd_contemplados || 0}</p>
                    </div>

                    {/* Sorteio */}
                    <div className="px-3 py-2 flex items-center gap-3">
                      <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Sorteio</p>
                      </div>
                      <p className="text-sm font-bold text-amber-600">{a.sorteio_qtd_contemplados || 0}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resumo dos últimos 3 meses */}
      <div className="px-4 py-3 bg-white border-t border-[#E0E4EA]">
        <p className="text-xs font-semibold text-slate-500 mb-2">Resumo dos últimos 3 meses</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-slate-400">Média Lance Livre</p>
            <p className="text-sm font-bold text-[#2D559E]">{formatPercent(mediaLivre)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Média Lance Limitado</p>
            <p className="text-sm font-bold text-orange-600">{formatPercent(mediaLimitado)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Contemplados</p>
            <p className="text-sm font-bold text-slate-700">{totalContemplados || 0} pessoas</p>
          </div>
        </div>
      </div>

      {/* Aviso de rodapé */}
      <div className="px-4 py-2.5 bg-[#F8F9FC] border-t border-[#E0E4EA]">
        <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5 text-center">
          <ShieldCheck className="w-3 h-3" />
          As informações são baseadas nas assembleias anteriores e não garantem contemplação futura.
        </p>
      </div>
    </div>
  );
}
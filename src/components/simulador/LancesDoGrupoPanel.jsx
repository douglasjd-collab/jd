import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const fmt = (v) =>
  typeof v === "number" && !Number.isNaN(v) ? `${v.toFixed(2)}%` : "-";

const label = (m) => {
  const map = {
    lance_livre: "Lance Livre",
    lance_limitado: "Lance Limitado",
    sorteio: "Sorteio",
    lance_fixo_15: "Fixo 15%",
    lance_fixo_30: "Fixo 30%",
    lance_fixo_50: "Fixo 50%",
  };
  return map[m] || m || "-";
};

function getResumo(resumos, key) {
  return resumos.find((r) => r.modalidade === key) || null;
}

export default function LancesDoGrupoPanel({ 
  grupo, 
  onMenorLanceLivreChange,
  onMaiorLanceLivreChange,
  onMenorLanceLimitadoChange,
  onMaiorLanceLimitadoChange
}) {
  const enabled = !!grupo;

  const { data, isLoading, error } = useQuery({
    queryKey: ["lances-grupo-detalhes", grupo],
    enabled,
    queryFn: async () => {
        console.log('🔍 Buscando detalhes do grupo:', grupo);

        // 1) Buscar todos os detalhes e históricos
        const todosDetalhes = await base44.entities.HistoricoLanceDetalhe.list();
        const todosHistoricos = await base44.entities.HistoricoLanceGrupo.list();

        console.log('📊 Total de detalhes:', todosDetalhes?.length || 0);
        console.log('📊 Total de históricos:', todosHistoricos?.length || 0);

        const grupoNormalizado = String(grupo).replace(/^0+/, '') || '0';

        // 2) Filtrar TODOS os detalhes do grupo (histórico completo)
        const todosDetalhesDoGrupo = todosDetalhes.filter(d => {
          const grupoDetalheNormalizado = String(d.grupo).replace(/^0+/, '') || '0';
          return grupoDetalheNormalizado === grupoNormalizado;
        });

        console.log(`✅ Detalhes encontrados para grupo "${grupo}":`, todosDetalhesDoGrupo.length);

        if (!todosDetalhesDoGrupo || todosDetalhesDoGrupo.length === 0) {
          return { ultimoHistorico: null, todosDetalhes: [], detalhesUltimoHistorico: [] };
        }

        // 3) Encontrar o histórico mais recente para este grupo
        const historicosDoGrupo = todosHistoricos
          .filter(h => todosDetalhesDoGrupo.some(d => d.historico_id === h.id))
          .sort((a, b) => new Date(b.assembleia_data) - new Date(a.assembleia_data));

        if (historicosDoGrupo.length === 0) {
          return { ultimoHistorico: null, todosDetalhes: [], detalhesUltimoHistorico: [] };
        }

        const ultimoHistorico = historicosDoGrupo[0];
        console.log('✅ Histórico mais recente:', ultimoHistorico.assembleia_data);

        // 4) Detalhes do último histórico (para menor lance)
        const detalhesUltimoHistorico = todosDetalhesDoGrupo.filter(
          d => d.historico_id === ultimoHistorico.id
        );

        console.log('📊 Detalhes do último histórico:', detalhesUltimoHistorico.length);
        console.log('📊 Detalhes de TODO o histórico:', todosDetalhesDoGrupo.length);

        return {
          ultimoHistorico,
          todosDetalhes: todosDetalhesDoGrupo,
          detalhesUltimoHistorico
        };
      },
  });

  const ultimoHistorico = data?.ultimoHistorico || null;
  const todosDetalhes = data?.todosDetalhes || [];
  const detalhesUltimoHistorico = data?.detalhesUltimoHistorico || [];

  // 1️⃣ MENOR LANCE → apenas do último histórico (piso atual do mercado)
  const getMenorLanceUltimoHistorico = (modalidade) => {
    const lances = detalhesUltimoHistorico
      .filter(d =>
        d.modalidade === modalidade &&
        typeof d.lance_percent === 'number'
      )
      .map(d => d.lance_percent);

    return lances.length ? Math.min(...lances) : null;
  };

  // 2️⃣ MAIOR LANCE → histórico COMPLETO (teto histórico)
  const getMaiorLanceHistoricoCompleto = (modalidade) => {
    const lances = todosDetalhes
      .filter(d =>
        d.modalidade === modalidade &&
        typeof d.lance_percent === 'number'
      )
      .map(d => d.lance_percent);

    return lances.length ? Math.max(...lances) : null;
  };

  // Notificar o componente pai quando os valores mudarem
  React.useEffect(() => {
    const menorLanceLivre = getMenorLanceUltimoHistorico('lance_livre');
    const menorLanceLimitado = getMenorLanceUltimoHistorico('lance_limitado');
    const maiorLanceLivre = getMaiorLanceHistoricoCompleto('lance_livre');
    const maiorLanceLimitado = getMaiorLanceHistoricoCompleto('lance_limitado');

    if (onMenorLanceLivreChange) onMenorLanceLivreChange(menorLanceLivre);
    if (onMaiorLanceLivreChange) onMaiorLanceLivreChange(maiorLanceLivre);
    if (onMenorLanceLimitadoChange) onMenorLanceLimitadoChange(menorLanceLimitado);
    if (onMaiorLanceLimitadoChange) onMaiorLanceLimitadoChange(maiorLanceLimitado);
  }, [
    getMenorLanceUltimoHistorico, 
    getMaiorLanceHistoricoCompleto, 
    onMenorLanceLivreChange, 
    onMaiorLanceLivreChange,
    onMenorLanceLimitadoChange,
    onMaiorLanceLimitadoChange
  ]);

  if (!enabled) return null;

  return (
    <Card className="border-emerald-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Histórico de lances do GRUPO {grupo}
        </CardTitle>
        {ultimoHistorico && (
          <Badge variant="secondary">
            Assembleia: {new Date(ultimoHistorico.assembleia_data).toLocaleDateString('pt-BR')}
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando lances…
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">
            Erro ao carregar histórico.
          </div>
        ) : todosDetalhes.length === 0 ? (
          <div className="text-sm text-slate-600">
            Não achei histórico importado para esse grupo.
          </div>
        ) : null}

        {todosDetalhes.length > 0 && ultimoHistorico && (() => {
          // Lance Livre: menor (última assembleia) + maior (histórico completo)
          const menorLanceLivre = getMenorLanceUltimoHistorico('lance_livre');
          const maiorLanceLivre = getMaiorLanceHistoricoCompleto('lance_livre');

          // Lance Limitado: menor (última assembleia) + maior (histórico completo)
          const menorLanceLimitado = getMenorLanceUltimoHistorico('lance_limitado');
          const maiorLanceLimitado = getMaiorLanceHistoricoCompleto('lance_limitado');

          return (
            <>
              <div className="text-xs text-slate-500 mt-3 bg-emerald-50 p-2 rounded">
                💡 <b>Dados da última assembleia ({new Date(ultimoHistorico.assembleia_data).toLocaleDateString('pt-BR')})</b>
                <br/>
                <b>Menor</b> = última assembleia (piso atual) | <b>Maior</b> = histórico completo (teto histórico)
                <br/>
                Lance próximo ao "Maior" aumenta chances, próximo ao "Menor" é mais conservador.
              </div>

              <div className="mt-3 p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border-2 border-slate-200">
                <div className="grid grid-cols-2 gap-4">
                  {menorLanceLivre !== null && (
                    <div className="bg-white rounded-lg px-4 py-3 border-2 border-emerald-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-600 text-center mb-2">Lance Livre (Embutido)</p>
                      <div className="border-b border-slate-200 pb-2 mb-2">
                        <p className="text-[10px] font-medium text-emerald-600 text-center uppercase">Menor Lance</p>
                        <p className="text-3xl font-bold text-emerald-700 text-center">{fmt(menorLanceLivre)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-500 text-center uppercase">Maior Lance</p>
                        <p className="text-lg font-semibold text-slate-600 text-center">{fmt(maiorLanceLivre)}</p>
                      </div>
                    </div>
                  )}
                  {menorLanceLimitado !== null && (
                    <div className="bg-white rounded-lg px-4 py-3 border-2 border-blue-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-600 text-center mb-2">Lance Limitado (Próprio)</p>
                      <div className="border-b border-slate-200 pb-2 mb-2">
                        <p className="text-[10px] font-medium text-blue-600 text-center uppercase">Menor Lance</p>
                        <p className="text-3xl font-bold text-blue-700 text-center">{fmt(menorLanceLimitado)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-500 text-center uppercase">Maior Lance</p>
                        <p className="text-lg font-semibold text-slate-600 text-center">{fmt(maiorLanceLimitado)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
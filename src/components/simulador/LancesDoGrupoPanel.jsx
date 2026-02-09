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

export default function LancesDoGrupoPanel({ grupo }) {
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

  const detalhes = data?.detalhes || [];
  const historicos = data?.historicos || [];

  // Função para calcular menor e maior lance por modalidade (usando detalhes)
  const calcularMenorMaiorLancePorModalidade = (modalidade) => {
    const lances = detalhes
      .filter(d =>
        d.modalidade === modalidade &&
        typeof d.lance_percent === 'number'
      )
      .map(d => d.lance_percent);

    if (!lances.length) {
      return { menor: null, maior: null };
    }

    return {
      menor: Math.min(...lances),
      maior: Math.max(...lances)
    };
  };

  if (!enabled) return null;

  return (
    <Card className="border-emerald-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Histórico de lances do GRUPO {grupo}
        </CardTitle>
        {historicos.length > 0 && (
          <Badge variant="secondary">
            Assembleia: {new Date(historicos[0].assembleia_data).toLocaleDateString('pt-BR')}
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
        ) : detalhes.length === 0 ? (
          <div className="text-sm text-slate-600">
            Não achei histórico importado para esse grupo.
          </div>
        ) : null}

        {detalhes.length > 0 && historicos.length > 0 && (() => {
          const lanceLivre = calcularMenorMaiorLancePorModalidade('lance_livre');
          const lanceLimitado = calcularMenorMaiorLancePorModalidade('lance_limitado');

          return (
            <>
              <div className="text-xs text-slate-500 mt-3 bg-emerald-50 p-2 rounded">
                💡 <b>Dados da última assembleia ({new Date(historicos[0].assembleia_data).toLocaleDateString('pt-BR')})</b>
                <br/>
                Use a <b>Mín</b> como referência. Lance próximo ao "Máx" aumenta chances, próximo ao "Mín" é mais conservador.
              </div>

              <div className="mt-3 p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border-2 border-slate-200">
                <p className="text-xs font-semibold text-slate-700 mb-2 text-center">MENOR LANCE</p>
                <div className="grid grid-cols-2 gap-4">
                  {lanceLivre.menor !== null && (
                    <div className="bg-white rounded px-3 py-2 border border-emerald-200">
                      <p className="text-xs text-slate-600 text-center mb-1">Lance Livre</p>
                      <p className="text-2xl font-bold text-emerald-700 text-center">{fmt(lanceLivre.menor)}</p>
                      <p className="text-xs text-slate-500 text-center mt-1">Maior: {fmt(lanceLivre.maior)}</p>
                    </div>
                  )}
                  {lanceLimitado.menor !== null && (
                    <div className="bg-white rounded px-3 py-2 border border-blue-200">
                      <p className="text-xs text-slate-600 text-center mb-1">Lance Limitado</p>
                      <p className="text-2xl font-bold text-blue-700 text-center">{fmt(lanceLimitado.menor)}</p>
                      <p className="text-xs text-slate-500 text-center mt-1">Maior: {fmt(lanceLimitado.maior)}</p>
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
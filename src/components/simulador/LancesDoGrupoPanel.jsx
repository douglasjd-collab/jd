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
    queryKey: ["lances-grupo-mais-recente", grupo],
    enabled,
    queryFn: async () => {
        console.log('🔍 Buscando grupo:', grupo, 'tipo:', typeof grupo);

        // 1) Buscar todos os resumos e históricos
        const todosResumos = await base44.entities.HistoricoLanceResumo.list();
        const todosHistoricos = await base44.entities.HistoricoLanceGrupo.list();

        console.log('📊 Total de resumos:', todosResumos?.length || 0);
        console.log('📊 Total de históricos:', todosHistoricos?.length || 0);

        const grupoNormalizado = String(grupo).replace(/^0+/, '') || '0';

        // 2) Filtrar resumos do grupo atual
        const resumosDoGrupo = todosResumos.filter(r => {
          const grupoResumoNormalizado = String(r.grupo).replace(/^0+/, '') || '0';
          return grupoResumoNormalizado === grupoNormalizado;
        });

        console.log(`✅ Resumos encontrados para grupo "${grupo}":`, resumosDoGrupo.length);

        if (!resumosDoGrupo || resumosDoGrupo.length === 0) {
          return { historicos: [], resumos: [], periodo: 0 };
        }

        // 3) Encontrar o histórico mais recente para este grupo
        const historicosComResumosDoGrupo = todosHistoricos
          .filter(h => resumosDoGrupo.some(r => r.historico_id === h.id))
          .sort((a, b) => new Date(b.assembleia_data) - new Date(a.assembleia_data));

        if (historicosComResumosDoGrupo.length === 0) {
          return { historicos: [], resumos: [], periodo: 0 };
        }

        const historicoMaisRecente = historicosComResumosDoGrupo[0];
        console.log('✅ Histórico mais recente:', historicoMaisRecente.assembleia_data);

        // 4) Filtrar resumos do histórico mais recente
        const resumosDoHistoricoMaisRecente = resumosDoGrupo.filter(
          r => r.historico_id === historicoMaisRecente.id
        );

        console.log('📊 Resumos do histórico mais recente:', resumosDoHistoricoMaisRecente.length);

        // Log detalhado para lance_limitado
        const lanceLimitado = resumosDoHistoricoMaisRecente.find(r => r.modalidade === 'lance_limitado');
        if (lanceLimitado) {
          console.log('🔍 Lance Limitado - Dados do resumo:', lanceLimitado);
        }

        return {
          historicos: [historicoMaisRecente],
          resumos: resumosDoHistoricoMaisRecente,
          periodo: 1
        };
      },
  });

  const resumos = data?.resumos || [];
  const historicos = data?.historicos || [];
  const periodo = data?.periodo || 0;

  const cards = useMemo(() => {
    // Função para processar dados de uma modalidade
    const processar = (modalidade) => {
      const dadosModalidade = resumos.filter(r => r.modalidade === modalidade);
      if (dadosModalidade.length === 0) return null;

      const min = dadosModalidade[0].menor_lance_percent;
      const max = dadosModalidade[0].maior_lance_percent;
      const qtd = dadosModalidade[0].qtd_ocorrencias || 0;

      // Se não tem percentuais, retorna null
      if (min == null && max == null) return null;

      return { min, max, qtd };
    };

    const livre = processar("lance_livre");
    const limitado = processar("lance_limitado");
    const fixo15 = processar("lance_fixo_15");
    const fixo30 = processar("lance_fixo_30");
    const fixo50 = processar("lance_fixo_50");
    
    const sorteioResumos = resumos.filter(r => r.modalidade === "sorteio");
    const sorteioTotal = sorteioResumos.reduce((acc, d) => acc + (d.qtd_ocorrencias || 0), 0);
    const sorteio = sorteioTotal > 0 ? { qtd: sorteioTotal } : null;

    return [
      {
        key: "lance_livre",
        title: "Lance Livre",
        min: livre?.min,
        max: livre?.max,
        qtd: livre?.qtd,
      },
      {
        key: "lance_limitado",
        title: "Lance Limitado",
        min: limitado?.min,
        max: limitado?.max,
        qtd: limitado?.qtd,
      },
      {
        key: "sorteio",
        title: "Sorteio",
        qtd: sorteio?.qtd,
      },
      {
        key: "lance_fixo_15",
        title: "Lance Fixo 15%",
        min: fixo15?.min,
        max: fixo15?.max,
        qtd: fixo15?.qtd,
      },
      {
        key: "lance_fixo_30",
        title: "Lance Fixo 30%",
        min: fixo30?.min,
        max: fixo30?.max,
        qtd: fixo30?.qtd,
      },
      {
        key: "lance_fixo_50",
        title: "Lance Fixo 50%",
        min: fixo50?.min,
        max: fixo50?.max,
        qtd: fixo50?.qtd,
      },
    ];
  }, [resumos]);

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
        ) : resumos.length === 0 ? (
          <div className="text-sm text-slate-600">
            Não achei histórico importado para esse grupo.
          </div>
        ) : null}

        {resumos.length > 0 && historicos.length > 0 && (() => {
          const lanceLivre = resumos.find(r => r.modalidade === 'lance_livre');
          const lanceLimitado = resumos.find(r => r.modalidade === 'lance_limitado');
          
          // Encontrar o maior lance entre todas as modalidades de lance (excluir sorteio)
          const modalidadesDeLance = resumos.filter(r => r.modalidade !== 'sorteio');
          const maiorLanceGeral = modalidadesDeLance.length > 0
            ? Math.max(...modalidadesDeLance.map(r => r.maior_lance_percent || 0))
            : null;

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
                  {lanceLivre?.menor_lance_percent != null && (
                    <div className="bg-white rounded px-3 py-2 border border-emerald-200">
                      <p className="text-xs text-slate-600 text-center mb-1">Lance Livre</p>
                      <p className="text-2xl font-bold text-emerald-700 text-center">{fmt(lanceLivre.menor_lance_percent)}</p>
                      {lanceLivre.maior_lance_percent != null && (
                        <p className="text-xs text-slate-500 text-center mt-1">Maior: {fmt(lanceLivre.maior_lance_percent)}</p>
                      )}
                    </div>
                  )}
                  {lanceLimitado?.menor_lance_percent != null && (
                    <div className="bg-white rounded px-3 py-2 border border-blue-200">
                      <p className="text-xs text-slate-600 text-center mb-1">Lance Limitado</p>
                      <p className="text-2xl font-bold text-blue-700 text-center">{fmt(lanceLimitado.menor_lance_percent)}</p>
                      {lanceLimitado.maior_lance_percent != null && (
                        <p className="text-xs text-slate-500 text-center mt-1">Maior: {fmt(lanceLimitado.maior_lance_percent)}</p>
                      )}
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
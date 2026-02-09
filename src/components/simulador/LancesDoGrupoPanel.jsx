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
      
      // 1) Buscar TODOS os resumos
      const todosResumos = await base44.entities.HistoricoLanceResumo.list();
      console.log('📊 Total de resumos no banco:', todosResumos?.length || 0);
      
      if (todosResumos && todosResumos.length > 0) {
        console.log('📋 Grupos únicos encontrados:', [...new Set(todosResumos.map(r => r.grupo))]);
        console.log('📋 Primeiros 5 resumos:', todosResumos.slice(0, 5).map(r => ({
          id: r.id,
          grupo: r.grupo,
          tipo_grupo: typeof r.grupo,
          historico_id: r.historico_id
        })));
      }

      // Normalizar grupos removendo zeros à esquerda para comparação
      const grupoNormalizado = String(grupo).replace(/^0+/, '') || '0';
      
      const resumosDoGrupo = todosResumos.filter(r => {
        const grupoResumoNormalizado = String(r.grupo).replace(/^0+/, '') || '0';
        return grupoResumoNormalizado === grupoNormalizado;
      });
      
      console.log(`✅ Resumos encontrados para grupo "${grupo}" (normalizado: "${grupoNormalizado}"):`, resumosDoGrupo.length);

      if (!resumosDoGrupo || resumosDoGrupo.length === 0) {
        return { historicos: [], resumos: [], periodo: 0 };
      }

      // 2) Pegar os IDs únicos dos históricos que contém este grupo
      const historicosIdsComGrupo = [...new Set(resumosDoGrupo.map(r => r.historico_id))];
      console.log('🔑 IDs dos históricos com este grupo:', historicosIdsComGrupo);

      // 3) Buscar os históricos completos
      const todosHistoricos = await base44.entities.HistoricoLanceGrupo.list();
      
      // 4) Filtrar apenas os que contêm o grupo e ordenar por data (mais recente primeiro)
      const historicosComGrupo = (todosHistoricos || [])
        .filter(h => historicosIdsComGrupo.includes(h.id))
        .sort((a, b) => new Date(b.assembleia_data) - new Date(a.assembleia_data));

      console.log('📅 Históricos encontrados:', historicosComGrupo.length);

      if (historicosComGrupo.length === 0) {
        return { historicos: [], resumos: [], periodo: 0 };
      }

      // 5) Pegar apenas o histórico mais recente
      const historicoMaisRecente = historicosComGrupo[0];
      console.log('✅ Usando histórico mais recente:', historicoMaisRecente.assembleia_data);

      // 6) Filtrar apenas os resumos do histórico mais recente
      const resumosDoHistorico = resumosDoGrupo.filter(r => r.historico_id === historicoMaisRecente.id);
      console.log('📊 Resumos do histórico mais recente:', resumosDoHistorico.length);

      return { 
        historicos: [historicoMaisRecente], 
        resumos: resumosDoHistorico,
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {cards.map((c) => (
              <div key={c.key} className="rounded-lg border p-3 bg-white">
                <div className="font-medium mb-2">{c.title}</div>
                {c.key === "sorteio" ? (
                  <div className="text-sm text-slate-700">
                    Total contemplações: <b>{c.qtd ?? 0}</b>
                  </div>
                ) : c.min != null || c.max != null ? (
                  <div className="text-sm text-slate-700 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-700 font-semibold">
                        Mín: <span className="bg-blue-100 px-2 py-1 rounded">{fmt(c.min)}</span>
                      </span>
                      <span className="text-slate-700 font-semibold">
                        Máx: <span className="bg-slate-100 px-2 py-1 rounded">{fmt(c.max)}</span>
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">Amostras: {c.qtd ?? 0}</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">Sem dados</div>
                )}
              </div>
            ))}
          </div>
        )}

        {resumos.length > 0 && historicos.length > 0 && (
          <div className="text-xs text-slate-500 mt-3 bg-emerald-50 p-2 rounded">
            💡 <b>Dados da última assembleia ({new Date(historicos[0].assembleia_data).toLocaleDateString('pt-BR')})</b>
            <br/>
            Use a <b>Mín</b> como referência. Lance próximo ao "Máx" aumenta chances, próximo ao "Mín" é mais conservador.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
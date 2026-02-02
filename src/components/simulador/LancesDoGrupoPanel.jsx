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
      // 1) Buscar todos os resumos deste grupo
      const todosResumos = await base44.entities.HistoricoLanceResumo.filter({
        grupo: String(grupo),
      });

      if (!todosResumos || todosResumos.length === 0) {
        return { historicos: [], resumos: [], periodo: 0 };
      }

      // 2) Pegar os IDs únicos dos históricos que contém este grupo
      const historicosIdsComGrupo = [...new Set(todosResumos.map(r => r.historico_id))];

      // 3) Buscar os históricos completos
      const todosHistoricos = await base44.entities.HistoricoLanceGrupo.list();
      
      // 4) Filtrar apenas os que contêm o grupo e ordenar por data (mais recente primeiro)
      const historicosComGrupo = (todosHistoricos || [])
        .filter(h => historicosIdsComGrupo.includes(h.id))
        .sort((a, b) => new Date(b.assembleia_data) - new Date(a.assembleia_data));

      if (historicosComGrupo.length === 0) {
        return { historicos: [], resumos: [], periodo: 0 };
      }

      // 5) Pegar apenas o histórico mais recente
      const historicoMaisRecente = historicosComGrupo[0];

      // 6) Filtrar apenas os resumos do histórico mais recente
      const resumosDoHistorico = todosResumos.filter(r => r.historico_id === historicoMaisRecente.id);

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
      if (!min && !max) return null;

      // Calcular média entre min e max
      const media = min && max ? (min + max) / 2 : (min || max);

      return { media, min, max, qtd };
    };

    const livre = calcularMedia("lance_livre");
    const limitado = calcularMedia("lance_limitado");
    const fixo15 = calcularMedia("lance_fixo_15");
    const fixo30 = calcularMedia("lance_fixo_30");
    const fixo50 = calcularMedia("lance_fixo_50");
    
    const sorteioResumos = resumos.filter(r => r.modalidade === "sorteio");
    const sorteioTotal = sorteioResumos.reduce((acc, d) => acc + (d.qtd_ocorrencias || 0), 0);
    const sorteio = sorteioTotal > 0 ? { qtd: sorteioTotal } : null;

    return [
      {
        key: "lance_livre",
        title: "Lance Livre",
        media: livre?.media,
        min: livre?.min,
        max: livre?.max,
        qtd: livre?.qtd,
      },
      {
        key: "lance_limitado",
        title: "Lance Limitado",
        media: limitado?.media,
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
        media: fixo15?.media,
        min: fixo15?.min,
        max: fixo15?.max,
        qtd: fixo15?.qtd,
      },
      {
        key: "lance_fixo_30",
        title: "Lance Fixo 30%",
        media: fixo30?.media,
        min: fixo30?.min,
        max: fixo30?.max,
        qtd: fixo30?.qtd,
      },
      {
        key: "lance_fixo_50",
        title: "Lance Fixo 50%",
        media: fixo50?.media,
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
                ) : c.media ? (
                  <div className="text-sm text-slate-700 space-y-1">
                    <div className="text-emerald-700 font-semibold text-base">
                      Média: {fmt(c.media)}
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Mín: {fmt(c.min)}</span>
                      <span>Máx: {fmt(c.max)}</span>
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

        {resumos.length > 0 && (
          <div className="text-xs text-slate-500 mt-3 bg-emerald-50 p-2 rounded">
            💡 <b>Dica:</b> Use a <b>Média</b> como referência principal para maior assertividade. 
            Lance próximo ao "Máx" aumenta chances, próximo ao "Mín" é mais conservador.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
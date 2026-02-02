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
    queryKey: ["lances-grupo-ultimo", grupo],
    enabled,
    queryFn: async () => {
      // 1) pegar todos históricos e escolher o mais recente
      const historicos = await base44.entities.HistoricoLanceGrupo.list();
      const list = historicos || [];
      if (list.length === 0) return { historico: null, resumos: [] };

      list.sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
      const last = list[0];

      // 2) pegar resumos do histórico selecionado + grupo
      const resumos = await base44.entities.HistoricoLanceResumo.filter({
        historico_id: last.id,
        grupo: String(grupo),
      });

      return { historico: last, resumos: resumos || [] };
    },
  });

  const resumos = data?.resumos || [];
  const historico = data?.historico || null;

  const cards = useMemo(() => {
    const livre = getResumo(resumos, "lance_livre");
    const limitado = getResumo(resumos, "lance_limitado");
    const sorteio = getResumo(resumos, "sorteio");
    const fixo30 = getResumo(resumos, "lance_fixo_30");
    const fixo50 = getResumo(resumos, "lance_fixo_50");

    return [
      {
        key: "lance_livre",
        title: "Lance Livre",
        min: livre?.menor_lance_percent,
        max: livre?.maior_lance_percent,
        qtd: livre?.qtd_ocorrencias,
      },
      {
        key: "lance_limitado",
        title: "Lance Limitado",
        min: limitado?.menor_lance_percent,
        max: limitado?.maior_lance_percent,
        qtd: limitado?.qtd_ocorrencias,
      },
      {
        key: "sorteio",
        title: "Sorteio",
        qtd: sorteio?.qtd_ocorrencias,
      },
      {
        key: "lance_fixo_30",
        title: "Fixo 30%",
        min: fixo30?.menor_lance_percent,
        max: fixo30?.maior_lance_percent,
        qtd: fixo30?.qtd_ocorrencias,
      },
      {
        key: "lance_fixo_50",
        title: "Fixo 50%",
        min: fixo50?.menor_lance_percent,
        max: fixo50?.maior_lance_percent,
        qtd: fixo50?.qtd_ocorrencias,
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
        {historico?.assembleia_data ? (
          <Badge variant="secondary">Assembleia {historico.assembleia_data}</Badge>
        ) : (
          <Badge variant="secondary">Última importação</Badge>
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
                <div className="font-medium mb-1">{c.title}</div>
                {c.key === "sorteio" ? (
                  <div className="text-sm text-slate-700">
                    Ocorrências: <b>{c.qtd ?? 0}</b>
                  </div>
                ) : (
                  <div className="text-sm text-slate-700 space-y-1">
                    <div>Menor: <b>{fmt(c.min)}</b></div>
                    <div>Maior: <b>{fmt(c.max)}</b></div>
                    <div className="text-xs text-slate-500">Amostras: {c.qtd ?? 0}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {resumos.length > 0 && (
          <div className="text-xs text-slate-500 mt-3">
            Use como referência: tente trabalhar perto do "Maior" para aumentar chance e perto do "Menor" para estratégia conservadora.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
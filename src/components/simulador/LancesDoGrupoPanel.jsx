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
        console.log(`🔍 Buscando grupo normalizado: "${grupoNormalizado}" (original: "${grupo}")`);

        // 2) Filtrar TODOS os detalhes do grupo (histórico completo)
        const todosDetalhesDoGrupo = todosDetalhes.filter(d => {
          const grupoDetalheNormalizado = String(d.grupo).replace(/^0+/, '') || '0';
          return grupoDetalheNormalizado === grupoNormalizado;
        });

        console.log(`✅ Detalhes encontrados para grupo "${grupo}":`, todosDetalhesDoGrupo.length);

        if (!todosDetalhesDoGrupo || todosDetalhesDoGrupo.length === 0) {
          return { 
            ultimoHistorico: null, 
            todosDetalhes: [], 
            historicosOrdenados: [] 
          };
        }

        // 3) Ordenar históricos por data decrescente (mais recente primeiro)
        const historicosDoGrupo = todosHistoricos
          .filter(h => todosDetalhesDoGrupo.some(d => d.historico_id === h.id))
          .sort((a, b) => new Date(b.assembleia_data) - new Date(a.assembleia_data));

        if (historicosDoGrupo.length === 0) {
          return { 
            ultimoHistorico: null, 
            todosDetalhes: [], 
            historicosOrdenados: [] 
          };
        }

        const ultimoHistorico = historicosDoGrupo[0];
        console.log('✅ Histórico mais recente:', ultimoHistorico.assembleia_data);
        console.log('📊 Total de históricos encontrados:', historicosDoGrupo.length);

        return {
          ultimoHistorico,
          todosDetalhes: todosDetalhesDoGrupo,
          historicosOrdenados: historicosDoGrupo
        };
      },
  });

  const ultimoHistorico = data?.ultimoHistorico || null;
  const todosDetalhes = data?.todosDetalhes || [];
  const historicosOrdenados = data?.historicosOrdenados || [];

  // 1️⃣ MENOR LANCE → último valor NÃO-NULO da modalidade (assembleia mais recente que teve lance)
  const getMenorLanceUltimoNaoNulo = React.useCallback((modalidade) => {
    // Percorrer históricos do mais recente para o mais antigo
    for (const historico of historicosOrdenados) {
      const detalhesModalidade = todosDetalhes.filter(
        d => d.historico_id === historico.id && d.modalidade === modalidade
      );
      
      const lances = detalhesModalidade
        .filter(d => typeof d.lance_percent === 'number' && d.lance_percent > 0)
        .map(d => d.lance_percent);
      
      if (lances.length > 0) {
        const menorLance = Math.min(...lances);
        console.log(`✅ [${modalidade}] Menor lance encontrado na assembleia ${historico.assembleia_data}:`, menorLance);
        return menorLance;
      }
    }
    
    console.log(`⚠️ [${modalidade}] Nenhum lance encontrado em nenhuma assembleia`);
    return null;
  }, [todosDetalhes, historicosOrdenados]);

  // 2️⃣ MAIOR LANCE → histórico COMPLETO (teto histórico)
  const getMaiorLanceHistoricoCompleto = React.useCallback((modalidade) => {
    const lances = todosDetalhes
      .filter(d =>
        d.modalidade === modalidade &&
        typeof d.lance_percent === 'number'
      )
      .map(d => d.lance_percent);

    return lances.length ? Math.max(...lances) : null;
  }, [todosDetalhes]);

  // Notificar o componente pai quando os valores mudarem
  React.useEffect(() => {
    const menorLanceLivre = getMenorLanceUltimoNaoNulo('lance_livre');
    const menorLanceLimitado = getMenorLanceUltimoNaoNulo('lance_limitado');
    const maiorLanceLivre = getMaiorLanceHistoricoCompleto('lance_livre');
    const maiorLanceLimitado = getMaiorLanceHistoricoCompleto('lance_limitado');

    if (onMenorLanceLivreChange) onMenorLanceLivreChange(menorLanceLivre);
    if (onMaiorLanceLivreChange) onMaiorLanceLivreChange(maiorLanceLivre);
    if (onMenorLanceLimitadoChange) onMenorLanceLimitadoChange(menorLanceLimitado);
    if (onMaiorLanceLimitadoChange) onMaiorLanceLimitadoChange(maiorLanceLimitado);
  }, [
    getMenorLanceUltimoNaoNulo, 
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
          Histórico de lances do GRUPO {String(grupo).replace(/\./g, '')}
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
          // Obter todas as modalidades únicas disponíveis
          const modalidadesDisponiveis = [...new Set(todosDetalhes.map(d => d.modalidade))].filter(Boolean);
          
          const cores = {
            'lance_livre': { border: 'border-emerald-200', text: 'text-emerald-600', textBold: 'text-emerald-700' },
            'lance_limitado': { border: 'border-blue-200', text: 'text-blue-600', textBold: 'text-blue-700' },
            'sorteio': { border: 'border-purple-200', text: 'text-purple-600', textBold: 'text-purple-700' },
            'lance_fixo_15': { border: 'border-orange-200', text: 'text-orange-600', textBold: 'text-orange-700' },
            'lance_fixo_30': { border: 'border-amber-200', text: 'text-amber-600', textBold: 'text-amber-700' },
            'lance_fixo_50': { border: 'border-red-200', text: 'text-red-600', textBold: 'text-red-700' },
          };
          
          const getCorOuPadrao = (modalidade) => 
            cores[modalidade] || { border: 'border-slate-200', text: 'text-slate-600', textBold: 'text-slate-700' };
          
          const isLanceFixo = (modalidade) => modalidade?.startsWith('lance_fixo_');

          return (
            <>
              <div className="mt-4 p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border-2 border-slate-200">
                <div className="grid grid-cols-2 gap-4">
                  {modalidadesDisponiveis.map(modalidade => {
                    const menorLance = getMenorLanceUltimoHistorico(modalidade);
                    const maiorLance = getMaiorLanceHistoricoCompleto(modalidade);
                    
                    if (menorLance === null && maiorLance === null) return null;
                    
                    const cor = getCorOuPadrao(modalidade);
                    const titulo = label(modalidade);
                    const fixo = isLanceFixo(modalidade);
                    
                    return (
                      <div key={modalidade} className={`bg-white rounded-lg px-4 py-3 border-2 ${cor.border} shadow-sm`}>
                        <p className="text-xs font-semibold text-slate-600 text-center mb-2">{titulo}</p>
                        {fixo ? (
                          <div className="py-2">
                            <p className={`text-[10px] font-medium ${cor.text} text-center uppercase mb-1`}>Lance Fixo</p>
                            <p className={`text-3xl font-bold ${cor.textBold} text-center`}>{fmt(menorLance || maiorLance)}</p>
                          </div>
                        ) : (
                          <>
                            <div className="border-b border-slate-200 pb-2 mb-2">
                              <p className={`text-[10px] font-medium ${cor.text} text-center uppercase`}>Menor Lance</p>
                              <p className={`text-3xl font-bold ${cor.textBold} text-center`}>{fmt(menorLance)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium text-slate-500 text-center uppercase">Maior Lance</p>
                              <p className="text-lg font-semibold text-slate-600 text-center">{fmt(maiorLance)}</p>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
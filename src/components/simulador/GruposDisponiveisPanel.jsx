import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Target, Info, CheckCircle2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CATEGORIA_LABELS,
  CATEGORIA_ICONS,
  PRIORIDADE_ORDER,
  calcularMediaPercentual,
  obterUltimasAssembleias,
  construirAssembleiasPorGrupo,
  formatCurrency
} from '@/components/utils/gruposConsorcioHelpers';
import HistoricoExpansivelGrupo from './HistoricoExpansivelGrupo';

export default function GruposDisponiveisPanel({ empresaId, administradoraId, categoriaBem, credito, grupoSelecionado, onSelectGrupo }) {
  const [expandido, setExpandido] = useState(null);
  const [buscaNumero, setBuscaNumero] = useState('');
  const [prazoMaxFiltro, setPrazoMaxFiltro] = useState('');

  const habilitado = !!(empresaId && administradoraId && categoriaBem && credito > 0);

  const { data: grupos = [], isLoading: loadingGrupos } = useQuery({
    queryKey: ['grupos-disponiveis', empresaId, administradoraId, categoriaBem],
    enabled: habilitado,
    queryFn: () => base44.entities.GrupoConsorcio.filter({
      empresa_id: empresaId,
      administradora_id: administradoraId,
      categoria_bem: categoriaBem,
      status: 'ativo'
    })
  });

  const { data: todosDetalhesLance = [] } = useQuery({
    queryKey: ['historico-lance-detalhes', empresaId],
    enabled: habilitado,
    queryFn: () => base44.entities.HistoricoLanceDetalhe.filter({ empresa_id: empresaId })
  });

  const { data: todosHistoricosGrupo = [] } = useQuery({
    queryKey: ['historico-lance-grupo', empresaId],
    enabled: habilitado,
    queryFn: () => base44.entities.HistoricoLanceGrupo.filter({ empresa_id: empresaId })
  });

  const assembleiasPorGrupo = useMemo(
    () => construirAssembleiasPorGrupo(todosDetalhesLance, todosHistoricosGrupo),
    [todosDetalhesLance, todosHistoricosGrupo]
  );

  const gruposCompativeis = useMemo(() => {
    let lista = grupos.filter(g => {
      const minOk = g.credito_minimo === null || g.credito_minimo === undefined || Number(g.credito_minimo) <= Number(credito);
      const maxOk = g.credito_maximo === null || g.credito_maximo === undefined || Number(g.credito_maximo) >= Number(credito);
      return minOk && maxOk;
    });

    if (buscaNumero) {
      lista = lista.filter(g => g.numero_grupo?.toLowerCase().includes(buscaNumero.toLowerCase()));
    }
    if (prazoMaxFiltro) {
      lista = lista.filter(g => !g.prazo_maximo || Number(g.prazo_maximo) <= Number(prazoMaxFiltro));
    }

    const enriched = lista.map(g => {
      const grupoNormalizado = String(g.numero_grupo || '').replace(/^0+/, '') || '0';
      const assembleiasGrupo = assembleiasPorGrupo[grupoNormalizado] || [];
      const ultimas3 = obterUltimasAssembleias(assembleiasGrupo, 3);
      return {
        ...g,
        _assembleias: assembleiasGrupo,
        _mediaLivre3m: calcularMediaPercentual(ultimas3, 3, 'lance_livre_menor_percentual'),
        _mediaLimitado3m: calcularMediaPercentual(ultimas3, 3, 'lance_limitado_menor_percentual'),
        _ultimaAssembleia: ultimas3[0] || null,
        _totalContemplados3m: ultimas3.reduce((sum, a) => sum + (a.total_contemplados || 0), 0)
      };
    });

    enriched.sort((a, b) => {
      const prioA = PRIORIDADE_ORDER[a.prioridade_comercial] ?? 1;
      const prioB = PRIORIDADE_ORDER[b.prioridade_comercial] ?? 1;
      if (prioA !== prioB) return prioA - prioB;
      const medA = a._mediaLivre3m ?? -1;
      const medB = b._mediaLivre3m ?? -1;
      if (medA !== medB) return medB - medA;
      return (a.numero_grupo || '').localeCompare(b.numero_grupo || '');
    });

    return enriched;
  }, [grupos, assembleiasPorGrupo, credito, buscaNumero, prazoMaxFiltro]);

  if (!habilitado) return null;

  return (
    <Card className="border-0 shadow-sm bg-[#F8F9FC]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Target className="w-5 h-5 text-red-500" />
            Grupos Disponíveis
          </h3>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Os dados são das últimas 3 assembleias realizadas
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Filtrar por número do grupo..." value={buscaNumero} onChange={(e) => setBuscaNumero(e.target.value)} />
          <Input type="number" placeholder="Prazo máximo (meses)" value={prazoMaxFiltro} onChange={(e) => setPrazoMaxFiltro(e.target.value)} />
        </div>

        {loadingGrupos ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : gruposCompativeis.length === 0 ? (
          <p className="text-center text-slate-500 py-6 text-sm">Nenhum grupo compatível encontrado para os critérios informados.</p>
        ) : (
          <div className="space-y-3">
            {gruposCompativeis.map(g => {
              const selecionado = grupoSelecionado === g.numero_grupo;
              const expandidoAtual = expandido === g.id;
              const ultima = g._ultimaAssembleia;
              return (
                <div
                  key={g.id}
                  className={cn(
                    'rounded-xl border bg-white p-4 transition-all',
                    selecionado ? 'border-[#00A388] ring-1 ring-[#00A388]/30'
                    : 'border-[#E0E4EA] hover:border-slate-300'
                  )}
                >
                  {/* Linha superior: categoria + número */}
                  <div className="mb-3">
                    <p className="text-sm font-medium text-slate-500 mb-0.5">
                      {CATEGORIA_ICONS[g.categoria_bem] || '📦'} {CATEGORIA_LABELS[g.categoria_bem] || g.categoria_bem}
                    </p>
                    <p className="text-xl font-bold text-slate-900">Grupo {g.numero_grupo}</p>
                  </div>

                  {/* Grid resumido: 4 infos somente */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Crédito</p>
                      <p className="font-medium text-slate-700">{formatCurrency(g.credito_minimo)} – {formatCurrency(g.credito_maximo)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Prazo</p>
                      <p className="font-medium text-slate-700">{g.prazo_maximo ? `${g.prazo_maximo} meses` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Participantes</p>
                      <p className="font-medium text-slate-700">{(g.qtd_participantes ?? 0).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Última Assembleia</p>
                      <p className="font-medium text-slate-700">
                        {ultima?.data_assembleia
                          ? new Date(ultima.data_assembleia + 'T00:00:00').toLocaleDateString('pt-BR')
                          : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Botões */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#E0E4EA]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1 text-[#2D559E] hover:bg-blue-50"
                      onClick={() => setExpandido(expandidoAtual ? null : g.id)}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      Histórico
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs gap-1 ml-auto bg-[#00A388] hover:bg-[#008A73]"
                      onClick={() => onSelectGrupo?.(g.numero_grupo)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {selecionado ? 'Selecionado' : 'Selecionar grupo'}
                    </Button>
                  </div>

                  {/* Histórico expansível (estilo explorador de arquivos) */}
                  {expandidoAtual && (
                    <HistoricoExpansivelGrupo
                      assembleias={g._assembleias}
                      mediaLivre={g._mediaLivre3m}
                      mediaLimitado={g._mediaLimitado3m}
                      totalContemplados={g._totalContemplados3m}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
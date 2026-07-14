import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronUp, History, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CATEGORIA_LABELS,
  CATEGORIA_ICONS,
  PRIORIDADE_ORDER,
  calcularMediaPercentual,
  obterUltimasAssembleias,
  construirAssembleiasPorGrupo,
  formatPercent,
  formatCurrency
} from '@/components/utils/gruposConsorcioHelpers';
import HistoricoAssembleiaGrupoPanel from './HistoricoAssembleiaGrupoPanel';

export default function GruposDisponiveisPanel({ empresaId, administradoraId, categoriaBem, credito, grupoSelecionado, onSelectGrupo, lanceClientePercentual }) {
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

  // Dados reais de assembleia vêm das importações (Menu > Consórcio > Resultado de Assembleia),
  // gravadas em HistoricoLanceDetalhe (lances por grupo) + HistoricoLanceGrupo (data da assembleia).
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

    const comMedia = lista.map(g => {
      const grupoNormalizado = String(g.numero_grupo || '').replace(/^0+/, '') || '0';
      const assembleiasGrupo = assembleiasPorGrupo[grupoNormalizado] || [];
      const mediaLivre3m = calcularMediaPercentual(assembleiasGrupo, 3, 'lance_livre_menor_percentual');
      const ultimaAssembleia = obterUltimasAssembleias(assembleiasGrupo, 1)[0] || null;
      return { ...g, _assembleias: assembleiasGrupo, _mediaLivre3m: mediaLivre3m, _ultimaAssembleia: ultimaAssembleia };
    });

    comMedia.sort((a, b) => {
      const prioA = PRIORIDADE_ORDER[a.prioridade_comercial] ?? 1;
      const prioB = PRIORIDADE_ORDER[b.prioridade_comercial] ?? 1;
      if (prioA !== prioB) return prioA - prioB;

      const medA = a._mediaLivre3m ?? -1;
      const medB = b._mediaLivre3m ?? -1;
      if (medA !== medB) return medB - medA;

      return (a.numero_grupo || '').localeCompare(b.numero_grupo || '');
    });

    return comMedia;
  }, [grupos, assembleiasPorGrupo, credito, buscaNumero, prazoMaxFiltro]);

  if (!habilitado) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">🎯 Grupos Disponíveis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Filtrar por número do grupo..." value={buscaNumero} onChange={(e) => setBuscaNumero(e.target.value)} />
          <Input type="number" placeholder="Prazo máximo (meses)" value={prazoMaxFiltro} onChange={(e) => setPrazoMaxFiltro(e.target.value)} />
        </div>

        {loadingGrupos ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : gruposCompativeis.length === 0 ? (
          <p className="text-center text-slate-500 py-6 text-sm">Nenhum grupo compatível encontrado para os critérios informados.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {gruposCompativeis.map(g => {
              const selecionado = grupoSelecionado === g.numero_grupo;
              const expandidoAtual = expandido === g.id;
              const ultimaAssembleia = g._ultimaAssembleia;
              return (
                <div
                  key={g.id}
                  className={cn(
                    'rounded-xl border-2 p-4 transition-all',
                    selecionado ? 'border-[#23BE84] bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-700">
                      {CATEGORIA_ICONS[g.categoria_bem] || '📦'} {CATEGORIA_LABELS[g.categoria_bem] || g.categoria_bem}
                    </p>
                    {selecionado && <span className="text-xs font-bold text-[#23BE84]">✓ Selecionado</span>}
                  </div>
                  <p className="text-lg font-bold text-slate-900 mb-2">Grupo {g.numero_grupo}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                    <div>
                      <p className="text-slate-400">Crédito</p>
                      <p className="font-medium text-slate-700">{formatCurrency(g.credito_minimo)} até {formatCurrency(g.credito_maximo)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Prazo</p>
                      <p className="font-medium text-slate-700">{g.prazo_maximo ? `${g.prazo_maximo} meses` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Participantes</p>
                      <p className="font-medium text-slate-700">{g.qtd_participantes ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Último lance livre</p>
                      <p className="font-medium text-blue-700">{formatPercent(ultimaAssembleia?.lance_livre_menor_percentual)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3 pt-2 border-t">
                    <div>
                      <p className="text-slate-400">Data última assembleia</p>
                      <p className="font-medium text-slate-700">
                        {ultimaAssembleia?.data_assembleia ? new Date(ultimaAssembleia.data_assembleia + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Menor lance limitado</p>
                      <p className="font-medium text-orange-700">{formatPercent(ultimaAssembleia?.lance_limitado_menor_percentual)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Menor lance livre</p>
                      <p className="font-medium text-blue-700">{formatPercent(ultimaAssembleia?.lance_livre_menor_percentual)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Contemplados (última)</p>
                      <p className="font-medium text-amber-700">{ultimaAssembleia?.total_contemplados ?? 0}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => setExpandido(expandidoAtual ? null : g.id)}
                    >
                      <History className="w-3 h-3" />
                      Ver histórico dos últimos 3 meses
                      {expandidoAtual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={cn('h-8 text-xs gap-1', selecionado ? 'bg-[#23BE84] hover:bg-[#1ea873]' : '')}
                      onClick={() => onSelectGrupo?.(g.numero_grupo)}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {selecionado ? 'Selecionado' : 'Selecionar grupo'}
                    </Button>
                  </div>

                  {expandidoAtual && (
                    <HistoricoAssembleiaGrupoPanel assembleias={g._assembleias} lanceClientePercentual={lanceClientePercentual} />
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
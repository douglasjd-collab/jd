import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronDown, ChevronUp, Trophy, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CATEGORIA_LABELS,
  CATEGORIA_ICONS,
  PRIORIDADE_ORDER,
  calcularMediaPercentual,
  formatPercent,
  formatCurrency
} from '@/components/utils/gruposConsorcioHelpers';

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

  const { data: todasAssembleias = [] } = useQuery({
    queryKey: ['assembleias-empresa', empresaId],
    enabled: habilitado,
    queryFn: () => base44.entities.AssembleiaGrupoConsorcio.filter({ empresa_id: empresaId })
  });

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
      const assembleiasGrupo = todasAssembleias.filter(a => a.grupo_consorcio_id === g.id);
      const mediaLivre3m = calcularMediaPercentual(assembleiasGrupo, 3, 'lance_livre_menor_percentual');
      return { ...g, _assembleias: assembleiasGrupo, _mediaLivre3m: mediaLivre3m };
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
  }, [grupos, todasAssembleias, credito, buscaNumero, prazoMaxFiltro]);

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
              return (
                <div
                  key={g.id}
                  className={cn(
                    'rounded-xl border-2 p-4 transition-all cursor-pointer',
                    selecionado ? 'border-[#23BE84] bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                  onClick={() => onSelectGrupo?.(g.numero_grupo)}
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
                      <p className="text-slate-400">Média Lance Livre</p>
                      <p className="font-medium text-blue-700">{formatPercent(g._mediaLivre3m)}</p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandido(expandidoAtual ? null : g.id); }}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                  >
                    {expandidoAtual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Ver Histórico
                  </button>

                  {expandidoAtual && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {g._assembleias.length === 0 ? (
                        <p className="text-xs text-slate-400">Nenhuma assembleia registrada.</p>
                      ) : (
                        g._assembleias
                          .slice()
                          .sort((a, b) => new Date(b.data_assembleia) - new Date(a.data_assembleia))
                          .map(a => (
                            <div key={a.id} className="p-2 bg-slate-50 rounded-lg text-xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="flex items-center gap-1 font-semibold text-slate-700">
                                  <Calendar className="w-3 h-3" /> {new Date(a.data_assembleia + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
                                <span className="flex items-center gap-1 font-bold text-amber-700">
                                  <Trophy className="w-3 h-3" /> {a.total_contemplados || 0}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                {a.lance_livre_menor_percentual != null && (
                                  <p className="text-blue-700">Lance Livre: {formatPercent(a.lance_livre_menor_percentual)} ({a.lance_livre_qtd_contemplados || 0})</p>
                                )}
                                {a.lance_limitado_menor_percentual != null && (
                                  <p className="text-orange-700">Lance Limitado: {formatPercent(a.lance_limitado_menor_percentual)} ({a.lance_limitado_qtd_contemplados || 0})</p>
                                )}
                                {a.lance_fixo_50_qtd_contemplados > 0 && <p className="text-purple-700">Fixo 50%: {a.lance_fixo_50_qtd_contemplados}</p>}
                                {a.lance_fixo_30_qtd_contemplados > 0 && <p className="text-purple-700">Fixo 30%: {a.lance_fixo_30_qtd_contemplados}</p>}
                                {a.sorteio_qtd_contemplados > 0 && <p className="text-slate-600">Sorteio: {a.sorteio_qtd_contemplados}</p>}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
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
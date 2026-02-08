import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, TrendingDown, Calendar, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function HistoricoResultadoAssembleia() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [buscaGrupo, setBuscaGrupo] = useState('');
  const [mesSelecionado, setMesSelecionado] = useState('');
  const [ordenarPorMenor, setOrdenarPorMenor] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);

    if (me.perfil === 'super_admin' || me.perfil === 'master') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' }, '-created_date', 1);
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const { data: todosDetalhes = [], isLoading: loadingDetalhes } = useQuery({
    queryKey: ['historico-detalhes-consolidado', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      return await base44.entities.HistoricoLanceDetalhe.filter({ empresa_id: empresaId });
    }
  });

  const { data: todosResumos = [], isLoading: loadingResumos } = useQuery({
    queryKey: ['historico-resumos-consolidado', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      return await base44.entities.HistoricoLanceResumo.filter({ empresa_id: empresaId });
    }
  });

  const { data: historicos = [] } = useQuery({
    queryKey: ['historico-grupos', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      return await base44.entities.HistoricoLanceGrupo.filter({ empresa_id: empresaId });
    }
  });

  // Processar dados consolidados
  const gruposConsolidados = React.useMemo(() => {
    if (!todosDetalhes.length) return [];

    // Agrupar detalhes por grupo
    const grupos = {};
    
    for (const detalhe of todosDetalhes) {
      // Filtrar por mês se selecionado
      if (mesSelecionado) {
        const historico = historicos.find(h => h.id === detalhe.historico_id);
        if (historico) {
          const dataAssembleia = new Date(historico.assembleia_data);
          const mesAno = `${dataAssembleia.getFullYear()}-${String(dataAssembleia.getMonth() + 1).padStart(2, '0')}`;
          if (mesAno !== mesSelecionado) continue;
        }
      }

      if (!grupos[detalhe.grupo]) {
        grupos[detalhe.grupo] = {
          grupo: detalhe.grupo,
          detalhes: []
        };
      }
      grupos[detalhe.grupo].detalhes.push(detalhe);
    }

    // Calcular resumos a partir dos detalhes (fonte de verdade)
    for (const grupo of Object.values(grupos)) {
      const resumosPorModalidade = {};
      
      for (const detalhe of grupo.detalhes) {
        const modalidade = detalhe.modalidade;
        if (!resumosPorModalidade[modalidade]) {
          resumosPorModalidade[modalidade] = {
            modalidade,
            lances: []
          };
        }
        if (detalhe.lance_percent !== null) {
          resumosPorModalidade[modalidade].lances.push(detalhe.lance_percent);
        }
      }
      
      // Converter para resumos com min/max calculados
      grupo.resumos = Object.values(resumosPorModalidade).map(r => ({
        modalidade: r.modalidade,
        menor_lance_percent: r.lances.length > 0 ? Math.min(...r.lances) : null,
        maior_lance_percent: r.lances.length > 0 ? Math.max(...r.lances) : null,
        qtd_ocorrencias: r.lances.length
      }));
    }

    // Filtrar por busca de grupo
    let gruposFiltrados = Object.values(grupos);
    if (buscaGrupo) {
      gruposFiltrados = gruposFiltrados.filter(g => g.grupo.includes(buscaGrupo));
    }

    // Ordenar por menor lance se ativado
    if (ordenarPorMenor) {
      gruposFiltrados.sort((a, b) => {
        const menorA = Math.min(...a.resumos.map(r => r.menor_lance_percent || 999));
        const menorB = Math.min(...b.resumos.map(r => r.menor_lance_percent || 999));
        return menorA - menorB;
      });
    }

    return gruposFiltrados;
  }, [todosDetalhes, todosResumos, buscaGrupo, mesSelecionado, ordenarPorMenor, historicos]);

  // Lista de meses disponíveis
  const mesesDisponiveis = React.useMemo(() => {
    const meses = new Set();
    for (const historico of historicos) {
      const data = new Date(historico.assembleia_data);
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      meses.add(mesAno);
    }
    return Array.from(meses).sort().reverse();
  }, [historicos]);

  const formatarMes = (mesAno) => {
    if (!mesAno) return '';
    const [ano, mes] = mesAno.split('-');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${meses[parseInt(mes) - 1]} ${ano}`;
  };

  const modalidadeLabel = {
    lance_livre: 'Lance Livre',
    lance_limitado: 'Lance Limitado',
    sorteio: 'Sorteio',
    lance_fixo_15: 'Lance Fixo 15%',
    lance_fixo_30: 'Lance Fixo 30%',
    lance_fixo_50: 'Lance Fixo 50%'
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const isLoading = loadingDetalhes || loadingResumos;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de Resultado de Assembleia"
        subtitle="Consulte lances e contemplações por grupo"
      />

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Filtros de Busca
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Buscar por Grupo</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Digite o número do grupo..."
                  value={buscaGrupo}
                  onChange={(e) => setBuscaGrupo(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label>Mês da Assembleia</Label>
              <select
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Todos os meses</option>
                {mesesDisponiveis.map(mes => (
                  <option key={mes} value={mes}>{formatarMes(mes)}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Ordenação</Label>
              <label className="flex items-center gap-3 h-9 px-3 border border-input rounded-md cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={ordenarPorMenor}
                  onChange={(e) => setOrdenarPorMenor(e.target.checked)}
                  className="w-4 h-4"
                />
                <TrendingDown className="w-4 h-4 text-emerald-600" />
                <span className="text-sm">Menor lance primeiro</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileSpreadsheet className="w-4 h-4" />
            <span>{gruposConsolidados.length} grupos encontrados</span>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Grupos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : gruposConsolidados.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-slate-500">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Nenhum grupo encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {gruposConsolidados.map((grupo) => {
            const totalContemplacoes = grupo.detalhes.length;
            const menorLance = Math.min(...grupo.resumos.map(r => r.menor_lance_percent || 999));
            const maiorLance = Math.max(...grupo.resumos.map(r => r.maior_lance_percent || 0));

            return (
              <Card key={grupo.grupo} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-[#23BE84]" />
                      Grupo {grupo.grupo}
                    </CardTitle>
                    <Badge variant="outline" className="text-base">
                      {totalContemplacoes} contemplações
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Tabela de Detalhes */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">QT.</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Descrição</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Crédito</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Modalidade</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Lance %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.detalhes.map((detalhe, idx) => (
                          <tr key={idx} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm">{detalhe.qt}</td>
                            <td className="px-4 py-3 text-sm font-medium">{detalhe.descricao}</td>
                            <td className="px-4 py-3 text-sm">
                              {detalhe.credito ? `R$ ${detalhe.credito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                {modalidadeLabel[detalhe.modalidade] || detalhe.modalidade}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {detalhe.lance_percent !== null ? (
                                <span className="text-blue-600 font-semibold flex items-center justify-end gap-1">
                                  <TrendingDown className="w-4 h-4" />
                                  {detalhe.lance_percent.toFixed(4)}%
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumo do Grupo */}
                  <div className="mt-3 pt-3 border-t bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Coluna 1: Lances Livre e Limitado */}
                      <div className="space-y-2">
                        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide mb-2">Menor Lance</h3>
                        {(() => {
                          const lanceLivre = grupo.resumos.find(r => r.modalidade === 'lance_livre');
                          const lanceLimitado = grupo.resumos.find(r => r.modalidade === 'lance_limitado');
                          
                          return (
                            <div className="space-y-2">
                              <div className="bg-white rounded p-2 shadow-sm border-l-4 border-emerald-500">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-slate-700">Lance Livre</span>
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-emerald-600">
                                      {lanceLivre?.menor_lance_percent ? `${lanceLivre.menor_lance_percent.toFixed(2)}%` : '-'}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Maior: {lanceLivre?.maior_lance_percent ? `${lanceLivre.maior_lance_percent.toFixed(2)}%` : '-'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-white rounded p-2 shadow-sm border-l-4 border-blue-500">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-slate-700">Lance Limitado</span>
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-blue-600">
                                      {lanceLimitado?.menor_lance_percent ? `${lanceLimitado.menor_lance_percent.toFixed(2)}%` : '-'}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Maior: {lanceLimitado?.maior_lance_percent ? `${lanceLimitado.maior_lance_percent.toFixed(2)}%` : '-'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Coluna 2: Lance Fixo */}
                      <div className="space-y-2">
                        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide mb-2">Lance Fixo - Contemplados</h3>
                        {(() => {
                          const lanceFixo15 = grupo.resumos.find(r => r.modalidade === 'lance_fixo_15');
                          const lanceFixo30 = grupo.resumos.find(r => r.modalidade === 'lance_fixo_30');
                          const lanceFixo50 = grupo.resumos.find(r => r.modalidade === 'lance_fixo_50');
                          
                          return (
                            <div className="space-y-2">
                              <div className="bg-white rounded p-2 shadow-sm border-l-4 border-amber-400">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-slate-700">Fixo 15%</span>
                                  <span className="text-lg font-bold text-amber-600">
                                    {lanceFixo15?.qtd_ocorrencias || 0}
                                  </span>
                                </div>
                              </div>
                              <div className="bg-white rounded p-2 shadow-sm border-l-4 border-orange-500">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-slate-700">Fixo 30%</span>
                                  <span className="text-lg font-bold text-orange-600">
                                    {lanceFixo30?.qtd_ocorrencias || 0}
                                  </span>
                                </div>
                              </div>
                              <div className="bg-white rounded p-2 shadow-sm border-l-4 border-red-500">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-slate-700">Fixo 50%</span>
                                  <span className="text-lg font-bold text-red-600">
                                    {lanceFixo50?.qtd_ocorrencias || 0}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Total de Contemplações */}
                    <div className="mt-3 pt-3 border-t border-indigo-200 text-center">
                      <p className="text-xs text-slate-600 mb-1">Total de Contemplações</p>
                      <p className="text-2xl font-bold text-indigo-900">{totalContemplacoes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
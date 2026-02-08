import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Search, TrendingDown, TrendingUp, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function HistoricoImportacao() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedHistorico, setSelectedHistorico] = useState(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    
    if (me) {
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date',
        1
      );
      if (colabs?.[0]?.empresa_id) {
        setEmpresaId(colabs[0].empresa_id);
      }
    }
  };

  const { data: historicos = [], isLoading } = useQuery({
    queryKey: ['historico-importacao', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      return await base44.entities.HistoricoLanceGrupo.filter(
        { empresa_id: empresaId },
        '-created_date'
      );
    },
    enabled: !!empresaId
  });

  const { data: detalhes = [] } = useQuery({
    queryKey: ['historico-detalhes', selectedHistorico?.id],
    queryFn: async () => {
      if (!selectedHistorico?.id) return [];
      const items = await base44.entities.HistoricoLanceDetalhe.filter(
        { historico_id: selectedHistorico.id },
        'qt'
      );
      return items;
    },
    enabled: !!selectedHistorico?.id
  });

  const handleVerDetalhes = (historico) => {
    setSelectedHistorico(historico);
    setDetalhesOpen(true);
  };

  // Agrupar detalhes por grupo
  const detalhesAgrupados = React.useMemo(() => {
    const grupos = {};
    detalhes.forEach(item => {
      if (!grupos[item.grupo]) {
        grupos[item.grupo] = [];
      }
      grupos[item.grupo].push(item);
    });
    return grupos;
  }, [detalhes]);

  const filteredHistoricos = historicos.filter(h => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      h.arquivo_nome?.toLowerCase().includes(searchLower) ||
      h.assembleia_data?.includes(search) ||
      h.usuario_nome?.toLowerCase().includes(searchLower)
    );
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value || 0);
  };

  const modalidadeLabels = {
    lance_livre: 'Lance Livre',
    lance_limitado: 'Lance Limitado',
    sorteio: 'Sorteio',
    lance_fixo_15: 'Lance Fixo 15%',
    lance_fixo_30: 'Lance Fixo 30%',
    lance_fixo_50: 'Lance Fixo 50%'
  };

  const modalidadeBadge = (modalidade) => {
    const colors = {
      lance_livre: 'bg-blue-100 text-blue-800',
      lance_limitado: 'bg-purple-100 text-purple-800',
      sorteio: 'bg-green-100 text-green-800',
      lance_fixo_15: 'bg-orange-100 text-orange-800',
      lance_fixo_30: 'bg-amber-100 text-amber-800',
      lance_fixo_50: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={colors[modalidade] || 'bg-gray-100 text-gray-800'}>
        {modalidadeLabels[modalidade] || modalidade}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de Importações"
        subtitle="Visualize os resultados das assembleias importadas"
      />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Buscar por arquivo, data ou usuário..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Importações */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-slate-500 mt-4">Carregando histórico...</p>
          </CardContent>
        </Card>
      ) : filteredHistoricos.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">Nenhuma importação encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredHistoricos.map((historico) => (
            <Card key={historico.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      {historico.arquivo_nome}
                    </CardTitle>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>
                          Assembleia: {format(new Date(historico.assembleia_data), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      </div>
                      <div>
                        {historico.total_grupos} grupos • {historico.total_registros} lances
                      </div>
                      <div>
                        Importado por: {historico.usuario_nome}
                      </div>
                      <div>
                        {format(new Date(historico.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleVerDetalhes(historico)}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    Ver Detalhes
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={detalhesOpen} onOpenChange={setDetalhesOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalhes da Importação - {selectedHistorico?.arquivo_nome}
            </DialogTitle>
            <p className="text-sm text-slate-500">
              Assembleia: {selectedHistorico && format(new Date(selectedHistorico.assembleia_data), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {Object.entries(detalhesAgrupados).map(([grupo, items]) => (
              <Card key={grupo}>
                <CardHeader className="bg-slate-50">
                  <CardTitle className="text-base">
                    Grupo {grupo}
                    <span className="ml-4 text-sm font-normal text-slate-600">
                      {items.length} {items.length === 1 ? 'contemplação' : 'contemplações'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-100 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">QT.</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Descrição</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Crédito</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Modalidade</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700">Lance %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm text-slate-600">{item.qt}</td>
                            <td className="px-4 py-3 text-sm font-medium">{item.descricao}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {formatCurrency(item.credito)}
                            </td>
                            <td className="px-4 py-3">
                              {modalidadeBadge(item.modalidade)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                                {item.lance_percent != null && item.lance_percent > 0 ? (
                                  <>
                                    <TrendingDown className="w-4 h-4" />
                                    {item.lance_percent.toFixed(4)}%
                                  </>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumo do Grupo */}
                  <div className="p-4 bg-blue-50 border-t">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-blue-700 font-semibold mb-1">Total de Contemplações</p>
                        <p className="text-2xl font-bold text-blue-900">{items.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-700 font-semibold mb-1">Menor Lance</p>
                        <p className="text-2xl font-bold text-blue-900">
                          {Math.min(...items.filter(i => i.lance_percent > 0).map(i => i.lance_percent)).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-700 font-semibold mb-1">Maior Lance</p>
                        <p className="text-2xl font-bold text-blue-900">
                          {Math.max(...items.map(i => i.lance_percent || 0)).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
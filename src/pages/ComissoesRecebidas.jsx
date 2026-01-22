import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search, DollarSign, FileText, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';
import { formatDateBR, safeParseDate } from '@/components/utils/dateHelpers';

export default function ComissoesRecebidas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mesFilter, setMesFilter] = useState('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [expandedDates, setExpandedDates] = useState({});

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id });
      }
    }
  };

  const { data: recebimentos = [], isLoading } = useQuery({
    queryKey: ['recebimentos-comissao'],
    queryFn: async () => {
      return await base44.entities.RecebimentoComissao.filter({ status_recebimento: 'recebida' });
    },
    enabled: !!user,
  });

  const filtered = recebimentos.filter((r) => {
    if (user?.perfil === 'vendedor' && r.vendedor_id !== user?.id) {
      return false;
    }

    // Filtro por período personalizado tem prioridade
    if (dataInicio || dataFim) {
      if (r.data_recebimento) {
        const dataRec = safeParseDate(r.data_recebimento);
        if (!dataRec) return false;
        const inicio = dataInicio ? safeParseDate(dataInicio) : null;
        const fim = dataFim ? safeParseDate(dataFim) : null;
        if (inicio && dataRec < inicio) return false;
        if (fim && dataRec > fim) return false;
      }
    } else if (mesFilter !== 'todos' && r.data_recebimento) {
      const mes = moment(r.data_recebimento, 'YYYY-MM-DD', true).format('YYYY-MM');
      if (mes !== mesFilter) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return r.vendedor_nome?.toLowerCase().includes(term) || 
             r.cliente_nome?.toLowerCase().includes(term);
    }
    return true;
  });

  // Agrupar por data
  const grouped = filtered.reduce((acc, r) => {
    const data = r.data_recebimento || 'sem-data';
    if (!acc[data]) {
      acc[data] = [];
    }
    acc[data].push(r);
    return acc;
  }, {});

  // Ordenar por data (mais recente primeiro)
  const sortedDates = Object.keys(grouped).sort((a, b) => {
    if (a === 'sem-data') return 1;
    if (b === 'sem-data') return -1;
    return new Date(b) - new Date(a);
  });

  const totalRecebido = filtered.reduce((acc, r) => acc + (r.valor_recebido || 0), 0);

  const mesesDisponiveis = [...new Set(recebimentos.map((r) => 
    r.data_recebimento ? moment(r.data_recebimento, 'YYYY-MM-DD', true).format('YYYY-MM') : null
  ).filter(Boolean))].sort().reverse();

  const toggleDate = (data) => {
    setExpandedDates(prev => ({ ...prev, [data]: !prev[data] }));
  };

  const gerarPdfRelatorio = async (data, itens) => {
    try {
      toast.info('Gerando PDF do relatório...');
      // TODO: Implementar função backend para gerar PDF
      // const resp = await base44.functions.invoke('gerarPdfComissaoRecebida', { 
      //   data, 
      //   itens: itens.map(i => ({ ...i }))
      // });
      // if (resp?.data?.url) window.open(resp.data.url, '_blank');
      toast.success('Funcionalidade em desenvolvimento');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF');
    }
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Comissões Recebidas"
        subtitle="Histórico de comissões pagas"
      />

      {/* Stats */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Total Recebido (Período)</p>
            <p className="text-3xl font-bold text-green-600">
              {totalRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <DollarSign className="w-12 h-12 text-green-600" />
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por vendedor ou cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={mesFilter} onValueChange={(val) => {
              setMesFilter(val);
              if (val !== 'todos') {
                setDataInicio('');
                setDataFim('');
              }
            }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {mesesDisponiveis.map((mes) => (
                  <SelectItem key={mes} value={mes}>
                    {moment(mes).format('MMMM/YYYY')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700 block mb-2">
                Período Personalizado
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => {
                    setDataInicio(e.target.value);
                    if (e.target.value) setMesFilter('todos');
                  }}
                  placeholder="Data Início"
                  className="flex-1"
                />
                <span className="text-slate-500">até</span>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => {
                    setDataFim(e.target.value);
                    if (e.target.value) setMesFilter('todos');
                  }}
                  placeholder="Data Fim"
                  className="flex-1"
                />
              </div>
            </div>
            {(dataInicio || dataFim) && (
              <button
                onClick={() => {
                  setDataInicio('');
                  setDataFim('');
                }}
                className="text-sm text-blue-600 hover:text-blue-700 underline whitespace-nowrap"
              >
                Limpar período
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Relatórios Agrupados */}
      {isLoading ? (
        <Card className="p-8">
          <div className="text-center text-slate-500">Carregando...</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8">
          <div className="text-center text-slate-500">Nenhuma comissão recebida encontrada</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((data) => {
            const itens = grouped[data];
            const totalData = itens.reduce((sum, i) => sum + (i.valor_recebido || 0), 0);
            const totalAPagar = itens.reduce((sum, i) => sum + (i.valor_a_pagar || 0), 0);
            const isExpanded = expandedDates[data];

            return (
              <Card key={data} className="overflow-hidden">
                {/* Header do Relatório */}
                <div className="bg-[#10353C] text-white p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5" />
                      <div>
                        <h3 className="font-bold text-lg">
                          {data === 'sem-data' ? 'Sem data de recebimento' : formatDateBR(data)}
                        </h3>
                        <div className="text-sm text-white/80 flex gap-4 mt-1">
                          <span>{itens.length} recebimento{itens.length !== 1 ? 's' : ''}</span>
                          <span>Total: {totalData.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          <span>A Pagar: {totalAPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => gerarPdfRelatorio(data, itens)}
                      className="bg-white text-[#10353C] hover:bg-slate-100"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleDate(data)}
                      className="text-white hover:bg-white/10"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Tabela de Itens */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Cliente</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Vendedor</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Grupo/Cota</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Parcela</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Valor Recebido</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">% Com.</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">A Pagar</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Administradora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((recebimento) => (
                          <tr key={recebimento.id} className="border-b hover:bg-slate-50">
                            <td className="p-3 text-sm">{recebimento.cliente_nome || '-'}</td>
                            <td className="p-3 text-sm">{recebimento.vendedor_nome || '-'}</td>
                            <td className="p-3 text-sm">
                              {recebimento.grupo && recebimento.cota 
                                ? `${recebimento.grupo}/${recebimento.cota}` 
                                : recebimento.contrato || '-'}
                            </td>
                            <td className="p-3 text-sm">
                              {recebimento.parcela_informada ? `${recebimento.parcela_informada}º` : '-'}
                            </td>
                            <td className="p-3 text-sm font-semibold text-green-600">
                              {(recebimento.valor_recebido || 0).toLocaleString('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              })}
                            </td>
                            <td className="p-3 text-sm">
                              {recebimento.percentual_comissao || 100}%
                            </td>
                            <td className="p-3 text-sm font-semibold text-blue-600">
                              {(recebimento.valor_a_pagar || 0).toLocaleString('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              })}
                            </td>
                            <td className="p-3 text-sm">
                              <Badge variant="outline" className="text-xs">
                                {recebimento.administradora_nome || '-'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
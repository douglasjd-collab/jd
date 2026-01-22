import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Download, Eye, Printer, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import moment from 'moment';
import { formatDateBR } from '@/components/utils/dateHelpers';
import { toast } from 'react-hot-toast';

export default function ComissoesPagas() {
  const [user, setUser] = useState(null);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [expandedDates, setExpandedDates] = useState({});

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
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
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  // Buscar comissões pagas
  const { data: comissoesPagas = [], isLoading: loadingComissoes } = useQuery({
    queryKey: ['comissoes-pagas'],
    queryFn: async () => {
      return await base44.entities.ComissaoAPagar.filter({ status_pagamento: 'paga' });
    },
    enabled: !!user,
  });

  // Buscar vendedores
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => {
      return await base44.entities.Colaborador.filter({ perfil: 'vendedor', status: 'ativo' });
    },
    enabled: !!user,
  });

  // Normalizar data
  const normalizeDate = (date) => {
    if (!date) return null;
    const m = moment(date);
    return m.isValid() ? m.format('YYYY-MM-DD') : null;
  };

  // Filtrar dados
  const dadosFiltrados = comissoesPagas.filter((c) => {
    // Filtro vendedor (somente seus dados se for vendedor)
    if (user?.perfil === 'vendedor' && c.vendedor_id !== user.id) {
      return false;
    }

    // Filtro vendedor por nome
    if (filtroVendedor && !c.vendedor_nome?.toLowerCase().includes(filtroVendedor.toLowerCase())) {
      return false;
    }

    // Filtro por mês
    if (filtroMes !== 'todos' && c.data_pagamento) {
      const mes = moment(c.data_pagamento).format('YYYY-MM');
      if (mes !== filtroMes) return false;
    }

    // Filtro por data customizada
    if (filtroDataInicio && c.data_pagamento) {
      const normalized = normalizeDate(c.data_pagamento);
      if (!normalized || normalized < filtroDataInicio) {
        return false;
      }
    }

    if (filtroDataFim && c.data_pagamento) {
      const normalized = normalizeDate(c.data_pagamento);
      if (!normalized || normalized > filtroDataFim) {
        return false;
      }
    }

    return true;
  });

  // Agrupar por data de pagamento
  const groupedByDate = dadosFiltrados.reduce((acc, c) => {
    const dateKey = c.data_pagamento || 'sem-data';
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(c);
    return acc;
  }, {});

  // Ordenar datas (mais recente primeiro)
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    if (a === 'sem-data') return 1;
    if (b === 'sem-data') return -1;
    return moment(b).valueOf() - moment(a).valueOf();
  });

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const gerarPdfData = async (data, comissoes) => {
    try {
      toast.loading('Gerando PDF...');
      
      const response = await base44.functions.invoke('gerarPdfComissaoPaga', {
        data: data,
        itens: comissoes
      });

      toast.dismiss();

      if (response.data) {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Comissoes_Pagas_${moment(data).format('DD-MM-YYYY')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('PDF gerado com sucesso!');
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Erro ao gerar PDF');
      console.error('Erro ao gerar PDF:', error);
    }
  };

  const mesesDisponiveis = [...new Set(dadosFiltrados
    .filter(c => c.data_pagamento)
    .map(c => moment(c.data_pagamento).format('YYYY-MM'))
  )].sort().reverse();

  if (!user) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Carregando...</p>
        </Card>
      </div>
    );
  }

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!isAdmin && user?.perfil !== 'vendedor') {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito</p>
        </Card>
      </div>
    );
  }

  // Calcular totais
  const totalPago = dadosFiltrados.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Comissões Pagas"
        subtitle="Histórico de pagamentos realizados"
      />

      {/* Resumo */}
      <Card className="p-6 mb-6 bg-gradient-to-r from-green-50 to-emerald-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 mb-1">Total de Comissões Pagas</p>
            <p className="text-3xl font-bold text-green-600">
              {totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-slate-500 mt-1">{dadosFiltrados.length} pagamento(s)</p>
          </div>
          <FileText className="w-12 h-12 text-green-600 opacity-20" />
        </div>
      </Card>

      {/* Filtros */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>Vendedor</Label>
            <Input
              placeholder="Filtrar por vendedor"
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
            />
          </div>
          <div>
            <Label>Mês</Label>
            <select
              className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm"
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
            >
              <option value="todos">Todos os meses</option>
              {mesesDisponiveis.map((mes) => (
                <option key={mes} value={mes}>
                  {moment(mes).format('MMMM/YYYY')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Data Início (customizada)</Label>
            <Input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
            />
          </div>
          <div>
            <Label>Data Fim (customizada)</Label>
            <Input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Lista de Pagamentos Agrupados por Data */}
      {loadingComissoes ? (
        <Card className="p-8">
          <div className="text-center text-slate-500">Carregando...</div>
        </Card>
      ) : sortedDates.length === 0 ? (
        <Card className="p-8">
          <div className="text-center text-slate-500">Nenhuma comissão paga encontrada</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const comissoes = groupedByDate[date];
            const totalData = comissoes.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);
            const isExpanded = expandedDates[date];
            const dataFormatada = date === 'sem-data' ? 'Sem Data de Pagamento' : formatDateBR(date);

            return (
              <Card key={date} className="overflow-hidden">
                {/* Header da Data */}
                <div 
                  className="bg-[#10353C] text-white p-4 cursor-pointer hover:bg-[#0d2a30] transition-colors"
                  onClick={() => toggleDate(date)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-lg">{dataFormatada}</h3>
                        <Badge className="bg-white/20 text-white border-0">
                          {comissoes.length} pagamento(s)
                        </Badge>
                      </div>
                      <div className="text-sm text-white/80 mt-1">
                        Total: <span className="font-semibold">
                          {totalData.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {date !== 'sem-data' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            gerarPdfData(date, comissoes);
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar PDF
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
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
                </div>

                {/* Tabela de Comissões */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Cliente</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Vendedor</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Administradora</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Grupo/Cota</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Parcela</th>
                          <th className="text-right p-3 font-semibold text-slate-700 text-sm">Valor Recebido</th>
                          <th className="text-center p-3 font-semibold text-slate-700 text-sm">% Com.</th>
                          <th className="text-right p-3 font-semibold text-slate-700 text-sm">Valor Pago</th>
                          <th className="text-left p-3 font-semibold text-slate-700 text-sm">Forma Pgto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comissoes.map((c) => (
                          <tr key={c.id} className="border-b hover:bg-slate-50">
                            <td className="p-3 text-sm">{c.cliente_nome || '-'}</td>
                            <td className="p-3 text-sm">{c.vendedor_nome || '-'}</td>
                            <td className="p-3 text-sm">{c.administradora_nome || '-'}</td>
                            <td className="p-3 text-sm">
                              {c.grupo && c.cota ? `${c.grupo}/${c.cota}` : c.contrato || '-'}
                            </td>
                            <td className="p-3 text-sm">
                              {c.parcela_numero ? `${c.parcela_numero}º` : '-'}
                            </td>
                            <td className="p-3 text-sm text-right font-semibold text-green-600">
                              {(c.valor_recebido || 0).toLocaleString('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              })}
                            </td>
                            <td className="p-3 text-sm text-center">
                              {c.percentual_comissao || 100}%
                            </td>
                            <td className="p-3 text-sm text-right font-bold text-blue-600">
                              {(c.valor_a_pagar || 0).toLocaleString('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              })}
                            </td>
                            <td className="p-3 text-sm">{c.forma_pagamento || '-'}</td>
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
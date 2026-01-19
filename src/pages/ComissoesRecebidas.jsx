import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search, DollarSign } from 'lucide-react';
import moment from 'moment';
import { formatDateBR, safeParseDate } from '@/utils/dateHelpers';

export default function ComissoesRecebidas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mesFilter, setMesFilter] = useState('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

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

  const totalRecebido = filtered.reduce((acc, r) => acc + (r.valor_recebido || 0), 0);

  const mesesDisponiveis = [...new Set(recebimentos.map((r) => 
    r.data_recebimento ? moment(r.data_recebimento, 'YYYY-MM-DD', true).format('YYYY-MM') : null
  ).filter(Boolean))].sort().reverse();

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

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-slate-700">Data Recebimento</th>
                <th className="text-left p-4 font-semibold text-slate-700">Cliente</th>
                <th className="text-left p-4 font-semibold text-slate-700">Vendedor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Grupo/Cota</th>
                <th className="text-left p-4 font-semibold text-slate-700">Parcela</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor Recebido</th>
                <th className="text-left p-4 font-semibold text-slate-700">Administradora</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Nenhuma comissão recebida encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((recebimento) => {
                  return (
                    <tr key={recebimento.id} className="border-b hover:bg-slate-50">
                      <td className="p-4">
                        {formatDateBR(recebimento.data_recebimento)}
                      </td>
                      <td className="p-4">{recebimento.cliente_nome || '-'}</td>
                      <td className="p-4">{recebimento.vendedor_nome || '-'}</td>
                      <td className="p-4">
                        {recebimento.grupo && recebimento.cota ? `${recebimento.grupo}/${recebimento.cota}` : recebimento.contrato || '-'}
                      </td>
                      <td className="p-4">
                        {recebimento.parcela_informada ? `${recebimento.parcela_informada}º` : '-'}
                      </td>
                      <td className="p-4 font-semibold text-green-600">
                        {(recebimento.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">{recebimento.administradora_nome || '-'}</Badge>
                      </td>
                    </tr>
                  );
                })
              )}
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
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

export default function ComissoesRecebidas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mesFilter, setMesFilter] = useState('todos');

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

  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-recebidas'],
    queryFn: async () => {
      const filter = { tipo_comissao: 'parcela', tipo: 'pagar', status: 'paga' };
      return await base44.entities.Comissao.filter(filter);
    },
    enabled: !!user,
  });

  const filtered = comissoes.filter((c) => {
    if (user?.perfil === 'vendedor' && c.usuario_id !== user?.id) {
      return false;
    }

    if (mesFilter !== 'todos' && c.data_pagamento) {
      const mes = moment(c.data_pagamento).format('YYYY-MM');
      if (mes !== mesFilter) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return c.usuario_nome?.toLowerCase().includes(term);
    }
    return true;
  });

  const totalRecebido = filtered.reduce((acc, c) => acc + (c.valor || 0), 0);

  const mesesDisponiveis = [...new Set(comissoes.map((c) => 
    c.data_pagamento ? moment(c.data_pagamento).format('YYYY-MM') : null
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
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por vendedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={mesFilter} onValueChange={setMesFilter}>
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
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-slate-700">Vendedor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Data Pagamento</th>
                <th className="text-left p-4 font-semibold text-slate-700">Forma Pagamento</th>
                <th className="text-left p-4 font-semibold text-slate-700">Observação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Nenhuma comissão recebida encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((comissao) => (
                  <tr key={comissao.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">{comissao.usuario_nome}</td>
                    <td className="p-4 font-semibold text-green-600">
                      {(comissao.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4">
                      {comissao.data_pagamento ? moment(comissao.data_pagamento).format('DD/MM/YYYY') : '-'}
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">{comissao.forma_pagamento || '-'}</Badge>
                    </td>
                    <td className="p-4 text-sm text-slate-600">{comissao.observacoes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
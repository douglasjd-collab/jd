import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import StatsCard from '@/components/ui/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  CheckCircle,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Comissoes() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes'],
    queryFn: () => base44.entities.Comissao.list('-created_date'),
  });

  const { data: parcelas = [] } = useQuery({
    queryKey: ['parcelas'],
    queryFn: () => base44.entities.Parcela.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Comissao.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes'] });
      toast.success('Comissão atualizada!');
    },
  });

  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'admin';
  const isGerente = currentUser?.perfil === 'gerente';

  // Filtrar por perfil
  const filteredByRole = comissoes.filter(c => {
    if (isAdmin) return true;
    return c.usuario_id === currentUser?.id;
  });

  const filteredComissoes = filteredByRole.filter(c => {
    const matchSearch = c.usuario_nome?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'todos' || c.status === filterStatus;
    const matchTipo = filterTipo === 'todos' || c.tipo === filterTipo;
    return matchSearch && matchStatus && matchTipo;
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Cálculos
  const comissoesReceber = filteredByRole
    .filter(c => c.tipo === 'receber')
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const comissoesReceberPrevistas = filteredByRole
    .filter(c => c.tipo === 'receber' && c.status === 'prevista')
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const comissoesPagar = filteredByRole
    .filter(c => c.tipo === 'pagar')
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const comissoesPagarPendentes = filteredByRole
    .filter(c => c.tipo === 'pagar' && c.status !== 'paga')
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const marcarComoPaga = async (comissao) => {
    updateMutation.mutate({
      id: comissao.id,
      data: {
        status: 'paga',
        data_pagamento: format(new Date(), 'yyyy-MM-dd')
      }
    });
  };

  const columns = [
    {
      header: 'Usuário',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.usuario_nome}</p>
          <p className="text-sm text-slate-500 capitalize">{row.usuario_perfil}</p>
        </div>
      )
    },
    {
      header: 'Tipo',
      cell: (row) => <StatusBadge status={row.tipo} />
    },
    {
      header: 'Valor',
      cell: (row) => (
        <span className={`font-semibold ${row.tipo === 'receber' ? 'text-emerald-600' : 'text-amber-600'}`}>
          {formatCurrency(row.valor)}
        </span>
      )
    },
    {
      header: 'Percentual',
      cell: (row) => row.percentual ? `${row.percentual}%` : '-'
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: 'Data Pagamento',
      cell: (row) => row.data_pagamento ? format(new Date(row.data_pagamento), 'dd/MM/yyyy') : '-'
    },
    ...(isAdmin ? [{
      header: '',
      className: 'w-32',
      cell: (row) => row.tipo === 'pagar' && row.status !== 'paga' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => marcarComoPaga(row)}
          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
        >
          <CheckCircle className="w-4 h-4 mr-1" />
          Pagar
        </Button>
      )
    }] : [])
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões"
        subtitle="Gerencie comissões a receber e a pagar"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total a Receber"
          value={formatCurrency(comissoesReceber)}
          subtitle={`${formatCurrency(comissoesReceberPrevistas)} previsto`}
          icon={TrendingUp}
          color="green"
        />
        <StatsCard
          title="Total a Pagar"
          value={formatCurrency(comissoesPagar)}
          subtitle={`${formatCurrency(comissoesPagarPendentes)} pendente`}
          icon={TrendingDown}
          color="yellow"
        />
        <StatsCard
          title="Comissões Pagas"
          value={filteredByRole.filter(c => c.status === 'paga').length}
          icon={CheckCircle}
          color="blue"
        />
        <StatsCard
          title="Saldo"
          value={formatCurrency(comissoesReceber - comissoesPagar)}
          icon={Wallet}
          color="purple"
        />
      </div>

      {/* Filters */}
      <Card className="p-4 border-0 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por usuário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="receber">A Receber</SelectItem>
              <SelectItem value="pagar">A Pagar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Status</SelectItem>
              <SelectItem value="prevista">Prevista</SelectItem>
              <SelectItem value="confirmada">Confirmada</SelectItem>
              <SelectItem value="paga">Paga</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredComissoes}
        isLoading={isLoading}
        emptyMessage="Nenhuma comissão encontrada"
      />
    </div>
  );
}
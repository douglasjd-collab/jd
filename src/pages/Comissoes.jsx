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

  // Filtrar por perfil - apenas comissões recebidas
  const filteredByRole = comissoes.filter(c => {
    if (isAdmin) return c.tipo === 'receber'; // Admin vê todas as comissões a receber
    return c.usuario_id === currentUser?.id && c.tipo === 'receber'; // Vendedor vê apenas suas comissões
  });

  const filteredComissoes = filteredByRole.filter(c => {
    const matchSearch = c.usuario_nome?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'todos' || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Cálculos - apenas comissões recebidas
  const comissoesTotal = filteredByRole
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const comissoesPrevistas = filteredByRole
    .filter(c => c.status === 'prevista')
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const comissoesConfirmadas = filteredByRole
    .filter(c => c.status === 'confirmada')
    .reduce((acc, c) => acc + (c.valor || 0), 0);



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
      header: 'Valor',
      cell: (row) => (
        <span className="font-semibold text-emerald-600">
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
          title="Total Recebido"
          value={formatCurrency(comissoesTotal)}
          icon={TrendingUp}
          color="green"
        />
        <StatsCard
          title="Comissões Previstas"
          value={formatCurrency(comissoesPrevistas)}
          icon={Wallet}
          color="yellow"
        />
        <StatsCard
          title="Comissões Confirmadas"
          value={formatCurrency(comissoesConfirmadas)}
          icon={CheckCircle}
          color="blue"
        />
        {!isAdmin && (
          <StatsCard
            title="Saldo Disponível"
            value={formatCurrency(currentUser?.saldo_comissao)}
            subtitle="Para saque"
            icon={Wallet}
            color="purple"
          />
        )}
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
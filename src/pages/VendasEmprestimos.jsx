import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, MoreHorizontal, Pencil, Trash2, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PropostaEditModal from '@/components/forms/PropostaEditModal';
import ImportarPropostasLoteModal from '@/components/emprestimos/ImportarPropostasLoteModal';

export default function VendasEmprestimos() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterBanco, setFilterBanco] = useState('todos');
  const [searchNome, setSearchNome] = useState('');
  const [searchCpf, setSearchCpf] = useState('');
  const [searchBanco, setSearchBanco] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [propostaToDelete, setPropostaToDelete] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [propostaToEdit, setPropostaToEdit] = useState(null);
  const [importarLoteOpen, setImportarLoteOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();

      if (me.role === 'super_admin') {
        setCurrentUser({
          ...me,
          auth_id: me.id,
          empresa_id: null,
          perfil: 'super_admin',
        });
        return;
      }

      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date'
      );

      if (!colabs || colabs.length === 0) {
        setCurrentUser({
          ...me,
          auth_id: me.id,
          empresa_id: null,
          perfil: 'vendedor',
        });
        return;
      }

      const colab = colabs[0];

      setCurrentUser({
        ...me,
        auth_id: me.id,
        empresa_id: colab.empresa_id || null,
        perfil: colab.perfil || 'vendedor',
        colaborador_id: colab.id,
      });
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ['vendas-emprestimos'],
    queryFn: () => base44.entities.Proposta.filter({ produto: ['emprestimo'] }),
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos-emprestimos'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-emprestimos'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const getClienteCpf = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.cpf || cliente?.pj_cnpj || '-';
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Proposta.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      setDeleteDialogOpen(false);
      setPropostaToDelete(null);
      toast.success('Venda excluída com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao excluir venda');
    }
  });

  const handleEdit = (proposta) => {
    setPropostaToEdit(proposta);
    setEditModalOpen(true);
  };

  const handleDelete = (proposta) => {
    setPropostaToDelete(proposta);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (propostaToDelete) {
      deleteMutation.mutate(propostaToDelete.id);
    }
  };

  const isAdmin = ['master', 'super_admin', 'admin'].includes(currentUser?.perfil);

  // Filtrar por perfil
  const filteredByRole = propostas.filter(p => {
    if (isAdmin) return true;
    return p.vendedor_id === currentUser?.colaborador_id;
  });

  // Filtrar por critérios
  const filteredPropostas = filteredByRole.filter(p => {
    const matchNome = !searchNome || p.cliente_nome?.toLowerCase().includes(searchNome.toLowerCase());
    const matchCpf = !searchCpf || getClienteCpf(p.cliente_id)?.includes(searchCpf);
    const matchBanco = !searchBanco || p.administradora_nome?.toLowerCase().includes(searchBanco.toLowerCase());
    const matchTipo = filterTipo === 'todos' || p.emprestimo_tipo === filterTipo;
    return matchNome && matchCpf && matchBanco && matchTipo;
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getTipoPrestamo = (proposta) => {
    if (proposta.emprestimo_tipo) {
      const tipos = {
        'NOVO': 'Novo',
        'REFINANCIAMENTO': 'Refinanciamento',
        'PORTABILIDADE_PURA': 'Portabilidade',
        'REFIN_PORTABILIDADE': 'Refin + Portabilidade'
      };
      return tipos[proposta.emprestimo_tipo] || proposta.emprestimo_tipo;
    }
    return 'Pessoal';
  };

  const columns = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.cliente_nome || '-'}</p>
          {row.cliente_id && <p className="text-xs text-slate-500">{getClienteCpf(row.cliente_id)}</p>}
        </div>
      )
    },
    {
      header: 'Tipo',
      cell: (row) => (
        <span className="px-2.5 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-800">
          {getTipoPrestamo(row)}
        </span>
      )
    },
    {
      header: 'Banco',
      cell: (row) => row.administradora_nome || '-'
    },
    {
      header: 'Valor',
      cell: (row) => formatCurrency(row.valor_credito)
    },
    {
      header: 'Vendedor',
      cell: (row) => row.vendedor_nome || '-'
    },
    {
      header: 'Data',
      cell: (row) => {
        if (!row.data_venda) return '-';
        const date = new Date(row.data_venda + 'T12:00:00');
        return format(date, 'dd/MM/yyyy');
      }
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: '',
      className: 'w-12',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem 
                onClick={() => handleDelete(row)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23BE84]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Propostas de Empréstimos"
        subtitle={`${filteredPropostas.length} propostas`}
        actionLabel="Nova Venda"
        actionIcon={Plus}
        onAction={() => navigate(createPageUrl('NovaVendaConsignado'))}
      >
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setImportarLoteOpen(true)}
        >
          <Upload className="w-4 h-4" />
          Importar em Lote
        </Button>
      </PageHeader>

      {/* Tabs */}
      <Tabs value={filterTipo} onValueChange={setFilterTipo} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="consignado">Consignados</TabsTrigger>
          <TabsTrigger value="pessoal">Pessoais</TabsTrigger>
        </TabsList>

        <TabsContent value="consignado" className="space-y-4">
          {/* Filters */}
          <Card className="p-4 border-0 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente ou contrato..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterBanco} onValueChange={setFilterBanco}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Banco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Bancos</SelectItem>
                  {bancos.map(banco => (
                    <SelectItem key={banco.id} value={banco.nome}>
                      {banco.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Status</SelectItem>
                  <SelectItem value="ativa">Ativas</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="cancelada">Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Table */}
          <DataTable
            columns={columns}
            data={filteredPropostas}
            isLoading={isLoading}
            emptyMessage="Nenhuma venda encontrada"
          />
        </TabsContent>

        <TabsContent value="pessoal" className="space-y-4">
          {/* Filters */}
          <Card className="p-4 border-0 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente ou contrato..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterBanco} onValueChange={setFilterBanco}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Banco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Bancos</SelectItem>
                  {bancos.map(banco => (
                    <SelectItem key={banco.id} value={banco.nome}>
                      {banco.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Status</SelectItem>
                  <SelectItem value="ativa">Ativas</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="cancelada">Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Table */}
          <DataTable
            columns={columns}
            data={filteredPropostas}
            isLoading={isLoading}
            emptyMessage="Nenhuma venda encontrada"
          />
        </TabsContent>
      </Tabs>

      <ImportarPropostasLoteModal
        open={importarLoteOpen}
        onOpenChange={setImportarLoteOpen}
      />

      {/* Edit Modal */}
      <PropostaEditModal
        proposta={propostaToEdit}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta venda?
              {propostaToDelete && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="font-medium text-slate-900">{propostaToDelete.cliente_nome}</p>
                  <p className="text-sm text-slate-600">{getTipoPrestamo(propostaToDelete)}</p>
                </div>
              )}
              <p className="mt-3 text-sm text-red-600">
                Esta ação não pode ser desfeita.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
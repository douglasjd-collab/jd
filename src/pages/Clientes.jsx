import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import ClienteForm from '@/components/forms/ClienteForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Clientes() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Cliente.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setFormOpen(false);
      toast.success('Cliente cadastrado com sucesso!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cliente.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setFormOpen(false);
      setSelectedCliente(null);
      toast.success('Cliente atualizado com sucesso!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Cliente.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setDeleteId(null);
      toast.success('Cliente excluído com sucesso!');
    },
  });

  const handleSubmit = async (data) => {
    // Adicionar empresa_id e vendedor do usuário logado
    const user = await base44.auth.me();
    const clienteData = {
      ...data,
      empresa_id: user.empresa_id,
      vendedor_id: user.id,
      vendedor_nome: user.full_name
    };

    if (selectedCliente) {
      updateMutation.mutate({ id: selectedCliente.id, data: clienteData });
    } else {
      createMutation.mutate(clienteData);
    }
  };

  const handleEdit = (cliente) => {
    setSelectedCliente(cliente);
    setFormOpen(true);
  };

  const filteredClientes = clientes.filter(c => 
    c.nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: 'Nome',
      accessor: 'nome',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.nome}</p>
          <p className="text-sm text-slate-500">{row.cpf}</p>
        </div>
      )
    },
    {
      header: 'Contato',
      cell: (row) => (
        <div>
          <p className="text-slate-900">{row.telefone || '-'}</p>
          <p className="text-sm text-slate-500">{row.email || '-'}</p>
        </div>
      )
    },
    {
      header: 'Cadastro',
      cell: (row) => row.created_date ? format(new Date(row.created_date), 'dd/MM/yyyy') : '-'
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
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`ClienteDetalhes?id=${row.id}`)}>
                <Eye className="w-4 h-4 mr-2" />
                Ver detalhes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEdit(row)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setDeleteId(row.id)}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} clientes cadastrados`}
        actionLabel="Novo Cliente"
        onAction={() => {
          setSelectedCliente(null);
          setFormOpen(true);
        }}
      />

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nome, CPF ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredClientes}
        isLoading={isLoading}
        emptyMessage="Nenhum cliente encontrado"
      />

      {/* Form Modal */}
      <ClienteForm
        open={formOpen}
        onOpenChange={setFormOpen}
        cliente={selectedCliente}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteId)}
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
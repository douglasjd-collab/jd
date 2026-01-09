import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import AdministradoraForm from '@/components/forms/AdministradoraForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, Pencil, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
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

export default function Administradoras() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: administradoras = [], isLoading } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Administradora.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradoras'] });
      setFormOpen(false);
      toast.success('Administradora cadastrada com sucesso!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Administradora.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradoras'] });
      setFormOpen(false);
      setSelectedAdmin(null);
      toast.success('Administradora atualizada com sucesso!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Administradora.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradoras'] });
      setDeleteId(null);
      toast.success('Administradora excluída com sucesso!');
    },
  });

  const handleSubmit = (data) => {
    if (selectedAdmin) {
      updateMutation.mutate({ id: selectedAdmin.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (admin) => {
    setSelectedAdmin(admin);
    setFormOpen(true);
  };

  const filteredAdmins = administradoras.filter(a => 
    a.razao_social?.toLowerCase().includes(search.toLowerCase()) ||
    a.nome_fantasia?.toLowerCase().includes(search.toLowerCase()) ||
    a.cnpj?.includes(search)
  );

  const columns = [
    {
      header: 'Administradora',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#1e3a5f]" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.nome_fantasia || row.razao_social}</p>
            <p className="text-sm text-slate-500">{row.razao_social}</p>
          </div>
        </div>
      )
    },
    {
      header: 'CNPJ',
      cell: (row) => row.cnpj || '-'
    },
    {
      header: 'Tipo Empresa',
      cell: (row) => (
        <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium inline-block">
          {row.tipoEmpresa || '-'}
        </div>
      )
    },
    {
      header: 'Contato',
      cell: (row) => row.contato || '-'
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
        title="Administradoras"
        subtitle={`${administradoras.length} administradoras cadastradas`}
        actionLabel="Nova Administradora"
        onAction={() => {
          setSelectedAdmin(null);
          setFormOpen(true);
        }}
      />

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nome ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredAdmins}
        isLoading={isLoading}
        emptyMessage="Nenhuma administradora encontrada"
      />

      {/* Form Modal */}
      <AdministradoraForm
        open={formOpen}
        onOpenChange={setFormOpen}
        administradora={selectedAdmin}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir administradora?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A administradora será removida permanentemente.
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
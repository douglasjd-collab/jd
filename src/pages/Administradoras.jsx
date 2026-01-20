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
  const [adminParaEditar, setAdminParaEditar] = useState(null);
  const [adminParaExcluir, setAdminParaExcluir] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: administradoras = [], isLoading, error } = useQuery({
    queryKey: ['administradoras'],
    queryFn: async () => {
      try {
        return await base44.entities.Administradora.list('-created_date');
      } catch (error) {
        console.error('Erro ao carregar administradoras:', error);
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Administradora.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradoras'] });
      setOpenForm(false);
      setAdminParaEditar(null);
      toast.success('Administradora cadastrada com sucesso!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Administradora.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradoras'] });
      setOpenForm(false);
      setAdminParaEditar(null);
      toast.success('Administradora atualizada com sucesso!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Administradora.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradoras'] });
      setOpenDelete(false);
      setAdminParaExcluir(null);
      toast.success('Administradora excluída com sucesso!');
    },
  });

  const handleSubmit = async (data) => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      
      if (!isAuth) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      // Buscar o Colaborador do usuário atual
      const colabs = await base44.entities.Colaborador.filter(
        { status: 'ativo' },
        '-created_date',
        1
      );
      
      if (!colabs || colabs.length === 0) {
        toast.error('Colaborador não encontrado. Verifique seu cadastro.');
        return;
      }

      const colab = colabs[0];
      let empresa_id = colab.empresa_id;

      // Para super_admin e master sem empresa_id, buscar primeira empresa ativa
      if (!empresa_id && ['master', 'super_admin'].includes(colab.perfil)) {
        const empresas = await base44.entities.Empresa.filter({ status: 'ativa' }, '-created_date', 1);
        if (empresas.length > 0) {
          empresa_id = empresas[0].id;
        }
      }

      // Garantir que empresa_id seja válido
      if (!empresa_id || typeof empresa_id !== 'string') {
        toast.error('Empresa não identificada. Verifique se existe uma empresa cadastrada.');
        return;
      }

      const adminData = {
        ...data,
        empresa_id
      };

      if (adminParaEditar) {
        updateMutation.mutate({ id: adminParaEditar.id, data: adminData });
      } else {
        createMutation.mutate(adminData);
      }
    } catch (error) {
      console.error('Erro ao salvar administradora:', error);
      toast.error('Erro ao salvar administradora: ' + error.message);
    }
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
          <DropdownMenuContent align="end" className="z-50">
            <DropdownMenuItem 
              onSelect={(e) => {
                e.preventDefault();
                setAdminParaEditar(row);
                setOpenForm(true);
              }}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem 
              onSelect={(e) => {
                e.preventDefault();
                setAdminParaExcluir(row);
                setOpenDelete(true);
              }}
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

  // Verificar permissão
  const [currentUser, setCurrentUser] = React.useState(null);
  const [checkingPermission, setCheckingPermission] = React.useState(true);
  
  React.useEffect(() => {
    const checkUser = async () => {
      try {
        const me = await base44.auth.me();
        if (me) {
          setCurrentUser({ perfil: me.role });
        }
      } catch (error) {
        console.error('Erro ao verificar usuário:', error);
      } finally {
        setCheckingPermission(false);
      }
    };
    checkUser();
  }, []);

  const hasAccess = !currentUser || ['master', 'super_admin', 'admin'].includes(currentUser.perfil);

  if (!checkingPermission && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
          <Building2 className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">Acesso Negado</h2>
        <p className="text-slate-500 text-center max-w-md">
          Você não tem permissão para acessar esta página. Entre em contato com o administrador.
        </p>
      </div>
    );
  }

  if (checkingPermission) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-500">Carregando...</p>
      </div>
    );
  }

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
        onOpenChange={(isOpen) => {
          setFormOpen(isOpen);
          if (!isOpen) {
            setSelectedAdmin(null);
          }
        }}
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
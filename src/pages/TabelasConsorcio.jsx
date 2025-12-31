import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Search, MoreHorizontal, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
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

export default function TabelasConsorcio() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedTabela, setSelectedTabela] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm();

  const { data: tabelas = [], isLoading } = useQuery({
    queryKey: ['tabelas-consorcio'],
    queryFn: () => base44.entities.TabelaConsorcio.list('-created_date'),
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TabelaConsorcio.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-consorcio'] });
      setFormOpen(false);
      reset();
      toast.success('Tabela cadastrada com sucesso!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TabelaConsorcio.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-consorcio'] });
      setFormOpen(false);
      setSelectedTabela(null);
      reset();
      toast.success('Tabela atualizada com sucesso!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TabelaConsorcio.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-consorcio'] });
      setDeleteId(null);
      toast.success('Tabela excluída com sucesso!');
    },
  });

  const openForm = (tabela = null) => {
    if (tabela) {
      Object.keys(tabela).forEach(key => setValue(key, tabela[key]));
      setSelectedTabela(tabela);
    } else {
      reset({
        nomeTabela: '',
        administradora_id: '',
        tipoEmpresa: '',
        status: 'ativa'
      });
      setSelectedTabela(null);
    }
    setFormOpen(true);
  };

  const onSubmit = async (data) => {
    // Validações
    if (!data.nomeTabela || !data.administradora_id) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const admin = administradoras.find(a => a.id === data.administradora_id);
    const submitData = {
      ...data,
      administradora_nome: admin?.nome_fantasia || admin?.razao_social || '',
      tipoEmpresa: admin?.tipoEmpresa || ''
    };

    // HU 08 - Auditoria
    try {
      const user = await base44.auth.me();
      const logData = {
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: selectedTabela ? 'Edição de tabela de consórcio' : 'Criação de tabela de consórcio',
        entidade: 'TabelaConsorcio',
        entidade_id: selectedTabela?.id || 'novo',
        dados_anteriores: selectedTabela ? JSON.stringify(selectedTabela) : null,
        dados_novos: JSON.stringify(submitData),
        tipo: selectedTabela ? 'edicao' : 'criacao'
      };
      await base44.entities.LogAuditoria.create(logData);
    } catch (e) {
      console.log('Erro ao criar log:', e);
    }

    if (selectedTabela) {
      updateMutation.mutate({ id: selectedTabela.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const getAdminNome = (id) => {
    const admin = administradoras.find(a => a.id === id);
    return admin?.nome_fantasia || admin?.razao_social || '-';
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const filteredTabelas = tabelas.filter(t => 
    t.nomeTabela?.toLowerCase().includes(search.toLowerCase()) ||
    getAdminNome(t.administradora_id).toLowerCase().includes(search.toLowerCase()) ||
    t.tipoEmpresa?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: 'Tabela',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.nomeTabela}</p>
          <p className="text-sm text-slate-500">{getAdminNome(row.administradora_id)}</p>
        </div>
      )
    },
    {
      header: 'Tipo Empresa',
      cell: (row) => (
        <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium inline-block">
          {row.tipoEmpresa}
        </div>
      )
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
            <DropdownMenuItem onClick={() => openForm(row)}>
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
        title="Tabelas de Consórcio"
        subtitle={`${tabelas.length} tabelas cadastradas`}
        actionLabel="Nova Tabela"
        onAction={() => openForm()}
      />

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar tabela..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredTabelas}
        isLoading={isLoading}
        emptyMessage="Nenhuma tabela encontrada"
      />

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedTabela ? 'Editar Tabela' : 'Nova Tabela'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="nomeTabela">Nome da Tabela *</Label>
                <Input
                  id="nomeTabela"
                  {...register('nomeTabela', { required: true })}
                  placeholder="Ex: Tabela Imóvel Premium"
                />
                {errors.nomeTabela && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
              </div>
              
              <div>
                <Label>Administradora *</Label>
                <Select
                  value={watch('administradora_id') || ''}
                  onValueChange={(value) => setValue('administradora_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a administradora" />
                  </SelectTrigger>
                  <SelectContent>
                    {administradoras.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome_fantasia || a.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.administradora_id && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
              </div>
              
              <div>
                <Label>Tipo de Empresa (da Administradora)</Label>
                <Input
                  value={watch('tipoEmpresa') || 'Selecione a administradora'}
                  disabled
                  className="bg-slate-100"
                />
                <p className="text-xs text-slate-500 mt-1">
                  O tipo é herdado automaticamente da administradora selecionada
                </p>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-900">
                  <strong>Tipo de Empresa:</strong> Define o fator de cálculo da comissão na venda.
                </p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1 ml-4 list-disc">
                  <li>MEI: percentualComissão = taxaAdministração × 0.25</li>
                  <li>ME: percentualComissão = taxaAdministração × 0.30</li>
                  <li>LTDA: percentualComissão = taxaAdministração × 0.30</li>
                </ul>
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={watch('status') || 'ativa'}
                  onValueChange={(value) => setValue('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {selectedTabela ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tabela?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
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
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
        nome: '',
        administradora_id: '',
        valor_carta: '',
        percentual_comissao: '',
        comissao_total: '',
        comissao_por_parcela: '',
        num_parcelas_comissao: 12,
        percentual_faturamento: 0,
        comissao_faturamento: 0,
        status: 'ativa'
      });
      setSelectedTabela(null);
    }
    setFormOpen(true);
  };

  const onSubmit = async (data) => {
    // Calcular valores
    const valorCarta = parseFloat(data.valor_carta) || 0;
    const percentual = parseFloat(data.percentual_comissao) || 0;
    const numParcelas = parseInt(data.num_parcelas_comissao) || 12;
    const percentualFaturamento = parseFloat(data.percentual_faturamento) || 0;
    
    const comissaoTotal = (valorCarta * percentual) / 100;
    const comissaoPorParcela = comissaoTotal / numParcelas;
    const comissaoFaturamento = (valorCarta * percentualFaturamento) / 100;
    
    // HU 04 - Validação: soma das parcelas não pode ser maior que comissão total
    const somaParcelas = comissaoPorParcela * numParcelas;
    if (somaParcelas > comissaoTotal) {
      toast.error('A soma das parcelas não pode ser maior que a comissão total!');
      return;
    }

    const submitData = {
      ...data,
      valor_carta: valorCarta,
      percentual_comissao: percentual,
      comissao_total: comissaoTotal,
      comissao_por_parcela: comissaoPorParcela,
      num_parcelas_comissao: numParcelas,
      percentual_faturamento: percentualFaturamento,
      comissao_faturamento: comissaoFaturamento
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
    t.nome?.toLowerCase().includes(search.toLowerCase()) ||
    getAdminNome(t.administradora_id).toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: 'Tabela',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.nome}</p>
          <p className="text-sm text-slate-500">{getAdminNome(row.administradora_id)}</p>
        </div>
      )
    },
    {
      header: 'Valor da Carta',
      cell: (row) => formatCurrency(row.valor_carta)
    },
    {
      header: 'Comissão',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.percentual_comissao}%</p>
          <p className="text-sm text-slate-500">{formatCurrency(row.comissao_total)}</p>
        </div>
      )
    },
    {
      header: 'Por Parcela',
      cell: (row) => (
        <div>
          <p className="font-medium">{formatCurrency(row.comissao_por_parcela)}</p>
          <p className="text-sm text-slate-500">{row.num_parcelas_comissao}x</p>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="nome">Nome da Tabela *</Label>
                <Input
                  id="nome"
                  {...register('nome', { required: true })}
                  placeholder="Ex: Tabela Imóvel 120 meses"
                />
              </div>
              
              <div className="col-span-2">
                <Label>Administradora *</Label>
                <Select
                  value={watch('administradora_id') || ''}
                  onValueChange={(value) => setValue('administradora_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {administradoras.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome_fantasia || a.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="valor_carta">Valor da Carta (R$) *</Label>
                <Input
                  id="valor_carta"
                  type="number"
                  step="0.01"
                  {...register('valor_carta', { required: true })}
                  placeholder="0,00"
                />
              </div>
              
              <div>
                <Label htmlFor="percentual_comissao">Percentual Comissão (%) *</Label>
                <Input
                  id="percentual_comissao"
                  type="number"
                  step="0.01"
                  {...register('percentual_comissao', { required: true })}
                  placeholder="0,00"
                />
              </div>
              
              <div>
                <Label htmlFor="num_parcelas_comissao">Nº Parcelas Comissão</Label>
                <Input
                  id="num_parcelas_comissao"
                  type="number"
                  {...register('num_parcelas_comissao')}
                  placeholder="12"
                />
              </div>

              <div>
                <Label htmlFor="percentual_faturamento">% Comissão Faturamento</Label>
                <Input
                  id="percentual_faturamento"
                  type="number"
                  step="0.01"
                  {...register('percentual_faturamento')}
                  placeholder="0,00"
                />
              </div>
              
              <div className="col-span-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-sm font-semibold text-blue-900 mb-3">Resumo da Comissão</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-600">Comissão Total:</p>
                    <p className="font-bold text-slate-900">
                      {formatCurrency((parseFloat(watch('valor_carta')) || 0) * (parseFloat(watch('percentual_comissao')) || 0) / 100)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">Por Parcela ({watch('num_parcelas_comissao') || 12}x):</p>
                    <p className="font-bold text-slate-900">
                      {formatCurrency(((parseFloat(watch('valor_carta')) || 0) * (parseFloat(watch('percentual_comissao')) || 0) / 100) / (parseInt(watch('num_parcelas_comissao')) || 12))}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">Faturamento:</p>
                    <p className="font-bold text-emerald-600">
                      {formatCurrency((parseFloat(watch('valor_carta')) || 0) * (parseFloat(watch('percentual_faturamento')) || 0) / 100)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">Soma Parcelas:</p>
                    <p className={`font-bold ${
                      (((parseFloat(watch('valor_carta')) || 0) * (parseFloat(watch('percentual_comissao')) || 0) / 100) / (parseInt(watch('num_parcelas_comissao')) || 12)) * (parseInt(watch('num_parcelas_comissao')) || 12) > ((parseFloat(watch('valor_carta')) || 0) * (parseFloat(watch('percentual_comissao')) || 0) / 100) 
                      ? 'text-red-600' 
                      : 'text-slate-900'
                    }`}>
                      {formatCurrency((((parseFloat(watch('valor_carta')) || 0) * (parseFloat(watch('percentual_comissao')) || 0) / 100) / (parseInt(watch('num_parcelas_comissao')) || 12)) * (parseInt(watch('num_parcelas_comissao')) || 12))}
                    </p>
                  </div>
                </div>
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
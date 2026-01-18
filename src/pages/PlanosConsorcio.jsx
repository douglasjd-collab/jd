import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import ImportarPlanosCSV from '@/components/planos/ImportarPlanosCSV';
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
import { Search, MoreHorizontal, Pencil, Trash2, Loader2, Zap, Plus, Upload, ChevronDown, ShoppingCart } from 'lucide-react';
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

export default function PlanosConsorcio() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPlano, setSelectedPlano] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [selectedPlanoId, setSelectedPlanoId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const { register, handleSubmit, setValue, watch, reset } = useForm();

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ['planos-consorcio'],
    queryFn: () => base44.entities.PlanoConsorcio.list('-created_date'),
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PlanoConsorcio.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
      setFormOpen(false);
      reset();
      toast.success('Plano cadastrado com sucesso!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PlanoConsorcio.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
      setFormOpen(false);
      setSelectedPlano(null);
      reset();
      toast.success('Plano atualizado com sucesso!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PlanoConsorcio.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
      setDeleteId(null);
      toast.success('Plano excluído com sucesso!');
    },
  });

  const openForm = (plano = null) => {
    if (plano) {
      Object.keys(plano).forEach(key => setValue(key, plano[key]));
      setSelectedPlano(plano);
    } else {
      reset({
        nome: '',
        administradora_id: '',
        grupo: '',
        prazo: '',
        valor_carta: '',
        status: 'ativo'
      });
      setSelectedPlano(null);
    }
    setFormOpen(true);
  };

  const onSubmit = (data) => {
    const submitData = {
      ...data,
      prazo: parseInt(data.prazo) || 0,
      valor_carta: parseFloat(data.valor_carta) || 0
    };

    if (selectedPlano) {
      updateMutation.mutate({ id: selectedPlano.id, data: submitData });
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

  const handleSyncPlanos = async () => {
    setSyncLoading(true);
    try {
      const response = await base44.functions.invoke('syncPlanosCanopus', {
        empresa_id: user?.empresa_id
      });
      
      toast.success(`Sincronização concluída: ${response.data.lidos} lidos, ${response.data.criados} criados, ${response.data.atualizados} atualizados`);
      queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
    } catch (error) {
      console.error('Erro de sincronização:', error);
      toast.error('Erro ao sincronizar: ' + (error.response?.data?.error || error.message));
    } finally {
      setSyncLoading(false);
    }
  };

  const filteredPlanos = planos.filter(p => 
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.grupo?.toLowerCase().includes(search.toLowerCase()) ||
    getAdminNome(p.administradora_id).toLowerCase().includes(search.toLowerCase())
  );

  // Agrupar planos por nome
  const groupedPlanos = filteredPlanos.reduce((acc, plano) => {
    const key = plano.nome || `Grupo ${plano.grupo}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(plano);
    return acc;
  }, {});

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const renderGroupedTable = () => (
    <div className="border rounded-lg overflow-hidden">
      {Object.entries(groupedPlanos).map(([groupName, items]) => {
        const isExpanded = expandedGroups[groupName];
        const firstItem = items[0];

        return (
          <div key={groupName}>
            {/* Header/Summary Row */}
            <div className="border-b bg-slate-50 hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => toggleGroup(groupName)}>
                <button className="flex-shrink-0">
                  <ChevronDown 
                    className={`w-5 h-5 transition-transform text-slate-600 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{groupName}</p>
                  <p className="text-sm text-slate-500">{getAdminNome(firstItem?.administradora_id)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{firstItem?.grupo || '-'}</p>
                  <p className="text-xs text-slate-500">{items.length} plano(s)</p>
                </div>
                <div className="text-right min-w-[120px]">
                  <p className="text-sm font-medium">{formatCurrency(firstItem?.valor_carta)}</p>
                </div>
                <div className="text-right min-w-[80px]">
                  <StatusBadge status={firstItem?.status} />
                </div>
                <div className="w-12" />
              </div>
            </div>

            {/* Expanded Items */}
            {isExpanded && (
              <div className="bg-white divide-y">
                {items.map((item) => {
                  const isSelected = selectedPlanoId === item.id;
                  return (
                    <div key={item.id} className={`p-4 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-4">
                        <input
                          type="radio"
                          name="plano-selection"
                          value={item.id}
                          checked={isSelected}
                          onChange={() => setSelectedPlanoId(item.id)}
                          className="w-5 h-5 cursor-pointer accent-blue-600"
                        />
                        <div className="flex-1">
                          <p className="text-sm text-slate-600">{item.prazo} meses</p>
                          {item.taxa_adm && <p className="text-xs text-blue-600 font-medium">Taxa ADM: {item.taxa_adm}%</p>}
                          <p className="text-xs text-slate-500 mt-1">Parcela: {formatCurrency((item.valor_carta || 0) / (item.prazo || 1))}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-600">{item.grupo || '-'}</p>
                        </div>
                        <div className="text-right min-w-[120px]">
                          <p className="text-sm">{formatCurrency(item.valor_carta)}</p>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="w-12">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openForm(item)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setDeleteId(item.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      
                      {/* Selected Plan Details */}
                      {isSelected && (
                        <div className="mt-4 p-3 bg-white border border-blue-200 rounded-lg flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Taxa de ADM: <span className="text-blue-600">{item.taxa_adm ? `${item.taxa_adm}%` : 'Sem taxa'}</span></p>
                            <p className="text-xs text-slate-500">Cód. Grupo: {item.grupo} • Parcela: {formatCurrency((item.valor_carta || 0) / (item.prazo || 1))}</p>
                          </div>
                          <Button
                            onClick={() => {
                              // Aqui você pode redirecionar para criar uma venda ou abrir modal
                              console.log('Iniciar nova venda com plano:', item);
                            }}
                            className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-2"
                          >
                            <ShoppingCart className="w-4 h-4" />
                            Nova Venda
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Planos de Consórcio</h1>
                  <p className="text-slate-500 mt-1">{planos.length} planos cadastrados</p>
                </div>
                <div className="flex flex-col gap-3">
                   <Button 
                    onClick={() => openForm()}
                    className="bg-[#23BE84] hover:bg-[#1da570]"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Plano
                  </Button>
                  <Button
                    onClick={() => setImportOpen(true)}
                    variant="outline"
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Importar CSV
                  </Button>
                  <Button
                    onClick={async () => {
                      setSyncLoading(true);
                      try {
                        await base44.functions.invoke('aplicarTaxasAdmAutomoveisConsorcio');
                        toast.success('Taxas de ADM aplicadas com sucesso!');
                        queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
                      } catch (error) {
                        toast.error('Erro ao aplicar taxas');
                      } finally {
                        setSyncLoading(false);
                      }
                    }}
                    disabled={syncLoading}
                    className="bg-purple-600 hover:bg-purple-700 gap-2"
                  >
                    {syncLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    Aplicar Taxas ADM
                  </Button>
                  <Button
                    onClick={handleSyncPlanos}
                    disabled={syncLoading}
                    className="bg-blue-600 hover:bg-blue-700 gap-2"
                  >
                    {syncLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    Sincronizar com Canopus
                  </Button>
                </div>
              </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar plano..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="border rounded-lg p-8 text-center text-slate-500">
          Carregando planos...
        </div>
      ) : Object.keys(groupedPlanos).length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-slate-500">
          Nenhum plano encontrado
        </div>
      ) : (
        renderGroupedTable()
      )}

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedPlano ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="nome">Nome do Plano</Label>
                <Input
                  id="nome"
                  {...register('nome')}
                  placeholder="Ex: Plano Imóvel Premium"
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
                <Label htmlFor="grupo">Grupo *</Label>
                <Input
                  id="grupo"
                  {...register('grupo', { required: true })}
                  placeholder="Ex: 1234"
                />
              </div>
              
              <div>
                <Label htmlFor="prazo">Prazo (meses) *</Label>
                <Input
                  id="prazo"
                  type="number"
                  {...register('prazo', { required: true })}
                  placeholder="120"
                />
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
                <Label htmlFor="tipo_bem">Tipo de Bem</Label>
                <Select
                  value={watch('tipo_bem') || ''}
                  onValueChange={(value) => setValue('tipo_bem', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automovel">Automóvel</SelectItem>
                    <SelectItem value="imovel">Imóvel</SelectItem>
                    <SelectItem value="motocicleta">Motocicleta</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="bens_moveis">Bens Móveis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="taxa_adm">Taxa de ADM (%)</Label>
                <Input
                  id="taxa_adm"
                  type="number"
                  step="0.1"
                  {...register('taxa_adm')}
                  placeholder="0,00"
                />
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={watch('status') || 'ativo'}
                  onValueChange={(value) => setValue('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
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
                {selectedPlano ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
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

      {/* Import CSV Modal */}
      <ImportarPlanosCSV 
        open={importOpen} 
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
          }
        }}
      />
    </div>
  );
}
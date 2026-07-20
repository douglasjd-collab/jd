import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import ImportarPlanosCSV from '@/components/planos/ImportarPlanosCSV';
import ImportacaoPlanosPrint from '@/components/planos/ImportacaoPlanosPrint';
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
import { Search, MoreHorizontal, Pencil, Trash2, Loader2, Zap, Plus, Upload, ChevronDown, ShoppingCart, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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

export default function PlanosConsorcio() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPlano, setSelectedPlano] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [deleteGroupName, setDeleteGroupName] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [modalGroupName, setModalGroupName] = useState(null);
  const [selectedModalPlano, setSelectedModalPlano] = useState(null);
  const [importPrintOpen, setImportPrintOpen] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
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

  // deleteId pode ser um id único (string) ou um array de ids (grupo)
  const deleteMutation = useMutation({
    mutationFn: async (ids) => {
      const idArray = Array.isArray(ids) ? ids : [ids];
      await Promise.all(idArray.map(id => base44.entities.PlanoConsorcio.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
      setDeleteId(null);
      setDeleteGroupName(null);
      toast.success('Plano(s) excluído(s) com sucesso!');
    },
  });

  const handleExcluirGrupo = (groupName, items, e) => {
    e.stopPropagation();
    setDeleteGroupName(groupName);
    setDeleteId(items.map(i => i.id));
  };

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

  const modalItems = modalGroupName ? [...(groupedPlanos[modalGroupName] || [])].sort((a, b) => b.prazo - a.prazo) : [];
  const firstModalItem = modalItems[0];

  const renderGroupedTable = () => (
    <div className="border rounded-lg overflow-hidden divide-y">
      {Object.entries(groupedPlanos).map(([groupName, items]) => {
        const firstItem = items[0];

        return (
          <div 
            key={groupName}
            className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
            onClick={() => setModalGroupName(groupName)}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900">{groupName} {formatCurrency(firstItem?.valor_carta)}</p>
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
            <div className="flex justify-end min-w-[40px]">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleExcluirGrupo(groupName, items, e)}
                title="Excluir todos os planos deste grupo"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
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
                    onClick={() => setImportPrintOpen(true)}
                    className="bg-purple-600 hover:bg-purple-700 gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    Importar com Print
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
      <AlertDialog open={!!deleteId} onOpenChange={() => { setDeleteId(null); setDeleteGroupName(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteGroupName ? (
                <>
                  Tem certeza que deseja excluir o plano <strong>{deleteGroupName}</strong> e todas as suas <strong>{Array.isArray(deleteId) ? deleteId.length : 1} variação(ões)</strong>?
                  <br /><br />
                  Esta ação não pode ser desfeita.
                </>
              ) : (
                'Esta ação não pode ser desfeita.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
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

      {/* Import Print Modal */}
      <Dialog open={importPrintOpen} onOpenChange={setImportPrintOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Planos com Print</DialogTitle>
          </DialogHeader>
          <ImportacaoPlanosPrint onSuccess={() => {
            setImportPrintOpen(false);
            queryClient.invalidateQueries({ queryKey: ['planos-consorcio'] });
          }} />
        </DialogContent>
      </Dialog>

      {/* Plans Detail Modal */}
      <Dialog open={!!modalGroupName} onOpenChange={() => {
        setModalGroupName(null);
        setSelectedModalPlano(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modalGroupName}</DialogTitle>
          </DialogHeader>
          
          {/* Header Info */}
          <div className="border-b pb-4 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(firstModalItem?.valor_carta)}</p>
                <p className="text-sm text-slate-600 mt-1">{getAdminNome(firstModalItem?.administradora_id)}</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <p className="font-medium">{firstModalItem?.grupo} - GRUPO {firstModalItem?.grupo} PARTICIPANTES</p>
                <p className="text-xs mt-1">114 - LINEAR</p>
              </div>
            </div>
          </div>

          {/* Plans List */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {modalItems.map((item) => (
              <div 
                key={item.id} 
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedModalPlano?.id === item.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'
                }`}
                onClick={() => setSelectedModalPlano(item)}
              >
                <input
                  type="radio"
                  name="modal-plano"
                  checked={selectedModalPlano?.id === item.id}
                  onChange={() => setSelectedModalPlano(item)}
                  className="w-4 h-4 cursor-pointer accent-blue-600"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    Plano de {item.prazo} meses de {formatCurrency((item.valor_carta || 0) / (item.prazo || 1))} | Grupo: {item.grupo}
                  </p>
                </div>
                {selectedModalPlano?.id === item.id && (
                  <div className="text-right text-sm">
                    <p className="font-medium text-slate-900">Taxa ADM:</p>
                    <p className="text-blue-600 font-semibold">{item.taxa_adm ? `${item.taxa_adm}%` : 'Sem taxa'}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Details when selected */}
          {selectedModalPlano && (
            <div className="border-t pt-4 mt-4 space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm text-slate-600">
                  <span className="font-medium">Taxa de ADM:</span> {selectedModalPlano.taxa_adm ? `${selectedModalPlano.taxa_adm}%` : 'Sem taxa'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2"
                  onClick={() => {
                    const planoData = {
                      nome: selectedModalPlano.nome,
                      administradora_id: selectedModalPlano.administradora_id,
                      grupo: selectedModalPlano.grupo,
                      prazo: selectedModalPlano.prazo,
                      valor_carta: selectedModalPlano.valor_carta,
                      tipo_bem: selectedModalPlano.tipo_bem,
                      taxa_adm: selectedModalPlano.taxa_adm,
                      status: 'ativo'
                    };
                    Object.keys(planoData).forEach(key => setValue(key, planoData[key]));
                    setSelectedPlano(null);
                    setModalGroupName(null);
                    setSelectedModalPlano(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Duplicar
                </Button>
                <Button 
                  className="flex-1 bg-[#23BE84] hover:bg-[#1da570] gap-2"
                  onClick={async () => {
                    if (!selectedModalPlano) return;
                    setBuyLoading(true);
                    try {
                      // Buscar ou criar tabela de consórcio
                      const administradora_id = selectedModalPlano.administradora_id;
                      const tabelas = await base44.entities.TabelaConsorcio.filter({
                        administradora_id,
                        ativo: true
                      });
                      
                      let tabela_id = tabelas.length > 0 ? tabelas[0].id : null;
                      
                      if (!tabela_id) {
                        // Criar tabela automaticamente
                        const adminNome = getAdminNome(administradora_id);
                        const newTabela = await base44.entities.TabelaConsorcio.create({
                          administradora_id,
                          administradora_nome: adminNome,
                          nome: `Tabela ${adminNome}`,
                          tipo_bem: selectedModalPlano.tipo_bem || 'automovel',
                          prazo: selectedModalPlano.prazo,
                          taxa_adm: selectedModalPlano.taxa_adm || 0,
                          valor_minimo: 0,
                          valor_maximo: selectedModalPlano.valor_carta,
                          ativo: true
                        });
                        tabela_id = newTabela.id;
                      }
                      
                      // Navegar para nova venda com parâmetros
                      const params = new URLSearchParams({
                        plano_id: selectedModalPlano.id,
                        tabela_id,
                        administradora_id,
                        administradora_nome: getAdminNome(administradora_id),
                        valor_credito: selectedModalPlano.valor_carta,
                        prazo: selectedModalPlano.prazo,
                        taxa_adm: selectedModalPlano.taxa_adm || 0,
                        tipo_bem: selectedModalPlano.tipo_bem || 'automovel',
                        grupo: selectedModalPlano.grupo
                      });
                      
                      navigate(createPageUrl(`NovaVendaConsignado?${params.toString()}`));
                    } catch (error) {
                      console.error('Erro ao preparar compra:', error);
                      toast.error('Erro ao preparar a compra');
                    } finally {
                      setBuyLoading(false);
                    }
                  }}
                  disabled={buyLoading}
                >
                  {buyLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <ShoppingCart className="w-4 h-4" />
                  Comprar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
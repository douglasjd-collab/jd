import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

const coresDisponiveis = [
  { nome: 'Azul', valor: '#3b82f6' },
  { nome: 'Verde', valor: '#10b981' },
  { nome: 'Amarelo', valor: '#f59e0b' },
  { nome: 'Vermelho', valor: '#ef4444' },
  { nome: 'Roxo', valor: '#8b5cf6' },
  { nome: 'Rosa', valor: '#ec4899' },
  { nome: 'Cinza', valor: '#6b7280' },
  { nome: 'Laranja', valor: '#f97316' },
];

export default function ConfiguracaoFunil() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEtapa, setSelectedEtapa] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    ordem: '',
    cor: '#3b82f6',
    tipo: 'aberta',
    requer_cliente: false,
    requer_documentos: false,
    status: 'ativa'
  });

  const queryClient = useQueryClient();

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const { data: etapas = [], isLoading } = useQuery({
    queryKey: ['etapas-funil', currentUser?.empresa_id],
    enabled: !!currentUser,
    queryFn: async () => {
      const isMaster = currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin';
      
      if (isMaster) {
        // Master vê todas as etapas
        return base44.entities.EtapaFunil.list('ordem');
      } else {
        // Outros usuários veem apenas da sua empresa
        return base44.entities.EtapaFunil.filter({ 
          empresa_id: currentUser?.empresa_id 
        }, 'ordem');
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      console.log('CREATE - DATA:', data);
      return base44.entities.EtapaFunil.create({
        ...data,
        empresa_id: currentUser?.empresa_id,
        status: 'ativa',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setFormOpen(false);
      resetForm();
      toast.success('Etapa criada!');
    },
    onError: (error) => {
      console.error('CREATE MUTATION ERROR:', error);
      toast.error(error?.message || 'Erro ao criar etapa');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      console.log('UPDATE - ID:', id, 'DATA:', data);
      const etapaAtual = etapas.find(e => e.id === id);
      
      return base44.entities.EtapaFunil.update(id, {
        ...data,
        empresa_id: etapaAtual?.empresa_id || currentUser?.empresa_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setFormOpen(false);
      setSelectedEtapa(null);
      resetForm();
      toast.success('Etapa atualizada!');
    },
    onError: (error) => {
      console.error('UPDATE MUTATION ERROR:', error);
      toast.error(error?.message || 'Erro ao atualizar etapa');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EtapaFunil.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setDeleteId(null);
      toast.success('Etapa excluída!');
    },
  });

  const reordenarMutation = useMutation({
    mutationFn: async ({ id, novaOrdem }) => {
      await base44.entities.EtapaFunil.update(id, { ordem: novaOrdem });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      toast.success('Ordem atualizada!');
    },
  });

  const resetForm = () => {
    setFormData({
      nome: '',
      ordem: '',
      cor: '#3b82f6',
      tipo: 'aberta',
      requer_cliente: false,
      requer_documentos: false,
      status: 'ativa'
    });
  };

  const handleSubmit = () => {
    if (!formData.nome) {
      toast.error('Informe o nome da etapa');
      return;
    }

    const data = {
      ...formData,
      ordem: parseInt(formData.ordem) || etapas.length + 1
    };

    if (selectedEtapa) {
      updateMutation.mutate({ id: selectedEtapa.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleMoverEtapa = (etapaId, direcao) => {
    const etapa = etapas.find(e => e.id === etapaId);
    if (!etapa) return;

    const novaOrdem = direcao === 'cima' ? etapa.ordem - 1 : etapa.ordem + 1;
    if (novaOrdem < 1 || novaOrdem > etapas.length) return;

    // Trocar ordem com a etapa adjacente
    const etapaAdjacente = etapas.find(e => e.ordem === novaOrdem);
    if (etapaAdjacente) {
      reordenarMutation.mutate({ id: etapaAdjacente.id, novaOrdem: etapa.ordem });
    }
    reordenarMutation.mutate({ id: etapaId, novaOrdem });
  };

  const columns = [
    {
      header: 'Ordem',
      className: 'w-20',
      cell: (row) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleMoverEtapa(row.id, 'cima')}
            disabled={row.ordem === 1}
          >
            <ArrowUp className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleMoverEtapa(row.id, 'baixo')}
            disabled={row.ordem === etapas.length}
          >
            <ArrowDown className="w-3 h-3" />
          </Button>
        </div>
      )
    },
    {
      header: 'Etapa',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: row.cor }} />
          <span className="font-medium">{row.nome}</span>
        </div>
      )
    },
    {
      header: 'Tipo',
      cell: (row) => {
        const tipos = {
          aberta: { label: 'Aberta', color: 'bg-blue-100 text-blue-700' },
          ganho: { label: 'Ganho', color: 'bg-green-100 text-green-700' },
          perdida: { label: 'Perdida', color: 'bg-red-100 text-red-700' }
        };
        const config = tipos[row.tipo];
        return <StatusBadge status={row.tipo} className={config?.color} />;
      }
    },
    {
      header: 'Regras',
      cell: (row) => (
        <div className="text-xs text-slate-600">
          {row.requer_cliente && <div>• Requer cliente</div>}
          {row.requer_documentos && <div>• Requer documentos</div>}
          {!row.requer_cliente && !row.requer_documentos && <div className="text-slate-400">Nenhuma</div>}
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
            <DropdownMenuItem onClick={() => {
              setSelectedEtapa(row);
              setFormData({
                nome: row.nome,
                ordem: row.ordem.toString(),
                cor: row.cor,
                tipo: row.tipo,
                requer_cliente: row.requer_cliente || false,
                requer_documentos: row.requer_documentos || false,
                status: row.status
              });
              setFormOpen(true);
            }}>
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
        title="Configuração do Funil"
        subtitle="Gerencie as etapas do funil de vendas"
        actionLabel="Nova Etapa"
        onAction={() => {
          setSelectedEtapa(null);
          resetForm();
          setFormOpen(true);
        }}
        backTo="FunilVendas"
      />

      <DataTable
        columns={columns}
        data={etapas}
        isLoading={isLoading}
        emptyMessage="Nenhuma etapa configurada"
      />

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedEtapa ? 'Editar Etapa' : 'Nova Etapa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome da Etapa *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Lead recebido"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ordem">Ordem</Label>
                <Input
                  id="ordem"
                  type="number"
                  value={formData.ordem}
                  onChange={(e) => setFormData({ ...formData, ordem: e.target.value })}
                  placeholder={`${etapas.length + 1}`}
                />
              </div>

              <div>
                <Label>Cor</Label>
                <Select
                  value={formData.cor}
                  onValueChange={(value) => setFormData({ ...formData, cor: value })}
                >
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: formData.cor }} />
                      <span>{coresDisponiveis.find(c => c.valor === formData.cor)?.nome}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {coresDisponiveis.map((cor) => (
                      <SelectItem key={cor.valor} value={cor.valor}>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: cor.valor }} />
                          {cor.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="ganho">Ganho (conversão)</SelectItem>
                    <SelectItem value="perdida">Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
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

            <div className="space-y-3 border rounded-lg p-4">
              <h4 className="font-medium text-sm text-slate-900">Regras de Movimentação</h4>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="requer_cliente" className="cursor-pointer">
                  Requer cliente vinculado
                </Label>
                <Switch
                  id="requer_cliente"
                  checked={formData.requer_cliente}
                  onCheckedChange={(checked) => setFormData({ ...formData, requer_cliente: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="requer_documentos" className="cursor-pointer">
                  Requer documentos
                </Label>
                <Switch
                  id="requer_documentos"
                  checked={formData.requer_documentos}
                  onCheckedChange={(checked) => setFormData({ ...formData, requer_documentos: checked })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {selectedEtapa ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As oportunidades nesta etapa não serão excluídas.
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
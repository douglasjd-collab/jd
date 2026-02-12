import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Loader2, Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Convenios() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'INSS'
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
        if (empresas.length > 0) setEmpresaId(empresas[0].id);
      } else {
        const colabs = await base44.entities.Colaborador.filter({ 
          user_id: me.id, 
          status: 'ativo' 
        });
        if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
      }
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  const { data: convenios = [], isLoading } = useQuery({
    queryKey: ['convenios', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Convenio.filter({ empresa_id: empresaId }, 'nome')
  });

  const criarMutation = useMutation({
    mutationFn: async (dados) => {
      return await base44.entities.Convenio.create({
        empresa_id: empresaId,
        nome: dados.nome,
        tipo: dados.tipo,
        ativo: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convenios', empresaId] });
      toast.success('Convênio cadastrado com sucesso!');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar: ' + error.message);
    }
  });

  const editarMutation = useMutation({
    mutationFn: async ({ id, dados }) => {
      return await base44.entities.Convenio.update(id, {
        nome: dados.nome,
        tipo: dados.tipo
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convenios', empresaId] });
      toast.success('Convênio atualizado!');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  });

  const deletarMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Convenio.update(id, { ativo: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convenios', empresaId] });
      toast.success('Convênio removido!');
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error('Erro ao remover: ' + error.message);
      setDeleteId(null);
    }
  });

  const resetForm = () => {
    setFormData({
      nome: '',
      tipo: 'INSS'
    });
    setEditando(null);
  };

  const handleNovo = () => {
    resetForm();
    setShowModal(true);
  };

  const handleEditar = (convenio) => {
    setEditando(convenio);
    setFormData({
      nome: convenio.nome,
      tipo: convenio.tipo
    });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editando) {
      editarMutation.mutate({ id: editando.id, dados: formData });
    } else {
      criarMutation.mutate(formData);
    }
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const conveniosAtivos = convenios.filter(c => c.ativo);

  const tipoLabels = {
    'INSS': 'INSS',
    'GOVERNO_ESTADUAL': 'Governo Estadual',
    'GOVERNO_MUNICIPAL': 'Governo Municipal',
    'PRIVADO': 'Privado'
  };

  const tipoColors = {
    'INSS': 'bg-blue-100 text-blue-800',
    'GOVERNO_ESTADUAL': 'bg-green-100 text-green-800',
    'GOVERNO_MUNICIPAL': 'bg-purple-100 text-purple-800',
    'PRIVADO': 'bg-amber-100 text-amber-800'
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Convênios"
        subtitle="Gerencie os convênios disponíveis para empréstimos"
        actionLabel="Novo Convênio"
        onAction={handleNovo}
        actionIcon={Plus}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : conveniosAtivos.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Nenhum convênio cadastrado
          </h3>
          <p className="text-slate-600 mb-6">
            Comece cadastrando seu primeiro convênio
          </p>
          <Button onClick={handleNovo}>
            <Plus className="w-4 h-4 mr-2" />
            Cadastrar Convênio
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {conveniosAtivos.map((convenio) => (
            <Card key={convenio.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-slate-900 mb-2">
                    {convenio.nome}
                  </h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tipoColors[convenio.tipo]}`}>
                    {tipoLabels[convenio.tipo]}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditar(convenio)}
                  className="flex-1"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteId(convenio.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Convênio' : 'Novo Convênio'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome do Convênio *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: INSS, Governo de PE..."
                required
              />
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData({ ...formData, tipo: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INSS">INSS</SelectItem>
                  <SelectItem value="GOVERNO_ESTADUAL">Governo Estadual</SelectItem>
                  <SelectItem value="GOVERNO_MUNICIPAL">Governo Municipal</SelectItem>
                  <SelectItem value="PRIVADO">Privado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={criarMutation.isPending || editarMutation.isPending}
              >
                {(criarMutation.isPending || editarMutation.isPending) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este convênio?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletarMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
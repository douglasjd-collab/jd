import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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

export default function StatusPropostas() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [statusEditando, setStatusEditando] = useState(null);
  const [statusExcluir, setStatusExcluir] = useState(null);
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    cor: 'blue',
    ordem: 0
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);

    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const { data: statusList = [], isLoading } = useQuery({
    queryKey: ['status-propostas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.StatusProposta.filter({ empresa_id: empresaId, ativo: true }, 'ordem')
  });

  const criarStatusMutation = useMutation({
    mutationFn: (dados) => base44.entities.StatusProposta.create({
      empresa_id: empresaId,
      ...dados,
      ativo: true
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-propostas'] });
      toast.success('Status criado com sucesso!');
      fecharModal();
    },
    onError: () => toast.error('Erro ao criar status')
  });

  const atualizarStatusMutation = useMutation({
    mutationFn: ({ id, dados }) => base44.entities.StatusProposta.update(id, dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-propostas'] });
      toast.success('Status atualizado com sucesso!');
      fecharModal();
    },
    onError: () => toast.error('Erro ao atualizar status')
  });

  const excluirStatusMutation = useMutation({
    mutationFn: (id) => base44.entities.StatusProposta.update(id, { ativo: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-propostas'] });
      toast.success('Status excluído com sucesso!');
      setStatusExcluir(null);
    },
    onError: () => toast.error('Erro ao excluir status')
  });

  const abrirModal = (status = null) => {
    if (status) {
      setStatusEditando(status);
      setFormData({
        codigo: status.codigo,
        nome: status.nome,
        cor: status.cor,
        ordem: status.ordem || 0
      });
    } else {
      setStatusEditando(null);
      setFormData({
        codigo: '',
        nome: '',
        cor: 'blue',
        ordem: statusList.length
      });
    }
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setStatusEditando(null);
    setFormData({ codigo: '', nome: '', cor: 'blue', ordem: 0 });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (statusEditando) {
      atualizarStatusMutation.mutate({ id: statusEditando.id, dados: formData });
    } else {
      criarStatusMutation.mutate(formData);
    }
  };

  const coresDisponiveis = [
    { value: 'blue', label: 'Azul', bg: 'bg-blue-100', text: 'text-blue-800' },
    { value: 'green', label: 'Verde', bg: 'bg-green-100', text: 'text-green-800' },
    { value: 'red', label: 'Vermelho', bg: 'bg-red-100', text: 'text-red-800' },
    { value: 'yellow', label: 'Amarelo', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    { value: 'purple', label: 'Roxo', bg: 'bg-purple-100', text: 'text-purple-800' },
    { value: 'orange', label: 'Laranja', bg: 'bg-orange-100', text: 'text-orange-800' },
    { value: 'teal', label: 'Azul Esverdeado', bg: 'bg-teal-100', text: 'text-teal-800' },
    { value: 'indigo', label: 'Índigo', bg: 'bg-indigo-100', text: 'text-indigo-800' },
    { value: 'emerald', label: 'Esmeralda', bg: 'bg-emerald-100', text: 'text-emerald-800' },
    { value: 'slate', label: 'Cinza', bg: 'bg-slate-100', text: 'text-slate-800' }
  ];

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status de Propostas"
        subtitle="Gerencie os status disponíveis para as propostas"
        actionLabel="Novo Status"
        onAction={() => abrirModal()}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : statusList.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-slate-500">Nenhum status cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {statusList.map((status) => {
            const corInfo = coresDisponiveis.find(c => c.value === status.cor) || coresDisponiveis[0];
            return (
              <Card key={status.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge className={`${corInfo.bg} ${corInfo.text}`}>
                      {status.nome}
                    </Badge>
                    <div className="text-sm text-slate-600">
                      <span className="font-mono bg-slate-100 px-2 py-1 rounded">{status.codigo}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => abrirModal(status)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatusExcluir(status)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusEditando ? 'Editar Status' : 'Novo Status'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Código *</Label>
              <Input
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                placeholder="em_andamento"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Use snake_case (ex: aguardando_pagamento)</p>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Em Andamento"
                required
              />
            </div>
            <div>
              <Label>Cor *</Label>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {coresDisponiveis.map((cor) => (
                  <button
                    key={cor.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, cor: cor.value })}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      formData.cor === cor.value ? 'border-slate-900 scale-110' : 'border-slate-200'
                    } ${cor.bg}`}
                  >
                    <div className={`text-xs font-medium ${cor.text}`}>
                      {cor.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Ordem</Label>
              <Input
                type="number"
                value={formData.ordem}
                onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={fecharModal}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={criarStatusMutation.isPending || atualizarStatusMutation.isPending}
                className="bg-[#23BE84] hover:bg-[#1da570]"
              >
                {(criarStatusMutation.isPending || atualizarStatusMutation.isPending) ? (
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

      <AlertDialog open={!!statusExcluir} onOpenChange={() => setStatusExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o status "{statusExcluir?.nome}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluirStatusMutation.mutate(statusExcluir.id)}
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
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export default function TabelasComissaoEmprestimo() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({
    tipo_operacao: 'NOVO',
    convenio_id: '',
    banco: '',
    prazo_min: '',
    prazo_max: '',
    percentual_comissao_empresa: '',
    percentual_comissao_vendedor: ''
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

  const { data: tabelas = [], isLoading } = useQuery({
    queryKey: ['tabelas-comissao-emprestimo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TabelaComissaoEmprestimo.filter({ empresa_id: empresaId, ativo: true }, '-created_date')
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Convenio.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Banco.filter({ empresa_id: empresaId, ativo: true })
  });

  const criarMutation = useMutation({
    mutationFn: async (dados) => {
      const convenioSelecionado = convenios.find(c => c.id === dados.convenio_id);
      return await base44.entities.TabelaComissaoEmprestimo.create({
        empresa_id: empresaId,
        tipo_operacao: dados.tipo_operacao,
        convenio_id: dados.convenio_id || null,
        convenio_nome: convenioSelecionado?.nome || '',
        banco: dados.banco,
        prazo_min: parseInt(dados.prazo_min),
        prazo_max: parseInt(dados.prazo_max),
        percentual_comissao_empresa: parseFloat(dados.percentual_comissao_empresa),
        percentual_comissao_vendedor: parseFloat(dados.percentual_comissao_vendedor),
        ativo: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-comissao-emprestimo', empresaId] });
      toast.success('Tabela cadastrada com sucesso!');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar: ' + error.message);
    }
  });

  const editarMutation = useMutation({
    mutationFn: async ({ id, dados }) => {
      const convenioSelecionado = convenios.find(c => c.id === dados.convenio_id);
      return await base44.entities.TabelaComissaoEmprestimo.update(id, {
        tipo_operacao: dados.tipo_operacao,
        convenio_id: dados.convenio_id || null,
        convenio_nome: convenioSelecionado?.nome || '',
        banco: dados.banco,
        prazo_min: parseInt(dados.prazo_min),
        prazo_max: parseInt(dados.prazo_max),
        percentual_comissao_empresa: parseFloat(dados.percentual_comissao_empresa),
        percentual_comissao_vendedor: parseFloat(dados.percentual_comissao_vendedor)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-comissao-emprestimo', empresaId] });
      toast.success('Tabela atualizada com sucesso!');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => base44.entities.TabelaComissaoEmprestimo.update(id, { ativo: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-comissao-emprestimo', empresaId] });
      toast.success('Tabela excluída com sucesso!');
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error('Erro ao excluir: ' + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      tipo_operacao: 'NOVO',
      convenio_id: '',
      banco: '',
      prazo_min: '',
      prazo_max: '',
      percentual_comissao_empresa: '',
      percentual_comissao_vendedor: ''
    });
    setEditando(null);
  };

  const handleEditar = (tabela) => {
    setEditando(tabela);
    setFormData({
      tipo_operacao: tabela.tipo_operacao,
      convenio_id: tabela.convenio_id || '',
      banco: tabela.banco || '',
      prazo_min: tabela.prazo_min,
      prazo_max: tabela.prazo_max,
      percentual_comissao_empresa: tabela.percentual_comissao_empresa,
      percentual_comissao_vendedor: tabela.percentual_comissao_vendedor
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

  const tipoLabels = {
    'NOVO': 'Novo',
    'REFINANCIAMENTO': 'Refinanciamento',
    'PORTABILIDADE_PURA': 'Portabilidade Pura',
    'REFIN_PORTABILIDADE': 'Refin + Portabilidade'
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tabelas de Comissão - Empréstimos"
        subtitle="Gerencie as tabelas de comissão para empréstimos consignados"
        actionLabel="Nova Tabela"
        onAction={() => {
          resetForm();
          setShowModal(true);
        }}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : tabelas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-slate-500">Nenhuma tabela cadastrada ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tabelas.map((tabela) => (
            <Card key={tabela.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                        {tipoLabels[tabela.tipo_operacao]}
                      </span>
                      {tabela.convenio_nome && (
                        <span className="text-sm text-slate-600">Convênio: {tabela.convenio_nome}</span>
                      )}
                      {tabela.banco && (
                        <span className="text-sm text-slate-600">Banco: {tabela.banco}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Prazo</p>
                        <p className="font-medium">{tabela.prazo_min} a {tabela.prazo_max} meses</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Comissão Empresa</p>
                        <p className="font-medium text-green-600">{tabela.percentual_comissao_empresa}%</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Comissão Vendedor</p>
                        <p className="font-medium text-purple-600">{tabela.percentual_comissao_vendedor}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditar(tabela)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setDeleteId(tabela.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar' : 'Nova'} Tabela de Comissão</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Tipo de Operação *</Label>
              <select
                value={formData.tipo_operacao}
                onChange={(e) => setFormData({ ...formData, tipo_operacao: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                required
              >
                <option value="NOVO">Novo</option>
                <option value="REFINANCIAMENTO">Refinanciamento</option>
                <option value="PORTABILIDADE_PURA">Portabilidade Pura</option>
                <option value="REFIN_PORTABILIDADE">Refin + Portabilidade</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Convênio (opcional)</Label>
                <select
                  value={formData.convenio_id}
                  onChange={(e) => setFormData({ ...formData, convenio_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Todos</option>
                  {convenios.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Banco (opcional)</Label>
                <select
                  value={formData.banco}
                  onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="C6 Bank">C6 Bank</option>
                  <option value="Digio">Digio</option>
                  <option value="BMG">BMG</option>
                  <option value="Finanto">Finanto</option>
                  <option value="BRB">BRB</option>
                  <option value="Happy">Happy</option>
                  {bancos.map(b => (
                    <option key={b.id} value={b.nome}>{b.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prazo Mínimo (meses) *</Label>
                <Input
                  type="number"
                  value={formData.prazo_min}
                  onChange={(e) => setFormData({ ...formData, prazo_min: e.target.value })}
                  placeholder="12"
                  required
                />
              </div>
              <div>
                <Label>Prazo Máximo (meses) *</Label>
                <Input
                  type="number"
                  value={formData.prazo_max}
                  onChange={(e) => setFormData({ ...formData, prazo_max: e.target.value })}
                  placeholder="84"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>% Comissão Empresa *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.percentual_comissao_empresa}
                  onChange={(e) => setFormData({ ...formData, percentual_comissao_empresa: e.target.value })}
                  placeholder="2.5"
                  required
                />
              </div>
              <div>
                <Label>% Comissão Vendedor *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.percentual_comissao_vendedor}
                  onChange={(e) => setFormData({ ...formData, percentual_comissao_vendedor: e.target.value })}
                  placeholder="1.5"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={criarMutation.isPending || editarMutation.isPending}>
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta tabela de comissão? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletarMutation.mutate(deleteId)}
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
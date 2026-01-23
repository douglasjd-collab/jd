import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function GerenciarCategoriasModal({ open, onOpenChange, empresaId }) {
  const [editingId, setEditingId] = useState(null);
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', icone: '🏷️' });
  const [editForm, setEditForm] = useState({ nome: '', icone: '' });
  const queryClient = useQueryClient();

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-despesa', empresaId],
    queryFn: async () => {
      const cats = await base44.entities.CategoriaDespesa.filter({ 
        empresa_id: empresaId,
        status: 'ativa' 
      });
      return cats.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    },
    enabled: !!empresaId && open,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.CategoriaDespesa.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesa'] });
      toast.success('Categoria criada!');
      setNovaCategoria({ nome: '', icone: '🏷️' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.CategoriaDespesa.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesa'] });
      toast.success('Categoria atualizada!');
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.CategoriaDespesa.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesa'] });
      toast.success('Categoria excluída!');
    },
  });

  const handleCriar = () => {
    if (!novaCategoria.nome.trim()) {
      toast.error('Digite o nome da categoria');
      return;
    }
    createMutation.mutate({
      empresa_id: empresaId,
      nome: novaCategoria.nome.trim(),
      icone: novaCategoria.icone,
      ordem: categorias.length,
      status: 'ativa',
    });
  };

  const handleEditar = (cat) => {
    setEditingId(cat.id);
    setEditForm({ nome: cat.nome, icone: cat.icone });
  };

  const handleSalvarEdicao = (id) => {
    if (!editForm.nome.trim()) {
      toast.error('Digite o nome da categoria');
      return;
    }
    updateMutation.mutate({
      id,
      data: { nome: editForm.nome.trim(), icone: editForm.icone },
    });
  };

  const handleExcluir = (id) => {
    if (confirm('Excluir esta categoria?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar Categorias de Despesas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nova Categoria */}
          <div className="flex gap-2 p-4 bg-slate-50 rounded-lg">
            <Input
              placeholder="Ícone (emoji)"
              value={novaCategoria.icone}
              onChange={(e) => setNovaCategoria({ ...novaCategoria, icone: e.target.value })}
              className="w-20 text-center"
              maxLength={2}
            />
            <Input
              placeholder="Nome da categoria"
              value={novaCategoria.nome}
              onChange={(e) => setNovaCategoria({ ...novaCategoria, nome: e.target.value })}
              onKeyPress={(e) => e.key === 'Enter' && handleCriar()}
              className="flex-1"
            />
            <Button onClick={handleCriar} disabled={createMutation.isPending}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {/* Lista de Categorias */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {categorias.length === 0 ? (
              <p className="text-center text-slate-500 py-8">Nenhuma categoria cadastrada</p>
            ) : (
              categorias.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 p-3 border rounded-lg hover:bg-slate-50">
                  {editingId === cat.id ? (
                    <>
                      <Input
                        value={editForm.icone}
                        onChange={(e) => setEditForm({ ...editForm, icone: e.target.value })}
                        className="w-20 text-center"
                        maxLength={2}
                      />
                      <Input
                        value={editForm.nome}
                        onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSalvarEdicao(cat.id)}
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl w-12 text-center">{cat.icone}</span>
                      <span className="flex-1 font-medium">{cat.nome}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditar(cat)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleExcluir(cat.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
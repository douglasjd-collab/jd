import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import EmojiPicker from './EmojiPicker';

export default function GerenciarCategoriasModal({ open, onOpenChange, empresaId }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nome: '', icone: '' });
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', icone: '🏷️' });
  const [novaSubcategoria, setNovaSubcategoria] = useState({ nome: '', icone: '🏷️', pai_id: null });
  const [expandedCats, setExpandedCats] = useState({});
  const queryClient = useQueryClient();

  const { data: todasCategorias = [] } = useQuery({
    queryKey: ['categorias-despesa', empresaId],
    queryFn: async () => {
      const cats = await base44.entities.CategoriaDespesa.filter({ empresa_id: empresaId, status: 'ativa' });
      return cats.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    },
    enabled: !!empresaId && open,
  });

  const categoriasPai = todasCategorias.filter(c => !c.categoria_pai_id);
  const subcategoriasDe = (paiId) => todasCategorias.filter(c => c.categoria_pai_id === paiId);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CategoriaDespesa.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesa'] });
      toast.success('Categoria criada!');
      setNovaCategoria({ nome: '', icone: '🏷️' });
      setNovaSubcategoria({ nome: '', icone: '🏷️', pai_id: null });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CategoriaDespesa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesa'] });
      toast.success('Atualizada!');
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CategoriaDespesa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesa'] });
      toast.success('Excluída!');
    },
  });

  const handleCriarPrincipal = () => {
    if (!novaCategoria.nome.trim()) { toast.error('Digite o nome'); return; }
    createMutation.mutate({
      empresa_id: empresaId,
      nome: novaCategoria.nome.trim(),
      icone: novaCategoria.icone,
      ordem: categoriasPai.length,
      status: 'ativa',
    });
  };

  const handleCriarSub = (paiId) => {
    if (!novaSubcategoria.nome.trim()) { toast.error('Digite o nome da subcategoria'); return; }
    createMutation.mutate({
      empresa_id: empresaId,
      nome: novaSubcategoria.nome.trim(),
      icone: novaSubcategoria.icone,
      categoria_pai_id: paiId,
      ordem: subcategoriasDe(paiId).length,
      status: 'ativa',
    });
  };

  const handleEditar = (cat) => {
    setEditingId(cat.id);
    setEditForm({ nome: cat.nome, icone: cat.icone || '🏷️' });
  };

  const handleSalvar = (id) => {
    if (!editForm.nome.trim()) { toast.error('Digite o nome'); return; }
    updateMutation.mutate({ id, data: { nome: editForm.nome.trim(), icone: editForm.icone } });
  };

  const handleExcluir = (id, temFilhos) => {
    if (temFilhos) {
      toast.error('Exclua as subcategorias antes de excluir a categoria principal');
      return;
    }
    if (confirm('Excluir esta categoria?')) deleteMutation.mutate(id);
  };

  const toggleExpand = (id) => setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Categorias de Despesas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nova Categoria Principal */}
          <div className="flex gap-2 p-3 bg-slate-50 rounded-lg border">
            <EmojiPicker
              value={novaCategoria.icone}
              onChange={(v) => setNovaCategoria({ ...novaCategoria, icone: v })}
            />
            <Input
              placeholder="Nova categoria principal"
              value={novaCategoria.nome}
              onChange={(e) => setNovaCategoria({ ...novaCategoria, nome: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleCriarPrincipal()}
              className="flex-1"
            />
            <Button onClick={handleCriarPrincipal} disabled={createMutation.isPending} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>

          {/* Lista */}
          <div className="space-y-2">
            {categoriasPai.length === 0 ? (
              <p className="text-center text-slate-500 py-6 text-sm">Nenhuma categoria cadastrada</p>
            ) : categoriasPai.map((cat) => {
              const subs = subcategoriasDe(cat.id);
              const expanded = expandedCats[cat.id];
              return (
                <div key={cat.id} className="border rounded-lg overflow-hidden">
                  {/* Categoria Principal */}
                  <div className="flex items-center gap-2 p-3 bg-white hover:bg-slate-50">
                    <button onClick={() => toggleExpand(cat.id)} className="text-slate-400 hover:text-slate-700">
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    {editingId === cat.id ? (
                      <>
                        <EmojiPicker value={editForm.icone} onChange={(v) => setEditForm({ ...editForm, icone: v })} />
                        <Input value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className="flex-1" />
                        <Button size="sm" variant="ghost" onClick={() => handleSalvar(cat.id)}><Check className="w-4 h-4 text-green-600" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4 text-red-500" /></Button>
                      </>
                    ) : (
                      <>
                        <span className="text-xl w-8 text-center">{cat.icone}</span>
                        <span className="flex-1 font-semibold text-sm">{cat.nome}</span>
                        <span className="text-xs text-slate-400 mr-2">{subs.length} subcategoria{subs.length !== 1 ? 's' : ''}</span>
                        <Button size="sm" variant="ghost" onClick={() => handleEditar(cat)}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleExcluir(cat.id, subs.length > 0)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                      </>
                    )}
                  </div>

                  {/* Subcategorias */}
                  {expanded && (
                    <div className="bg-slate-50 border-t">
                      {subs.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 last:border-0">
                          <span className="w-5" />
                          {editingId === sub.id ? (
                            <>
                              <EmojiPicker value={editForm.icone} onChange={(v) => setEditForm({ ...editForm, icone: v })} />
                              <Input value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className="flex-1" />
                              <Button size="sm" variant="ghost" onClick={() => handleSalvar(sub.id)}><Check className="w-4 h-4 text-green-600" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4 text-red-500" /></Button>
                            </>
                          ) : (
                            <>
                              <span className="text-base w-7 text-center">{sub.icone}</span>
                              <span className="flex-1 text-sm text-slate-700">{sub.nome}</span>
                              <Button size="sm" variant="ghost" onClick={() => handleEditar(sub)}><Edit2 className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => handleExcluir(sub.id, false)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Adicionar Subcategoria */}
                      <div className="flex gap-2 p-3">
                        <span className="w-5" />
                        <EmojiPicker
                          value={novaSubcategoria.pai_id === cat.id ? novaSubcategoria.icone : '🏷️'}
                          onChange={(v) => setNovaSubcategoria({ ...novaSubcategoria, icone: v, pai_id: cat.id })}
                        />
                        <Input
                          placeholder="Nova subcategoria"
                          value={novaSubcategoria.pai_id === cat.id ? novaSubcategoria.nome : ''}
                          onChange={(e) => setNovaSubcategoria({ nome: e.target.value, icone: novaSubcategoria.pai_id === cat.id ? novaSubcategoria.icone : '🏷️', pai_id: cat.id })}
                          onKeyDown={(e) => e.key === 'Enter' && novaSubcategoria.pai_id === cat.id && handleCriarSub(cat.id)}
                          className="flex-1 text-sm"
                        />
                        <Button size="sm" variant="outline"
                          onClick={() => {
                            setNovaSubcategoria(prev => ({ ...prev, pai_id: cat.id }));
                            handleCriarSub(cat.id);
                          }}
                          disabled={createMutation.isPending}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
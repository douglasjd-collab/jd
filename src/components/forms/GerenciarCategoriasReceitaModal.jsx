import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function GerenciarCategoriasReceitaModal({ open, onOpenChange, empresaId }) {
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novaSubcategoria, setNovaSubcategoria] = useState({ categoria_id: '', nome: '' });
  const queryClient = useQueryClient();

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-receita-all'],
    queryFn: () => base44.entities.CategoriaReceita.filter({}),
    enabled: open,
  });

  const { data: subcategorias = [] } = useQuery({
    queryKey: ['subcategorias-receita-all'],
    queryFn: () => base44.entities.SubcategoriaReceita.filter({}),
    enabled: open,
  });

  const createCategoriaMutation = useMutation({
    mutationFn: (data) => base44.entities.CategoriaReceita.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['categorias-receita-all']);
      queryClient.invalidateQueries(['categorias-receita']);
      toast.success('Categoria criada com sucesso!');
      setNovaCategoria('');
    },
  });

  const deleteCategoriaMutation = useMutation({
    mutationFn: (id) => base44.entities.CategoriaReceita.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['categorias-receita-all']);
      queryClient.invalidateQueries(['categorias-receita']);
      toast.success('Categoria excluída!');
    },
  });

  const toggleCategoriaAtivoMutation = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.CategoriaReceita.update(id, { ativo }),
    onSuccess: () => {
      queryClient.invalidateQueries(['categorias-receita-all']);
      queryClient.invalidateQueries(['categorias-receita']);
    },
  });

  const createSubcategoriaMutation = useMutation({
    mutationFn: (data) => base44.entities.SubcategoriaReceita.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['subcategorias-receita-all']);
      queryClient.invalidateQueries(['subcategorias-receita']);
      toast.success('Subcategoria criada com sucesso!');
      setNovaSubcategoria({ categoria_id: '', nome: '' });
    },
  });

  const deleteSubcategoriaMutation = useMutation({
    mutationFn: (id) => base44.entities.SubcategoriaReceita.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['subcategorias-receita-all']);
      queryClient.invalidateQueries(['subcategorias-receita']);
      toast.success('Subcategoria excluída!');
    },
  });

  const toggleSubcategoriaAtivoMutation = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.SubcategoriaReceita.update(id, { ativo }),
    onSuccess: () => {
      queryClient.invalidateQueries(['subcategorias-receita-all']);
      queryClient.invalidateQueries(['subcategorias-receita']);
    },
  });

  const handleAdicionarCategoria = () => {
    if (!novaCategoria.trim()) {
      toast.error('Digite o nome da categoria');
      return;
    }
    createCategoriaMutation.mutate({
      empresa_id: empresaId,
      nome: novaCategoria.trim(),
      ativo: true,
      ordem: categorias.length + 1,
    });
  };

  const handleAdicionarSubcategoria = () => {
    if (!novaSubcategoria.categoria_id || !novaSubcategoria.nome.trim()) {
      toast.error('Selecione a categoria e digite o nome da subcategoria');
      return;
    }
    const categoria = categorias.find(c => c.id === novaSubcategoria.categoria_id);
    createSubcategoriaMutation.mutate({
      empresa_id: empresaId,
      categoria_id: novaSubcategoria.categoria_id,
      categoria_nome: categoria?.nome || '',
      nome: novaSubcategoria.nome.trim(),
      ativo: true,
      ordem: subcategorias.filter(s => s.categoria_id === novaSubcategoria.categoria_id).length + 1,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Categorias de Receitas</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="categorias" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="subcategorias">Subcategorias</TabsTrigger>
          </TabsList>

          <TabsContent value="categorias" className="space-y-4">
            {/* Adicionar Categoria */}
            <Card className="p-4">
              <Label>Nova Categoria</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Ex: Consórcio, Empréstimos, Seguros..."
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdicionarCategoria()}
                />
                <Button onClick={handleAdicionarCategoria}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </Card>

            {/* Lista de Categorias */}
            <div className="space-y-2">
              {categorias.length === 0 ? (
                <Card className="p-8 text-center text-slate-500">
                  Nenhuma categoria cadastrada
                </Card>
              ) : (
                categorias.map((cat) => (
                  <Card key={cat.id} className={`p-4 ${!cat.ativo ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{cat.nome}</p>
                        <p className="text-xs text-slate-500">
                          {cat.ativo ? 'Ativa' : 'Inativa'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={cat.ativo ? 'outline' : 'default'}
                          onClick={() => toggleCategoriaAtivoMutation.mutate({ id: cat.id, ativo: !cat.ativo })}
                        >
                          {cat.ativo ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm(`Excluir categoria "${cat.nome}"?`)) {
                              deleteCategoriaMutation.mutate(cat.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="subcategorias" className="space-y-4">
            {/* Adicionar Subcategoria */}
            <Card className="p-4">
              <Label>Nova Subcategoria</Label>
              <div className="space-y-2 mt-2">
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={novaSubcategoria.categoria_id}
                  onChange={(e) => setNovaSubcategoria({ ...novaSubcategoria, categoria_id: e.target.value })}
                >
                  <option value="">Selecione a categoria</option>
                  {categorias.filter(c => c.ativo).map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: Canopus, BV, TN Promotora..."
                    value={novaSubcategoria.nome}
                    onChange={(e) => setNovaSubcategoria({ ...novaSubcategoria, nome: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdicionarSubcategoria()}
                  />
                  <Button onClick={handleAdicionarSubcategoria}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
              </div>
            </Card>

            {/* Lista de Subcategorias */}
            <div className="space-y-2">
              {subcategorias.length === 0 ? (
                <Card className="p-8 text-center text-slate-500">
                  Nenhuma subcategoria cadastrada
                </Card>
              ) : (
                subcategorias.map((sub) => (
                  <Card key={sub.id} className={`p-4 ${!sub.ativo ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{sub.nome}</p>
                        <p className="text-xs text-slate-500">
                          {sub.categoria_nome} • {sub.ativo ? 'Ativa' : 'Inativa'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={sub.ativo ? 'outline' : 'default'}
                          onClick={() => toggleSubcategoriaAtivoMutation.mutate({ id: sub.id, ativo: !sub.ativo })}
                        >
                          {sub.ativo ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm(`Excluir subcategoria "${sub.nome}"?`)) {
                              deleteSubcategoriaMutation.mutate(sub.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
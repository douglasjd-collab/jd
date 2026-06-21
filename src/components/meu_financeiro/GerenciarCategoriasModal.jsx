import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Pencil, Check, X, GripVertical, ChevronRight, FolderOpen } from 'lucide-react';

export default function GerenciarCategoriasModal({ open, onClose, tipo, user, onSaved }) {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novaSub, setNovaSub] = useState({});
  const [adicionando, setAdicionando] = useState(false);
  const [adicionandoSub, setAdicionandoSub] = useState({});
  const [expandida, setExpandida] = useState({});

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const cats = await base44.entities.MeuFinanceiroCategoria.filter(
        { usuario_id: user.id, empresa_id: user.empresa_id, tipo },
        'ordem',
        200
      );
      setCategorias(cats);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user, tipo]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  const adicionarCategoria = async () => {
    if (!novaCategoria.trim()) return;
    setAdicionando(true);
    try {
      await base44.entities.MeuFinanceiroCategoria.create({
        empresa_id: user.empresa_id,
        usuario_id: user.id,
        tipo,
        nome: novaCategoria.trim(),
        parent_id: null,
        ordem: categorias.length,
      });
      setNovaCategoria('');
      toast.success('Categoria criada!');
      carregar();
      onSaved?.();
    } catch (e) { toast.error('Erro ao criar categoria'); } finally { setAdicionando(false); }
  };

  const adicionarSubcategoria = async (parentId) => {
    const nome = novaSub[parentId]?.trim();
    if (!nome) return;
    setAdicionandoSub(s => ({ ...s, [parentId]: true }));
    try {
      await base44.entities.MeuFinanceiroCategoria.create({
        empresa_id: user.empresa_id,
        usuario_id: user.id,
        tipo,
        nome,
        parent_id: parentId,
        ordem: 0,
      });
      setNovaSub(s => ({ ...s, [parentId]: '' }));
      toast.success('Subcategoria criada!');
      carregar();
      onSaved?.();
    } catch (e) { toast.error('Erro ao criar subcategoria'); } finally { setAdicionandoSub(s => ({ ...s, [parentId]: false })); }
  };

  const excluir = async (id) => {
    if (!confirm('Excluir esta categoria e suas subcategorias?')) return;
    try {
      await base44.entities.MeuFinanceiroCategoria.delete(id);
      // Excluir subcategorias
      const subs = categorias.filter(c => c.parent_id === id);
      for (const s of subs) {
        try { await base44.entities.MeuFinanceiroCategoria.delete(s.id); } catch {}
      }
      toast.success('Categoria excluída');
      carregar();
      onSaved?.();
    } catch (e) { toast.error('Erro ao excluir'); }
  };

  const excluirSub = async (id) => {
    if (!confirm('Excluir esta subcategoria?')) return;
    try {
      await base44.entities.MeuFinanceiroCategoria.delete(id);
      toast.success('Subcategoria excluída');
      carregar();
      onSaved?.();
    } catch (e) { toast.error('Erro ao excluir'); }
  };

  const categoriasPrincipais = categorias.filter(c => !c.parent_id);
  const subcategorias = (parentId) => categorias.filter(c => c.parent_id === parentId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Gerenciar Categorias — {tipo === 'receita' ? 'Receitas' : 'Despesas'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nova Categoria */}
          <div className="flex gap-2">
            <Input
              placeholder="Nova categoria..."
              value={novaCategoria}
              onChange={e => setNovaCategoria(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionarCategoria()}
            />
            <Button size="sm" onClick={adicionarCategoria} disabled={adicionando || !novaCategoria.trim()} className="bg-blue-600 hover:bg-blue-700 shrink-0">
              {adicionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : categoriasPrincipais.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Nenhuma categoria cadastrada.</div>
          ) : (
            <div className="space-y-1">
              {categoriasPrincipais.map(cat => {
                const subs = subcategorias(cat.id);
                const exp = expandida[cat.id];
                return (
                  <div key={cat.id} className="border rounded-lg bg-white">
                    {/* Categoria principal */}
                    <div className="flex items-center gap-2 p-3">
                      <button onClick={() => setExpandida(s => ({ ...s, [cat.id]: !s[cat.id] }))} className="p-0.5 hover:bg-slate-100 rounded">
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${exp ? 'rotate-90' : ''}`} />
                      </button>
                      <span className="flex-1 font-medium text-slate-700 text-sm">{cat.nome}</span>
                      <span className="text-xs text-slate-400">{subs.length} sub</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => excluir(cat.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Subcategorias */}
                    {exp && (
                      <div className="border-t bg-slate-50 rounded-b-lg px-3 py-2 space-y-1">
                        {subs.map(sub => (
                          <div key={sub.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white">
                            <GripVertical className="w-3 h-3 text-slate-300" />
                            <span className="flex-1 text-sm text-slate-600">{sub.nome}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => excluirSub(sub.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        {/* Adicionar subcategoria */}
                        <div className="flex gap-2 pt-1">
                          <Input
                            className="h-8 text-xs"
                            placeholder="Nova subcategoria..."
                            value={novaSub[cat.id] || ''}
                            onChange={e => setNovaSub(s => ({ ...s, [cat.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && adicionarSubcategoria(cat.id)}
                          />
                          <Button size="sm" className="h-8 text-xs" onClick={() => adicionarSubcategoria(cat.id)} disabled={adicionandoSub[cat.id] || !novaSub[cat.id]?.trim()}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
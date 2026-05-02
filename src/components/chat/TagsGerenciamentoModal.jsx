import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

const cores = [
  '#FF6B6B', '#FF8E72', '#FFA94D', '#FFD93D', '#6BCB77',
  '#4D96FF', '#A78BFA', '#F472B6', '#06B6D4', '#10B981'
];

export default function TagsGerenciamentoModal({ open, onOpenChange, empresaId }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(cores[0]);
  const [deletando, setDeletando] = useState(null);

  useEffect(() => {
    if (!open || !empresaId) return;
    carregarTags();
  }, [open, empresaId]);

  const carregarTags = async () => {
    setLoading(true);
    try {
      const resp = await base44.entities.ContatoTag.filter({ empresa_id: empresaId }, 'nome', 100);
      setTags(resp || []);
    } catch (e) {
      console.error('Erro ao carregar tags:', e);
      toast.error('Erro ao carregar tags');
    } finally {
      setLoading(false);
    }
  };

  const criarTag = async () => {
    if (!novoNome.trim()) {
      toast.error('Nome da tag é obrigatório');
      return;
    }

    setCriando(true);
    try {
      const tag = await base44.entities.ContatoTag.create({
        empresa_id: empresaId,
        nome: novoNome.trim(),
        cor: novaCor
      });
      setTags([...tags, tag]);
      setNovoNome('');
      setNovaCor(cores[0]);
      toast.success('Tag criada com sucesso!');
    } catch (e) {
      console.error('Erro ao criar tag:', e);
      toast.error('Erro ao criar tag: ' + e.message);
    } finally {
      setCriando(false);
    }
  };

  const deletarTag = async (tagId) => {
    if (!confirm('Tem certeza que deseja deletar esta tag?')) return;

    setDeletando(tagId);
    try {
      await base44.entities.ContatoTag.delete(tagId);
      setTags(tags.filter(t => t.id !== tagId));
      toast.success('Tag deletada com sucesso!');
    } catch (e) {
      console.error('Erro ao deletar tag:', e);
      toast.error('Erro ao deletar tag: ' + e.message);
    } finally {
      setDeletando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Criar nova tag */}
          <div className="space-y-2 border rounded-lg p-3 bg-slate-50">
            <Label className="text-xs font-semibold">Criar Nova Tag</Label>
            <Input
              placeholder="Nome da tag"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && criarTag()}
              disabled={criando}
              className="text-sm"
            />
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Selecione a cor</Label>
              <div className="grid grid-cols-5 gap-2">
                {cores.map(cor => (
                  <button
                    key={cor}
                    onClick={() => setNovaCor(cor)}
                    className={`h-8 rounded-lg border-2 transition-all ${
                      novaCor === cor ? 'border-slate-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: cor }}
                    title={cor}
                  />
                ))}
              </div>
            </div>
            <Button
              onClick={criarTag}
              disabled={criando || !novoNome.trim()}
              className="w-full gap-1.5"
              size="sm"
            >
              {criando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {criando ? 'Criando...' : 'Criar Tag'}
            </Button>
          </div>

          {/* Lista de tags */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Tags Criadas ({tags.length})</Label>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm">
                Nenhuma tag criada ainda
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {tags.map(tag => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div
                        className="w-4 h-4 rounded flex-shrink-0"
                        style={{ backgroundColor: tag.cor }}
                      />
                      <span className="text-sm font-medium text-slate-700">{tag.nome}</span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => deletarTag(tag.id)}
                      disabled={deletando === tag.id}
                    >
                      {deletando === tag.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const CORES_BASE = [
  { nome: 'Vermelho', hex: '#EF4444' },
  { nome: 'Laranja', hex: '#F97316' },
  { nome: 'Amarelo', hex: '#EAB308' },
  { nome: 'Verde', hex: '#22C55E' },
  { nome: 'Azul', hex: '#3B82F6' },
  { nome: 'Roxo', hex: '#A855F7' },
  { nome: 'Rosa', hex: '#EC4899' },
  { nome: 'Preto', hex: '#1F2937' }
];

// Ajustar cor baseado em intensidade (0-1)
const ajustarIntensidade = (hexColor, intensity) => {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // intensity 0 = mais claro, 1 = normal/forte
  if (intensity < 0.5) {
    // Claro (mistura com branco)
    const factor = (0.5 - intensity) * 2;
    const rNew = Math.round(r + (255 - r) * factor);
    const gNew = Math.round(g + (255 - g) * factor);
    const bNew = Math.round(b + (255 - b) * factor);
    return `#${rNew.toString(16).padStart(2, '0')}${gNew.toString(16).padStart(2, '0')}${bNew.toString(16).padStart(2, '0')}`;
  } else {
    // Escuro (mistura com preto)
    const factor = (intensity - 0.5) * 2;
    const rNew = Math.round(r * (1 - factor));
    const gNew = Math.round(g * (1 - factor));
    const bNew = Math.round(b * (1 - factor));
    return `#${rNew.toString(16).padStart(2, '0')}${gNew.toString(16).padStart(2, '0')}${bNew.toString(16).padStart(2, '0')}`;
  }
};

export default function TagsGerenciamentoModal({ open, onOpenChange, empresaId }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaCorBase, setNovaCorBase] = useState(CORES_BASE[0].hex);
  const [novaIntensidade, setNovaIntensidade] = useState(0.5);
  const [deletando, setDeletando] = useState(null);
  const [editando, setEditando] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCorBase, setEditCorBase] = useState('');
  const [editIntensidade, setEditIntensidade] = useState(0.5);

  useEffect(() => {
    if (!open || !empresaId) return;
    carregarTags();
  }, [open, empresaId]);

  const carregarTags = async () => {
    setLoading(true);
    try {
      const todasTags = await base44.entities.ContatoTag.filter(
        { empresa_id: empresaId },
        '-created_date',
        200
      );
      setTags(todasTags || []);
    } catch (e) {
      toast.error('Erro ao carregar tags');
    } finally {
      setLoading(false);
    }
  };

  const iniciarEdicao = (tag) => {
    setEditando(tag.id);
    setEditNome(tag.nome);
    const corBase = CORES_BASE.find(c => c.hex === tag.cor) || CORES_BASE[0];
    setEditCorBase(corBase.hex);
    setEditIntensidade(0.5);
  };

  const salvarEdicao = async (tagId) => {
    if (!editNome.trim()) {
      toast.error('Nome da tag é obrigatório');
      return;
    }

    const corFinal = ajustarIntensidade(editCorBase, editIntensidade);

    try {
      await base44.entities.ContatoTag.update(tagId, {
        nome: editNome.trim(),
        cor: corFinal
      });
      setTags(tags.map(t => t.id === tagId ? { ...t, nome: editNome.trim(), cor: corFinal } : t));
      setEditando(null);
      toast.success('Tag atualizada!');
    } catch (e) {
      toast.error('Erro ao atualizar tag: ' + e.message);
    }
  };

  const criarTag = async () => {
    if (!novoNome.trim()) {
      toast.error('Nome da tag é obrigatório');
      return;
    }

    const corFinal = ajustarIntensidade(novaCorBase, novaIntensidade);

    setCriando(true);
    try {
      const novaTag = await base44.entities.ContatoTag.create({
        empresa_id: empresaId,
        nome: novoNome.trim(),
        cor: corFinal,
      });
      setTags([...tags, novaTag]);
      setNovoNome('');
      setNovaCorBase(CORES_BASE[0].hex);
      setNovaIntensidade(0.5);
      toast.success('Tag criada!');
    } catch (e) {
      toast.error('Erro ao criar tag: ' + e.message);
    } finally {
      setCriando(false);
    }
  };

  const deletarTag = async (tagId) => {
    if (!confirm('Deletar esta tag?')) return;

    setDeletando(tagId);
    try {
      await base44.entities.ContatoTag.delete(tagId);
      setTags(tags.filter(t => t.id !== tagId));
      toast.success('Tag deletada!');
    } catch (e) {
      toast.error('Erro ao deletar tag: ' + e.message);
    } finally {
      setDeletando(null);
    }
  };

  const corPreview = ajustarIntensidade(novaCorBase, novaIntensidade);
  const corEditPreview = editando ? ajustarIntensidade(editCorBase, editIntensidade) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Criar nova tag */}
          <div className="space-y-3 border rounded-lg p-3 bg-slate-50">
            <Label className="text-xs font-semibold">Criar Nova Tag</Label>
            
            {/* Nome */}
            <Input
              placeholder="Nome da tag"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && criarTag()}
              disabled={criando}
              className="text-sm"
            />

            {/* Seletor de cor base */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Selecione a cor</Label>
              <div className="flex gap-1.5 flex-wrap">
                {CORES_BASE.map(cor => (
                  <button
                    key={cor.hex}
                    onClick={() => setNovaCorBase(cor.hex)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      novaCorBase === cor.hex ? 'border-slate-900 ring-2 ring-slate-300' : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: cor.hex }}
                    title={cor.nome}
                  />
                ))}
              </div>
            </div>

            {/* Slider de intensidade */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-600">Intensidade</Label>
                <span className="text-xs text-slate-500">
                  {novaIntensidade < 0.33 ? 'Claro' : novaIntensidade < 0.67 ? 'Médio' : 'Forte'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={novaIntensidade}
                onChange={e => setNovaIntensidade(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Claro</span>
                <span>Médio</span>
                <span>Forte</span>
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-600">Preview:</span>
              <div
                className="px-3 py-1.5 rounded-full text-white text-xs font-medium"
                style={{ backgroundColor: corPreview }}
              >
                {novoNome || 'Tag'}
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
              <div className="text-center py-6 text-slate-400 text-sm">Nenhuma tag criada</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {tags.map(tag => (
                  <div key={tag.id}>
                    {editando === tag.id ? (
                      <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <Input
                          value={editNome}
                          onChange={e => setEditNome(e.target.value)}
                          placeholder="Nome da tag"
                          className="text-sm"
                          autoFocus
                        />

                        {/* Cores */}
                        <div className="flex gap-1 flex-wrap">
                          {CORES_BASE.map(cor => (
                            <button
                              key={cor.hex}
                              onClick={() => setEditCorBase(cor.hex)}
                              className={`h-6 w-6 rounded-full border-2 transition-all ${
                                editCorBase === cor.hex ? 'border-slate-900 ring-1 ring-slate-400' : 'border-slate-300'
                              }`}
                              style={{ backgroundColor: cor.hex }}
                              title={cor.nome}
                            />
                          ))}
                        </div>

                        {/* Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>Claro</span>
                            <span>Médio</span>
                            <span>Forte</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={editIntensidade}
                            onChange={e => setEditIntensidade(parseFloat(e.target.value))}
                            className="w-full"
                          />
                        </div>

                        {/* Preview */}
                        <div
                          className="px-2 py-1 rounded text-white text-xs font-medium text-center"
                          style={{ backgroundColor: corEditPreview }}
                        >
                          {editNome || 'Tag'}
                        </div>

                        <div className="flex gap-1.5">
                          <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => salvarEdicao(tag.id)}>
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs"
                            onClick={() => setEditando(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: tag.cor }} />
                          <span className="text-sm font-medium text-slate-700">{tag.nome}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                            onClick={() => iniciarEdicao(tag)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-600 hover:bg-red-50"
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
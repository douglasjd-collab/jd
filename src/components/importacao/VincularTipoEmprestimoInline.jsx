import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Loader2, Tag, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Permite criar um TipoEmprestimo inline (sem sair da página atual).
 * Pré-preenche nome, slug e alias com o tipo original da importação.
 * onCreated recebe o tipo criado para que o chamador possa reprocessar propostas.
 */
export default function VincularTipoEmprestimoInline({ empresaId, tipoOriginal, onCreated }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [aliases, setAliases] = useState([]);
  const [novoAlias, setNovoAlias] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = () => {
    setNome(tipoOriginal || '');
    setSlug(tipoOriginal ? tipoOriginal.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '') : '');
    setAliases(tipoOriginal ? [tipoOriginal] : []);
    setNovoAlias('');
    setOpen(true);
  };

  const handleNomeChange = (n) => {
    setNome(n);
    setSlug(n.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''));
  };

  const adicionarAlias = () => {
    if (!novoAlias.trim()) return;
    setAliases(a => [...a, novoAlias.trim()]);
    setNovoAlias('');
  };

  const removerAlias = (idx) => {
    setAliases(a => a.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!nome.trim() || !slug.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const criado = await base44.entities.TipoEmprestimo.create({
        empresa_id: empresaId,
        nome: nome.trim(),
        slug: slug.trim(),
        aliases_importacao: aliases,
        ativo: true,
      });
      toast.success(`Tipo "${nome}" criado! Agora você pode reprocessar as propostas pendentes.`);
      setOpen(false);
      onCreated?.(criado);
    } catch (err) {
      toast.error('Erro ao criar tipo: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 hover:text-orange-900 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-lg transition-colors"
      >
        <Tag className="w-3.5 h-3.5" />
        Vincular tipo
      </button>
    );
  }

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-orange-600" />
        <p className="text-sm font-semibold text-orange-800">Criar Tipo de Empréstimo</p>
        <button onClick={() => setOpen(false)} className="ml-auto text-orange-400 hover:text-orange-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-orange-700">Nome *</Label>
          <Input value={nome} onChange={e => handleNomeChange(e.target.value)} className="h-8 text-sm mt-0.5" placeholder="Ex: Novo" />
        </div>
        <div>
          <Label className="text-xs text-orange-700">Slug (código) *</Label>
          <Input value={slug} onChange={e => setSlug(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} className="h-8 text-sm mt-0.5 font-mono" placeholder="EX: NOVO" />
        </div>
      </div>

      <div>
        <Label className="text-xs text-orange-700">Aliases de importação (nomes que vêm na planilha)</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {aliases.map((a, i) => (
            <Badge key={i} variant="outline" className="bg-white text-orange-800 border-orange-300 gap-1">
              {a}
              <button onClick={() => removerAlias(i)} className="text-orange-400 hover:text-orange-600">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {aliases.length === 0 && <span className="text-xs text-orange-400">Nenhum alias. Adicione abaixo.</span>}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            value={novoAlias}
            onChange={e => setNovoAlias(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarAlias(); } }}
            className="h-8 text-sm flex-1"
            placeholder="Digite o alias e pressione Enter"
          />
          <Button size="sm" variant="outline" onClick={adicionarAlias} className="h-8 border-orange-300 text-orange-700 hover:bg-orange-100">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} className="h-8">Cancelar</Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving} className="h-8 bg-orange-600 hover:bg-orange-700 text-white gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Criar e vincular
        </Button>
      </div>
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function TipoEmprestimoFormModal({ open, onClose, tipo, empresaId }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nome: '', slug: '', aliases_importacao: [], ativo: true });
  const [novoAlias, setNovoAlias] = useState('');

  useEffect(() => {
    if (tipo) {
      setForm({
        nome: tipo.nome || '',
        slug: tipo.slug || '',
        aliases_importacao: tipo.aliases_importacao || [],
        ativo: tipo.ativo !== false,
      });
    } else {
      setForm({ nome: '', slug: '', aliases_importacao: [], ativo: true });
    }
    setNovoAlias('');
  }, [tipo, open]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (tipo?.id) return base44.entities.TipoEmprestimo.update(tipo.id, data);
      return base44.entities.TipoEmprestimo.create({ ...data, empresa_id: empresaId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
      toast.success(tipo?.id ? 'Tipo atualizado!' : 'Tipo criado!');
      onClose();
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const handleNomeChange = (nome) => {
    const slug = nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    setForm((f) => ({ ...f, nome, slug }));
  };

  const adicionarAlias = () => {
    const alias = novoAlias.trim();
    if (!alias) return;
    setForm((f) => ({ ...f, aliases_importacao: [...(f.aliases_importacao || []), alias] }));
    setNovoAlias('');
  };

  const removerAlias = (idx) => {
    setForm((f) => ({ ...f, aliases_importacao: f.aliases_importacao.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.slug.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    saveMutation.mutate(form);
  };

  const aliases = form.aliases_importacao || [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tipo?.id ? 'Editar Tipo' : 'Novo Tipo de Empréstimo'}</DialogTitle>
          <DialogDescription>
            {tipo?.id
              ? 'Atualize o nome, o código ou as variações de importação deste tipo.'
              : 'Cadastre um tipo e as variações que aparecem nos arquivos de importação.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label>Nome do tipo *</Label>
            <Input
              value={form.nome}
              onChange={(e) => handleNomeChange(e.target.value)}
              placeholder="Ex: Cartão Consignado"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Código</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
              placeholder="Ex: CARTAO_CONSIGNADO"
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-500">Gerado automaticamente a partir do nome. Não altere se houver dados vinculados.</p>
          </div>

          <div className="space-y-2">
            <Label>Variações de importação</Label>
            <p className="text-xs text-slate-500">Nomes que vêm nos arquivos de importação e devem ser vinculados a este tipo.</p>
            <div className="flex gap-2">
              <Input
                value={novoAlias}
                onChange={(e) => setNovoAlias(e.target.value)}
                placeholder="Nome do arquivo..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarAlias())}
              />
              <Button type="button" variant="outline" onClick={adicionarAlias} className="gap-1.5 flex-shrink-0">
                <Plus className="w-4 h-4" /> Adicionar
              </Button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 min-h-[60px] max-h-44 overflow-y-auto flex flex-wrap gap-2 content-start">
              {aliases.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhuma variação adicionada.</p>
              ) : (
                aliases.map((alias, idx) => (
                  <Badge key={`${alias}-${idx}`} variant="secondary" className="gap-1 pr-1 max-w-full whitespace-normal break-all text-left bg-white border border-slate-200">
                    {alias}
                    <button type="button" onClick={() => removerAlias(idx)} className="hover:text-red-600 ml-1 flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 gap-2">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
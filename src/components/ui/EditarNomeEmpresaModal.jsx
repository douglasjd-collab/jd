import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EditarNomeEmpresaModal({ open, onOpenChange, empresa, onSuccess }) {
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (empresa) {
      setNovoNome(empresa.nome || '');
    }
  }, [empresa, open]);

  const handleSalvar = async () => {
    if (!novoNome.trim()) {
      toast.error('Nome não pode estar vazio');
      return;
    }

    if (novoNome === empresa.nome) {
      onOpenChange(false);
      return;
    }

    setSalvando(true);
    try {
      await base44.entities.Empresa.update(empresa.id, { nome: novoNome });
      toast.success('Nome da empresa alterado com sucesso!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Erro ao alterar nome: ' + error.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Alterar Nome da Empresa
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Nome da empresa</Label>
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Digite o novo nome"
              className="mt-2"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSalvar()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
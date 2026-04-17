import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EditarNomeEmpresaModal({ open, onOpenChange, empresaId, onSuccess }) {
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (open && empresaId) {
      carregarEmpresa();
    }
  }, [open, empresaId]);

  const carregarEmpresa = async () => {
    setCarregando(true);
    try {
      const emps = await base44.entities.Empresa.filter({ id: empresaId });
      if (emps && emps.length > 0) {
        setNovoNome(emps[0].nome || '');
      }
    } catch (error) {
      console.error('Erro ao carregar empresa:', error);
    } finally {
      setCarregando(false);
    }
  };

  const handleSalvar = async () => {
    if (!novoNome.trim()) {
      toast.error('Nome não pode estar vazio');
      return;
    }

    setSalvando(true);
    try {
      await base44.entities.Empresa.update(empresaId, { nome: novoNome });
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
            {carregando ? (
              <div className="flex items-center gap-2 p-2 text-sm text-slate-500 mt-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : (
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Digite o novo nome"
                className="mt-2"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSalvar()}
              />
            )}
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
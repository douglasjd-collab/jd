import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function ConvenioFormModal({ open, onOpenChange, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'INSS'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const resultado = await onSubmit(formData);
    if (resultado) {
      setFormData({ nome: '', tipo: 'INSS' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Convênio</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome do Convênio *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: INSS, Governo PE, etc"
              required
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="tipo">Tipo *</Label>
            <select
              id="tipo"
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              required
            >
              <option value="INSS">INSS</option>
              <option value="GOVERNO_ESTADUAL">Governo Estadual</option>
              <option value="GOVERNO_MUNICIPAL">Governo Municipal</option>
              <option value="PRIVADO">Privado</option>
            </select>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Cadastrar'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
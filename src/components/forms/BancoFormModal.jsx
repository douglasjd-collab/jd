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

export default function BancoFormModal({ open, onOpenChange, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    nome: '',
    codigo: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const resultado = await onSubmit(formData);
    if (resultado) {
      setFormData({ nome: '', codigo: '' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Banco</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome do Banco *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: C6 Bank, BMG, etc"
              required
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="codigo">Código (opcional)</Label>
            <Input
              id="codigo"
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              placeholder="Ex: 336, 033, etc"
            />
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
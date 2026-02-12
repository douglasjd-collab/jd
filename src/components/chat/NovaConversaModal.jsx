import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function NovaConversaModal({ open, onOpenChange, onCriar, isLoading }) {
  const [ddd, setDdd] = useState('');
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!ddd || !numero) {
      return;
    }

    // Limpar e formatar: +55 + DDD + Número
    const dddLimpo = ddd.replace(/\D/g, '');
    const numeroLimpo = numero.replace(/\D/g, '');
    const telefoneCompleto = `55${dddLimpo}${numeroLimpo}`;

    onCriar({
      telefone: telefoneCompleto,
      nome: nome || `Cliente ${dddLimpo}${numeroLimpo}`
    });

    // Limpar campos
    setDdd('');
    setNumero('');
    setNome('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conversa WhatsApp</DialogTitle>
          <DialogDescription>
            Inicie uma nova conversa informando o número do cliente
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-2 block">Nome do Cliente (opcional)</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: João Silva"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-2 block">País</Label>
              <Input
                value="+55"
                readOnly
                className="bg-slate-100 font-semibold text-center"
              />
            </div>
            <div>
              <Label className="mb-2 block">DDD</Label>
              <Input
                value={ddd}
                onChange={(e) => setDdd(e.target.value.replace(/\D/g, '').substring(0, 2))}
                placeholder="81"
                maxLength={2}
                required
                disabled={isLoading}
                className="text-center"
              />
            </div>
            <div className="col-span-1">
              <Label className="mb-2 block">Número</Label>
              <Input
                value={numero}
                onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').substring(0, 9))}
                placeholder="999999999"
                maxLength={9}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {ddd && numero && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-900 font-semibold">
                Número completo: +55 {ddd} {numero}
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!ddd || !numero || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Iniciar Conversa'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
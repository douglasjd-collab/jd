import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Contact, Check, Loader2 } from 'lucide-react';

// Modal de salvar/editar contato no CRM, aberto a partir da conversa.
export default function SalvarContatoCrmDialog({
  open,
  onOpenChange,
  conversa,
  nome,
  onNomeChange,
  onSalvar,
  salvando,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Contact className="w-4 h-4" />
            Editar contato
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-slate-600">Telefone</Label>
            <p className="text-sm font-medium mt-0.5">{conversa?.cliente_telefone}</p>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Nome do contato</Label>
            <Input
              value={nome}
              onChange={e => onNomeChange(e.target.value)}
              placeholder="Ex: João Silva"
              className="mt-1"
              onKeyDown={e => e.key === 'Enter' && onSalvar()}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
          <Button onClick={onSalvar} disabled={salvando || !String(nome || '').trim()} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
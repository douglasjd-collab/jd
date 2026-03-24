import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function SelecionarStatusModal({ open, onOpenChange, tarefa, statusList, onUpdate }) {
  if (!tarefa) return null;

  const handleStatusChange = async (novoStatus) => {
    await onUpdate(tarefa.id, { status: novoStatus });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Alterar Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {statusList.map(status => (
            <Button
              key={status.slug || status.id}
              onClick={() => handleStatusChange(status.slug || status.nome)}
              variant={tarefa.status === (status.slug || status.nome) ? 'default' : 'outline'}
              className="w-full h-12 justify-start gap-3 text-sm font-medium"
              style={tarefa.status === (status.slug || status.nome) ? {} : { color: 'inherit' }}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: status.cor || '#3b82f6' }}
              />
              <span>{status.nome}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
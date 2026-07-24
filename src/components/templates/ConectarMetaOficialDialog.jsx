import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import LoginMetaOficialButton from '@/components/configuracoes/LoginMetaOficialButton';

export default function ConectarMetaOficialDialog({ open, onOpenChange, empresaId, onSuccess }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Conectar API Oficial da Meta</DialogTitle>
          <DialogDescription className="text-xs">
            Conecte sua conta WhatsApp Business Platform para criar e enviar templates para aprovação da Meta.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <LoginMetaOficialButton empresaId={empresaId} onSuccess={onSuccess} />
          <div className="mt-3 text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-3 rounded-md">
            <strong className="block mb-1 text-amber-800">Como funciona:</strong>
            1. Clique em "Fazer Login com a Meta".<br />
            2. Autorize o número desejado na janela do Facebook.<br />
            3. Após autorizar, a conexão aparecerá automaticamente nesta tela.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
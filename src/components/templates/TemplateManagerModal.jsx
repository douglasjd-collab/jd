import React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import TemplateManagerContent from './TemplateManagerContent';

/**
 * Wrapper do gerenciador de Templates em formato Sheet (drawer lateral).
 * Reaproveita o mesmo conteúdo usado de forma embedded na aba Templates do
 * módulo Campanhas — mantendo toda a lógica/sincronização em um único lugar.
 */
export default function TemplateManagerModal({ open, onOpenChange, empresaId, user }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(1200px,95vw)] sm:max-w-none p-0 flex flex-col"
      >
        <TemplateManagerContent
          empresaId={empresaId}
          user={user}
          onRequestClose={() => onOpenChange(false)}
          defaultTab="criar"
        />
      </SheetContent>
    </Sheet>
  );
}
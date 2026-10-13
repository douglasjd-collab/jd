import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2, X } from 'lucide-react';
import PdfVisualizador from '@/components/chat/PdfVisualizador';

export default function PdfMensagemDialog({ open, onOpenChange, url, nome, isPdf, mensagemId, baixando, erro, onBaixar }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl w-full h-[90vh] p-0 overflow-hidden flex flex-col [&>button.absolute]:hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-destructive shrink-0" />
          <span className="font-medium text-sm truncate max-w-xs">{nome}</span>
        </div>
        <div className="flex items-center gap-2">
          {url && <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={baixando} onClick={onBaixar}>
            {baixando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {baixando ? 'Baixando...' : 'Baixar'}
          </Button>}
          <button onClick={() => onOpenChange(false)} className="flex items-center justify-center w-8 h-8 rounded-full border border-border hover:bg-muted transition-colors" aria-label="Fechar">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      {erro && <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-xs text-destructive border-b border-border">
        <span className="flex-1 truncate">{erro}</span>
        <button onClick={onBaixar} className="underline">Tentar novamente</button>
      </div>}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {url && isPdf ? <PdfVisualizador url={url} mensagemId={mensagemId} /> : url ?
          <iframe src={url} className="w-full h-full border-0" title={nome} /> :
          <div className="flex items-center justify-center h-full text-muted-foreground"><p>Documento não disponível</p></div>}
      </div>
    </DialogContent>
  </Dialog>;
}
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Download, MapPin, Forward } from 'lucide-react';
import { formatarDataHora, iconeArquivo, formatarBytes } from './helpers';

/**
 * Visualizador inline de PDF dentro do CRM, sem forçar download.
 */
export default function VisualizadorPdf({ mensagem, onFechar, onLocalizarMensagem, onEncaminhar }) {
  if (!mensagem?.arquivo_url) return null;
  const remetenteLabel = mensagem.remetente === 'vendedor' ? 'Enviado' : 'Recebido';
  // Fallback: nome real chega via caption (texto) quando arquivo_nome está vazio
  const nomeExibicao = mensagem.arquivo_nome
    || (mensagem.texto && mensagem.texto.trim() ? mensagem.texto.trim() : 'Documento.pdf');

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span>{iconeArquivo(nomeExibicao)}</span>
            <span className="truncate font-medium" title={nomeExibicao}>{nomeExibicao}</span>
            <span className="text-white/60 hidden sm:inline">· {formatarBytes(mensagem.arquivo_tamanho)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a href={mensagem.arquivo_url} download={nomeExibicao} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 gap-1">
                <Download className="h-4 w-4" /> Baixar
              </Button>
            </a>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 gap-1" onClick={() => { onEncaminhar?.(mensagem); onFechar(); }}>
              <Forward className="h-4 w-4" /> Encaminhar
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 gap-1" onClick={() => onLocalizarMensagem?.(mensagem.id)}>
              <MapPin className="h-4 w-4" /> Localizar
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={onFechar}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 bg-slate-200 overflow-hidden">
          <iframe
            src={mensagem.arquivo_url}
            title={nomeExibicao}
            className="w-full h-full"
            style={{ minHeight: '70vh', border: 0 }}
          />
        </div>
        <div className="px-4 py-2 bg-slate-100 text-xs text-slate-600 flex items-center gap-3 flex-wrap">
          <span>{remetenteLabel}</span>
          <span>•</span>
          <span>{formatarDataHora(mensagem.data_envio || mensagem.created_date)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
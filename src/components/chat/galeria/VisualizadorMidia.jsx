import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Download, MapPin, ZoomIn, ZoomOut } from 'lucide-react';
import { formatarDataHora, ehImagem, ehVideo } from './helpers';

const AVATARES_REMETENTE = {
  cliente: '🧑',
  vendedor: '🧑‍💼',
};

/**
 * Lightbox para imagens e vídeos da galeria. Permite navegar entre os itens,
 * ampliar imagens, reproduzir vídeos e chamar "localizar na conversa".
 */
export default function VisualizadorMidia({ midias, indiceInicial, onFechar, onLocalizarMensagem }) {
  const [indice, setIndice] = useState(indiceInicial || 0);
  const [zoom, setZoom] = useState(1);

  const midia = midias[indice];

  const proximo = useCallback(() => {
    setIndice(i => (i + 1) % midias.length);
    setZoom(1);
  }, [midias.length]);

  const anterior = useCallback(() => {
    setIndice(i => (i - 1 + midias.length) % midias.length);
    setZoom(1);
  }, [midias.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') proximo();
      else if (e.key === 'ArrowLeft') anterior();
      else if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [proximo, anterior, onFechar]);

  if (!midia) return null;
  const isImg = ehImagem(midia);
  const isVid = ehVideo(midia);
  const remetenteLabel = midia.remetente === 'vendedor' ? 'Enviado' : 'Recebido';

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/50 text-white text-xs">
          <span>{indice + 1} de {midias.length}</span>
          <div className="flex items-center gap-2">
            {isImg && (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setZoom(z => Math.max(z - 0.25, 1))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </>
            )}
            <a href={midia.arquivo_url} download={midia.arquivo_nome || 'midia'} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 gap-1">
                <Download className="h-4 w-4" /> Baixar
              </Button>
            </a>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 gap-1" onClick={() => onLocalizarMensagem?.(midia.id)}>
              <MapPin className="h-4 w-4" /> Localizar
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={onFechar}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="relative flex-1 flex items-center justify-center overflow-auto bg-black">
          {isImg ? (
            <img
              src={midia.arquivo_url}
              alt={midia.arquivo_nome || 'Mídia'}
              className="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
              style={{ transform: `scale(${zoom})`, cursor: zoom > 1 ? 'zoom-in' : 'default' }}
            />
          ) : isVid ? (
            <video
              src={midia.arquivo_url}
              controls
              autoPlay
              className="max-w-full max-h-full"
            />
          ) : (
            <div className="text-white text-center p-6">
              <p className="text-sm">Formato não suportado para visualização.</p>
              <a href={midia.arquivo_url} download className="text-blue-300 underline mt-2 inline-block">Baixar arquivo</a>
            </div>
          )}

          {midias.length > 1 && (
            <>
              <button onClick={anterior} className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button onClick={proximo} className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-4 py-2 bg-black/50 text-white text-xs flex items-center gap-3">
          <span>{AVATARES_REMETENTE[midia.remetente] || '•'} {remetenteLabel}</span>
          <span className="text-white/60">•</span>
          <span>{formatarDataHora(midia.data_envio || midia.created_date)}</span>
          {midia.arquivo_nome && (
            <>
              <span className="text-white/60">•</span>
              <span className="truncate">{midia.arquivo_nome}</span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';

export default function ImagemZoom({ url, onClose, onDownload }) {
  const [zoom, setZoom] = useState(1);
  return createPortal(
    <div className="fixed inset-0 bg-black/90 z-[9999] flex flex-col" role="dialog" aria-label="Visualizar imagem">
      <div className="flex items-center justify-end gap-3 p-3 text-white bg-black/50">
        <button aria-label="Diminuir zoom" onClick={() => setZoom(z => Math.max(.25, Math.round((z - .05) * 100) / 100))}><ZoomOut /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Aumentar zoom" onClick={() => setZoom(z => Math.min(5, Math.round((z + .05) * 100) / 100))}><ZoomIn /></button>
        <button aria-label="Restaurar tamanho" onClick={() => setZoom(1)}><RotateCcw /></button>
        {onDownload && <button aria-label="Baixar imagem" onClick={onDownload}><Download /></button>}
        <button aria-label="Fechar imagem" onClick={onClose}><X /></button>
      </div>
      <div className="flex-1 overflow-auto p-4" onClick={onClose}>
        <img src={url} alt="Imagem ampliada" onClick={e => e.stopPropagation()}
          onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
          style={{ display: 'block', margin: 'auto', width: `${zoom * 100}%`, maxWidth: 'none', maxHeight: 'none', cursor: 'zoom-in' }} />
      </div>
    </div>, document.body
  );
}

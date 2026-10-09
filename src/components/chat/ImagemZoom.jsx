import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, Loader2, AlertCircle } from 'lucide-react';

/**
 * Lightbox de imagem com zoom e arraste (pan) reais:
 * - cursor "mão aberta" (grab) sobre a imagem ampliada;
 * - ao clicar e segurar, vira "mão fechada" (grabbing) e arrasta o documento;
 * - após aumentar o zoom, o arraste funciona automaticamente, sem botão extra;
 * - o zoom escolhido é mantido durante a movimentação e todas as bordas ficam
 *   acessíveis (o deslocamento é limitado para a imagem nunca sair da vista);
 * - texto e arraste nativo da imagem são bloqueados durante o movimento;
 * - soltar o mouse encerra o movimento.
 *
 * Download: mostra "Baixando..." durante o processo e, em caso de falha, apresenta
 * o erro e permite tentar novamente. Um clique gera apenas um download.
 */
export default function ImagemZoom({ url, onClose, onDownload }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [arrastando, setArrastando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [erroDownload, setErroDownload] = useState('');

  const inicioArraste = useRef(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Reset ao reabrir a imagem
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [url]);

  // Limita o deslocamento para a imagem nunca sair completamente da vista,
  // permitindo alcançar todas as bordas do documento.
  const clampOffset = useCallback((nx, ny) => {
    const img = imgRef.current;
    const cont = containerRef.current;
    if (!img || !cont) return { x: nx, y: ny };
    const rect = img.getBoundingClientRect();
    const contW = cont.clientWidth;
    const contH = cont.clientHeight;
    if (rect.width <= contW && rect.height <= contH) return { x: 0, y: 0 };
    const maxX = Math.max(0, (rect.width - contW) / 2);
    const maxY = Math.max(0, (rect.height - contH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  }, []);

  const alterarZoom = useCallback((ajustar) => {
    setZoom((z) => {
      const novo = Math.max(1, Math.min(5, Math.round(ajustar(z) * 100) / 100));
      setOffset((off) => {
        const clamped = novo <= 1 ? { x: 0, y: 0 } : clampOffset(off.x, off.y);
        return clamped;
      });
      return novo;
    });
  }, [clampOffset]);

  // --- Arraste via pointer events (mouse e touch) ---
  const onPointerDown = (e) => {
    if (zoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setArrastando(true);
    inicioArraste.current = { x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    if (!arrastando || !inicioArraste.current) return;
    e.preventDefault();
    const dx = e.clientX - inicioArraste.current.x;
    const dy = e.clientY - inicioArraste.current.y;
    inicioArraste.current = { x: e.clientX, y: e.clientY };
    setOffset((prev) => {
      const clamped = clampOffset(prev.x + dx, prev.y + dy);
      return clamped;
    });
  };

  const encerrarArraste = useCallback(() => {
    setArrastando(false);
    inicioArraste.current = null;
  }, []);

  useEffect(() => {
    if (!arrastando) return;
    const terminar = () => encerrarArraste();
    window.addEventListener('pointerup', terminar);
    window.addEventListener('pointercancel', terminar);
    return () => {
      window.removeEventListener('pointerup', terminar);
      window.removeEventListener('pointercancel', terminar);
    };
  }, [arrastando, encerrarArraste]);

  // Teclado: Esc fecha
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cursor = zoom <= 1 ? 'zoom-in' : (arrastando ? 'grabbing' : 'grab');

  const handleBaixar = async () => {
    if (baixando) return;
    setBaixando(true);
    setErroDownload('');
    try {
      let resultado;
      if (onDownload) {
        resultado = await onDownload();
      } else {
        const { baixarArquivo } = await import('./baixarArquivo');
        resultado = await baixarArquivo(url, 'imagem');
      }
      if (resultado === false) setErroDownload('Não foi possível baixar a imagem. Tente novamente.');
    } catch {
      setErroDownload('Não foi possível baixar a imagem. Tente novamente.');
    } finally {
      setBaixando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/90 z-[9999] flex flex-col" role="dialog" aria-label="Visualizar imagem">
      <div className="flex items-center justify-end gap-3 p-3 text-white bg-black/50">
        <button aria-label="Diminuir zoom" onClick={() => alterarZoom((z) => z - 0.25)}><ZoomOut /></button>
        <span className="min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
        <button aria-label="Aumentar zoom" onClick={() => alterarZoom((z) => z + 0.25)}><ZoomIn /></button>
        <button aria-label="Restaurar tamanho" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><RotateCcw /></button>
        <button
          aria-label="Baixar imagem"
          title={baixando ? 'Baixando...' : 'Baixar imagem'}
          disabled={baixando}
          onClick={handleBaixar}
          className="inline-flex items-center gap-1.5 px-2"
        >
          {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="text-sm">{baixando ? 'Baixando...' : 'Baixar'}</span>
        </button>
        <button aria-label="Fechar imagem" onClick={onClose}><X /></button>
      </div>

      {erroDownload && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 bg-red-600/20 text-red-200 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{erroDownload}</span>
          <button onClick={() => setErroDownload('')} className="underline hover:text-white">Tentar novamente</button>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        onClick={onClose}
        style={{ touchAction: 'none' }}
      >
        <img
          ref={imgRef}
          src={url}
          alt="Imagem ampliada"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={encerrarArraste}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => alterarZoom((z) => (z === 1 ? 2 : 1))}
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: arrastando ? 'none' : 'transform 0.15s ease-out',
            cursor,
            userSelect: 'none',
            touchAction: 'none',
          }}
        />
      </div>
    </div>, document.body
  );
}
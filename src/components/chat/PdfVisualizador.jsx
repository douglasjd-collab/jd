import React, { useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export default function PdfVisualizador({ url }) {
  const container = useRef(null);
  const canvas = useRef(null);
  const drag = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 600, height: 700 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let disposed = false, loading;
    setPdf(null); setPage(1); setZoom(1); setError(''); setBusy(true);
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      loading = pdfjs.getDocument({ url, isEvalSupported: false });
      const document = await loading.promise;
      if (!disposed) setPdf(document);
    })().catch(() => {
      if (!disposed) { setError('Não foi possível abrir o PDF. Tente novamente ou use Baixar.'); setBusy(false); }
    });
    return () => { disposed = true; loading?.destroy(); };
  }, [url]);

  useEffect(() => {
    const node = container.current;
    const observer = new ResizeObserver(([entry]) => setSize({
      width: entry.contentRect.width, height: entry.contentRect.height,
    }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let disposed = false, renderTask;
    setBusy(true); setError('');
    (async () => {
      const documentPage = await pdf.getPage(page);
      if (disposed) return;
      const base = documentPage.getViewport({ scale: 1 });
      const fit = Math.min(Math.max(100, size.width - 32) / base.width, Math.max(100, size.height - 32) / base.height);
      const view = documentPage.getViewport({ scale: fit * zoom });
      const node = canvas.current;
      // Cap backing pixels to avoid excessive memory on high zoom.
      const ratio = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(view.width, view.height));
      node.width = Math.ceil(view.width * ratio);
      node.height = Math.ceil(view.height * ratio);
      node.style.width = view.width + 'px';
      node.style.height = view.height + 'px';
      renderTask = documentPage.render({
        canvasContext: node.getContext('2d'), viewport: view,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
      if (!disposed) setBusy(false);
    })().catch(err => {
      if (!disposed && err.name !== 'RenderingCancelledException') {
        setError('Não foi possível exibir esta página.'); setBusy(false);
      }
    });
    return () => { disposed = true; renderTask?.cancel(); };
  }, [pdf, page, zoom, size.width, size.height]);

  const stop = () => { drag.current = null; setDragging(false); };
  const reset = () => { setZoom(1); container.current.scrollTo(0, 0); };
  return (
    <div className="h-full flex flex-col min-h-0 relative">
      <div className="flex flex-wrap items-center justify-center gap-2 p-2 border-b bg-slate-50 shrink-0 text-xs">
        <button disabled={!pdf || page <= 1} onClick={() => {setPage(p => p - 1); container.current.scrollTo(0, 0);}} aria-label="Página anterior">◀</button>
        <span>Página {page} de {pdf?.numPages || '…'}</span>
        <button disabled={!pdf || page >= pdf.numPages} onClick={() => {setPage(p => p + 1); container.current.scrollTo(0, 0);}} aria-label="Próxima página">▶</button>
        <button disabled={!pdf || zoom <= 0.5} onClick={() => setZoom(z => Math.max(.5, Math.round((z - .1) * 100) / 100))} aria-label="Diminuir zoom" className="border rounded px-2 py-1">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button disabled={!pdf || zoom >= 5} onClick={() => setZoom(z => Math.min(5, Math.round((z + .1) * 100) / 100))} aria-label="Aumentar zoom" className="border rounded px-2 py-1">+</button>
        <button onClick={reset} className="border rounded px-2 py-1">Ajustar</button>
        <span>Segure e arraste para mover</span>
      </div>
      {busy && <p role="status" className="absolute bottom-2 left-2 z-10 bg-white rounded px-2 py-1 text-xs pointer-events-none">Carregando página…</p>}
      {error && <p role="alert" className="absolute bottom-2 left-2 z-10 bg-white rounded text-xs text-red-600 p-2">{error}</p>}
      <div ref={container} data-jd-pdf-pan className="flex-1 min-h-0 overflow-auto bg-slate-200"
        style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id:e.pointerId, x:e.clientX, y:e.clientY, left:e.currentTarget.scrollLeft, top:e.currentTarget.scrollTop };
          setDragging(true);
        }}
        onPointerMove={e => {
          const start = drag.current; if (!start || start.id !== e.pointerId) return;
          e.currentTarget.scrollLeft = start.left - (e.clientX - start.x);
          e.currentTarget.scrollTop = start.top - (e.clientY - start.y);
        }}
        onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
        <div style={{ minWidth:'100%', minHeight:'100%', width:'max-content', display:'flex', justifyContent:'center', alignItems:'center', padding:16 }}>
          <canvas ref={canvas} aria-label={'Página ' + page + ' do PDF'} style={{ display:'block', flexShrink:0, pointerEvents:'none', background:'white' }} />
        </div>
      </div>
    </div>
  );
}

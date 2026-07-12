import React, { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

const AssinaturaCanvas = forwardRef(function AssinaturaCanvas(_, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  useImperativeHandle(ref, () => ({
    getDataURL: () => (hasContent ? canvasRef.current.toDataURL('image/png') : null),
    isEmpty: () => !hasContent,
  }));

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasContent(true);
  };

  const end = () => {
    drawing.current = false;
  };

  const limpar = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasContent(false);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={500}
        height={180}
        className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={limpar}>
        <Eraser className="w-3.5 h-3.5" /> Limpar assinatura
      </Button>
    </div>
  );
});

export default AssinaturaCanvas;
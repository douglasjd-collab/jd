import React, { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, PenLine } from 'lucide-react';

const AssinaturaCanvas = forwardRef(function AssinaturaCanvas({ nomeSignatario } = {}, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasContent, setHasContent] = useState(false);
  const [metodo, setMetodo] = useState(null); // 'desenho' | 'nome'

  useImperativeHandle(ref, () => ({
    getDataURL: () => (hasContent ? canvasRef.current.toDataURL('image/png') : null),
    isEmpty: () => !hasContent,
    getMetodo: () => metodo,
  }));

  const preencherComNome = () => {
    if (!nomeSignatario) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = 42;
    ctx.font = `italic ${fontSize}px "Segoe Script", "Brush Script MT", cursive`;
    while (ctx.measureText(nomeSignatario).width > canvas.width - 30 && fontSize > 16) {
      fontSize -= 2;
      ctx.font = `italic ${fontSize}px "Segoe Script", "Brush Script MT", cursive`;
    }
    ctx.fillText(nomeSignatario, canvas.width / 2, canvas.height / 2);
    setHasContent(true);
    setMetodo('nome');
  };

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    setMetodo('desenho');
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
    setMetodo(null);
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
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={limpar}>
          <Eraser className="w-3.5 h-3.5" /> Limpar assinatura
        </Button>
        {nomeSignatario && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={preencherComNome}>
            <PenLine className="w-3.5 h-3.5" /> Preencher assinatura com meu nome
          </Button>
        )}
      </div>
    </div>
  );
});

export default AssinaturaCanvas;
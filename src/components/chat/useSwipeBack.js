import { useRef } from 'react';

// Gesto "deslizar para a esquerda" — retorna handlers de toque para anexar ao
// contêiner do chat. Ao deslizar ~70px para a esquerda (movimento majoritariamente
// horizontal, dx dominante sobre dy), dispara onSwipeBack. Ignora rolagem vertical.
export default function useSwipeBack(onSwipeBack) {
  const startX = useRef(null);
  const startY = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
  };
  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const t = e.changedTouches?.[0];
    if (!t) { startX.current = null; return; }
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    startX.current = null;
    startY.current = null;
    if (dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipeBack?.();
  };
  return { onTouchStart, onTouchEnd };
}
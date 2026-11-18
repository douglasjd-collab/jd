import React, { useRef, useState } from 'react';
import { finalizarConversa, reabrirConversa } from './acoesConversa';

// Deslizar o card da conversa no celular:
// - para a esquerda: finaliza a conversa
// - para a direita: reabre a conversa finalizada
const LIMITE_ACAO = 80; // px necessários para confirmar o gesto
const LIMITE_ARRASTO = 110;

export default function ConversaCardSwipe({ conversa, empresaId, queryClient, refetchConversas, children }) {
  const [dx, setDx] = useState(0);
  const inicio = useRef(null);
  const arrastando = useRef(false);
  const bloquearClique = useRef(false);
  const encerrada = conversa.status === 'encerrada';

  const onTouchStart = (e) => {
    const toque = e.touches?.[0];
    if (!toque) return;
    inicio.current = { x: toque.clientX, y: toque.clientY };
    arrastando.current = false;
    bloquearClique.current = false;
  };

  const onTouchMove = (e) => {
    const toque = e.touches?.[0];
    if (!toque || !inicio.current) return;
    const movimentoX = toque.clientX - inicio.current.x;
    const movimentoY = toque.clientY - inicio.current.y;

    if (!arrastando.current) {
      // Só assume o gesto quando o movimento é claramente horizontal.
      if (Math.abs(movimentoX) < 10 || Math.abs(movimentoX) <= Math.abs(movimentoY)) return;
      arrastando.current = true;
      bloquearClique.current = true;
    }

    // Cada conversa aceita apenas o sentido que tem ação.
    setDx(encerrada
      ? Math.min(Math.max(movimentoX, 0), LIMITE_ARRASTO)
      : Math.max(Math.min(movimentoX, 0), -LIMITE_ARRASTO));
  };

  const onTouchEnd = () => {
    const deslocamento = dx;
    arrastando.current = false;
    inicio.current = null;
    setDx(0);

    if (!encerrada && deslocamento <= -LIMITE_ACAO) {
      finalizarConversa(conversa, { empresaId, queryClient, refetchConversas }).catch((erro) => {
        refetchConversas?.();
        console.error('Erro ao finalizar conversa:', erro);
      });
    } else if (encerrada && deslocamento >= LIMITE_ACAO) {
      reabrirConversa(conversa, { empresaId, queryClient, refetchConversas }).catch((erro) => {
        refetchConversas?.();
        console.error('Erro ao reabrir conversa:', erro);
      });
    }

    // Libera o clique depois que o navegador descarta o toque como arrasto.
    setTimeout(() => { bloquearClique.current = false; }, 350);
  };

  return (
    <div
      className={dx <= -20 ? 'jd-swipe-finalizar' : dx >= 20 ? 'jd-swipe-reabrir' : ''}
      style={{
        transform: `translateX(${dx}px)`,
        transition: arrastando.current ? 'none' : 'transform 200ms ease',
        touchAction: 'pan-y',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClickCapture={(e) => {
        if (!bloquearClique.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
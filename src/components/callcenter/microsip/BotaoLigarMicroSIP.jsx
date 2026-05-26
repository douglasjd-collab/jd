import React from 'react';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';

/**
 * Botão reutilizável para ligar via MicroSIP (SIP URI).
 * Pode ser usado em qualquer card/ficha do CRM.
 *
 * Props:
 *   numero: string — número de telefone
 *   clienteNome: string (opcional) — nome para contexto
 *   clienteId: string (opcional) — ID para navegação pós-chamada
 *   variant: 'icon' | 'button' | 'text' (default: 'button')
 *   className: string
 */
export default function BotaoLigarMicroSIP({
  numero,
  clienteNome,
  clienteId,
  variant = 'button',
  className = '',
}) {
  if (!numero) return null;
  const numLimpo = numero.replace(/\D/g, '');
  if (!numLimpo) return null;

  const modoAtivo = localStorage.getItem('callcenter_modo') === 'microsip';

  const handleClick = (e) => {
    e.stopPropagation();
    if (modoAtivo) {
      // Dispara MicroSIP diretamente via URI
      window.location.href = `microsip:${numLimpo}`;
      // Registra via BroadcastChannel para o painel ouvir
      if (window.BroadcastChannel) {
        const ch = new BroadcastChannel('microsip_events');
        ch.postMessage({ type: 'outgoing', numero: numLimpo, clienteNome, clienteId });
        ch.close();
      }
      // Também salva no localStorage para polling
      localStorage.setItem('microsip_outgoing', JSON.stringify({
        numero: numLimpo,
        clienteNome,
        clienteId,
        ts: Date.now(),
      }));
    } else {
      // Modo NVOIP: vai para CallCenter com número na URL
      window.location.href = createPageUrl(`CallCenter?numero=${numLimpo}`);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        title={`Ligar para ${numLimpo}`}
        className={cn(
          'p-1.5 rounded-lg text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors',
          className
        )}
      >
        <Phone className="w-4 h-4" />
      </button>
    );
  }

  if (variant === 'text') {
    return (
      <button
        onClick={handleClick}
        className={cn('flex items-center gap-1 text-green-600 hover:underline text-sm', className)}
      >
        <Phone className="w-3.5 h-3.5" />
        {numero}
      </button>
    );
  }

  // variant === 'button'
  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors',
        className
      )}
    >
      <Phone className="w-3.5 h-3.5" />
      Ligar
    </button>
  );
}
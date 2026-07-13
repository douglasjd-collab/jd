import React, { useState, useEffect } from 'react';
import { PhoneOff, PhoneCall, Phone, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DapiCallBar({ status, erro, clienteNome, mutado, onEncerrar, onMutar }) {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (status !== 'connected') { setSegundos(0); return; }
    const interval = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (!status || status === 'idle' || status === 'ended') return null;

  const formatarTempo = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const emLigacao = status === 'connected';
  const isErro = status === 'error';

  const statusLabel = isErro
    ? erro || 'Erro na chamada'
    : emLigacao
    ? formatarTempo(segundos)
    : status === 'ringing'
    ? '☎ Tocando...'
    : '⟳ Chamando...';

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 px-4 py-2.5 shrink-0',
      isErro ? 'bg-red-600' : emLigacao ? 'bg-cyan-600' : 'bg-amber-500'
    )}>
      <div className="flex items-center gap-3 text-white min-w-0">
        <div className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
          emLigacao ? 'bg-white/20' : 'bg-white/20 animate-pulse'
        )}>
          {emLigacao ? <Phone className="h-4 w-4" /> : <PhoneCall className="h-4 w-4 animate-pulse" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{clienteNome || 'Chamada via WhatsApp'}</p>
          <p className={cn('text-xs font-mono', emLigacao ? 'text-white/90' : 'text-white/80 animate-pulse')}>
            {statusLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {emLigacao && (
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1.5 text-white hover:bg-white/20 hover:text-white', mutado && 'bg-white/20')}
            onClick={onMutar}
          >
            {mutado ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline text-xs">{mutado ? 'Mudo' : 'Microfone'}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-white hover:bg-red-500/40 hover:text-white"
          onClick={onEncerrar}
        >
          <PhoneOff className="h-3.5 w-3.5" />
          <span className="text-xs">Encerrar</span>
        </Button>
      </div>
    </div>
  );
}
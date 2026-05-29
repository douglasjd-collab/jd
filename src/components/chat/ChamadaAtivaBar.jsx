import React, { useState, useEffect } from 'react';
import { PhoneOff, PhoneCall, Phone, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ChamadaAtivaBar({ chamadaAtiva, onEncerrar }) {
  const [segundos, setSegundos] = useState(0);
  const [mutado, setMutado] = useState(false);

  useEffect(() => {
    if (!chamadaAtiva || chamadaAtiva.status !== 'em_ligacao') {
      setSegundos(0);
      return;
    }
    const interval = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [chamadaAtiva?.status]);

  // Reset mudo ao encerrar
  useEffect(() => { if (!chamadaAtiva) setMutado(false); }, [chamadaAtiva]);

  if (!chamadaAtiva) return null;

  const formatarTempo = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleMutar = () => {
    const s = chamadaAtiva?.session;
    if (!s) return;
    mutado ? s.unmute({ audio: true }) : s.mute({ audio: true });
    setMutado(!mutado);
  };

  const isChamando = chamadaAtiva.status === 'chamando' || chamadaAtiva.status === 'tocando';
  const emLigacao = chamadaAtiva.status === 'em_ligacao';

  const statusLabel = emLigacao
    ? formatarTempo(segundos)
    : chamadaAtiva.status === 'tocando'
    ? '☎ Tocando...'
    : '⟳ Chamando...';

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 px-4 py-2.5 shrink-0',
      emLigacao ? 'bg-green-600' : 'bg-amber-500'
    )}>
      {/* Ícone + info */}
      <div className="flex items-center gap-3 text-white min-w-0">
        <div className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
          emLigacao ? 'bg-white/20' : 'bg-white/20 animate-pulse'
        )}>
          {emLigacao
            ? <Phone className="h-4 w-4" />
            : <PhoneCall className="h-4 w-4 animate-pulse" />
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {chamadaAtiva.clienteNome || chamadaAtiva.destino}
          </p>
          <p className={cn(
            'text-xs font-mono',
            emLigacao ? 'text-white/90' : 'text-white/80 animate-pulse'
          )}>
            {statusLabel}
          </p>
        </div>
      </div>

      {/* Botões */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Microfone — só aparece em ligação ativa */}
        {emLigacao && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 gap-1.5 text-white hover:bg-white/20 hover:text-white',
              mutado && 'bg-white/20'
            )}
            onClick={handleMutar}
          >
            {mutado ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline text-xs">{mutado ? 'Mudo' : 'Microfone'}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-white hover:bg-white/20 hover:text-white"
          onClick={onEncerrar}
        >
          <PhoneOff className="h-3.5 w-3.5" />
          <span className="text-xs">Encerrar</span>
        </Button>
      </div>
    </div>
  );
}
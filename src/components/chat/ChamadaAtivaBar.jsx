import React, { useState, useEffect } from 'react';
import { PhoneOff, PhoneCall, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChamadaAtivaBar({ chamadaAtiva, onEncerrar }) {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (!chamadaAtiva || chamadaAtiva.status !== 'em_ligacao') {
      setSegundos(0);
      return;
    }
    const interval = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [chamadaAtiva, chamadaAtiva?.status]);

  if (!chamadaAtiva) return null;

  const formatarTempo = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const isChamando = chamadaAtiva.status === 'chamando';

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 shrink-0 ${isChamando ? 'bg-amber-500' : 'bg-green-600'}`}>
      <div className="flex items-center gap-2 text-white">
        {isChamando ? (
          <PhoneCall className="h-4 w-4 animate-pulse" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">
          {isChamando ? `Chamando ${chamadaAtiva.destino}...` : `Em ligação com ${chamadaAtiva.destino}`}
        </span>
        {!isChamando && (
          <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded-full">
            {formatarTempo(segundos)}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-white hover:bg-white/20 hover:text-white"
        onClick={onEncerrar}
      >
        <PhoneOff className="h-3.5 w-3.5" />
        Encerrar
      </Button>
    </div>
  );
}
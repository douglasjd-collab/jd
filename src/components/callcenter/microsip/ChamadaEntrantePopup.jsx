import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, PhoneMissed, User, UserPlus, ExternalLink } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';

export default function ChamadaEntrantePopup({ chamadaEntrante, onAtender, onIgnorar }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (!chamadaEntrante) return;
    // Toca ringtone enquanto popup estiver aberto
    const audio = new Audio('https://www.soundjay.com/phone/phone-ringing-04.mp3');
    audio.loop = true;
    audio.volume = 0.6;
    audio.play().catch(() => {});
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [chamadaEntrante?.numero]);

  if (!chamadaEntrante) return null;

  const { numero, clienteNome, clienteId } = chamadaEntrante;
  const numFormatado = numero.replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '+$1 ($2) $3-$4') || numero;

  const abrirFichaCliente = () => {
    if (clienteId) {
      window.location.href = createPageUrl(`ClienteDetalhes?id=${clienteId}`);
    } else {
      window.location.href = createPageUrl(`Clientes?telefone=${numero}`);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] w-80 animate-in slide-in-from-right-4 duration-300">
      <div className="bg-white border-2 border-green-400 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header verde pulsante */}
        <div className="bg-green-500 text-white px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">📞 Chamada Entrante</p>
            <p className="text-green-100 text-xs">MicroSIP recebendo...</p>
          </div>
          {/* Badge pulsante */}
          <span className="w-3 h-3 bg-white rounded-full animate-ping" />
        </div>

        <div className="p-4 space-y-3">
          {/* Identificação */}
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold',
              clienteNome ? 'bg-blue-500' : 'bg-slate-400'
            )}>
              {clienteNome
                ? clienteNome.charAt(0).toUpperCase()
                : <User className="w-6 h-6" />
              }
            </div>
            <div className="flex-1 min-w-0">
              {clienteNome ? (
                <>
                  <p className="font-bold text-slate-800 truncate">{clienteNome}</p>
                  <p className="text-slate-500 text-sm">{numFormatado}</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-800">{numFormatado}</p>
                  <p className="text-amber-600 text-xs font-medium">⚠ Número não encontrado</p>
                </>
              )}
            </div>
          </div>

          {/* Ações rápidas */}
          <div className="flex gap-2">
            <Button
              onClick={onAtender}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white h-9"
            >
              <Phone className="w-4 h-4 mr-1.5" />
              Atender
            </Button>
            <Button
              onClick={onIgnorar}
              variant="outline"
              className="flex-1 border-red-200 text-red-600 hover:bg-red-50 h-9"
            >
              <PhoneMissed className="w-4 h-4 mr-1.5" />
              Ignorar
            </Button>
          </div>

          {/* Link para ficha */}
          <button
            onClick={abrirFichaCliente}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:underline"
          >
            {clienteId
              ? <><ExternalLink className="w-3 h-3" /> Abrir ficha do cliente</>
              : <><UserPlus className="w-3 h-3" /> Cadastrar novo contato</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
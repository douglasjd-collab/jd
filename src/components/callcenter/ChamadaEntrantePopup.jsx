import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, User, UserPlus, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Popup flutuante de chamada entrante — exibido globalmente no Call Center.
 * Suporta: atender, rejeitar, abrir ficha do cliente, criar novo contato.
 */
export default function ChamadaEntrantePopup({ chamadaEntrante, onAtender, onRejeitar }) {
  const [pulso, setPulso] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setPulso(p => !p), 600);
    return () => clearInterval(t);
  }, []);

  if (!chamadaEntrante) return null;

  const { origem, clienteNome, clienteId, buscando } = chamadaEntrante;

  const abrirFichaCliente = () => {
    if (clienteId) window.open(`/ClienteDetalhes?id=${clienteId}`, '_blank');
  };

  const criarNovoContato = () => {
    const num = (origem || '').replace(/\D/g, '');
    window.open(`/Clientes?novo=1&telefone=${num}`, '_blank');
  };

  return (
    <>
      {/* Overlay translúcido */}
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Popup central */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl border-2 border-green-400 w-full max-w-sm mx-4 overflow-hidden">

          {/* Header pulsante */}
          <div className={cn(
            'px-5 py-4 flex items-center gap-4 transition-colors duration-500',
            pulso ? 'bg-green-500' : 'bg-green-600'
          )}>
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Phone className="w-7 h-7 text-white animate-bounce" />
            </div>
            <div className="text-white min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Chamada Recebida</p>
              {buscando ? (
                <p className="text-lg font-bold mt-0.5 opacity-70 animate-pulse">{origem}</p>
              ) : clienteNome ? (
                <>
                  <p className="text-xl font-bold mt-0.5">{clienteNome}</p>
                  <p className="text-sm opacity-75">{origem}</p>
                </>
              ) : (
                <p className="text-xl font-bold mt-0.5">{origem}</p>
              )}
              {buscando && <p className="text-xs opacity-60 mt-0.5 animate-pulse">Identificando...</p>}
              {!buscando && !clienteNome && <p className="text-xs opacity-60 mt-0.5">Número não cadastrado</p>}
            </div>
          </div>

          {/* Botões de ação */}
          <div className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={onAtender}
                className="bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
              >
                <Phone className="w-5 h-5 mr-1.5" /> Atender
              </Button>
              <Button
                onClick={onRejeitar}
                className="bg-red-600 hover:bg-red-700 text-white h-12 text-base font-semibold"
              >
                <PhoneOff className="w-5 h-5 mr-1.5" /> Recusar
              </Button>
            </div>

            {/* Ações secundárias */}
            <div className="grid grid-cols-2 gap-2">
              {clienteId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={abrirFichaCliente}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50 gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir ficha
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={criarNovoContato}
                  className="text-slate-600 border-slate-200 hover:bg-slate-50 gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Novo contato
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRejeitar}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Ignorar chamada
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Phone, PhoneOff, PhoneIncoming, PhoneMissed,
  Mic, MicOff, Wifi, WifiOff, Loader2, RefreshCw,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig = {
  desconectado: { label: 'Desconectado', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: WifiOff },
  conectando:   { label: 'Conectando...', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Loader2 },
  registrado:   { label: 'Online ●',      color: 'bg-green-100 text-green-700 border-green-200',   icon: Wifi },
  erro:         { label: 'Erro SIP',       color: 'bg-red-100 text-red-700 border-red-200',         icon: WifiOff },
};

export default function SoftphonePanel({ softphone, numbersip }) {
  const {
    sipStatus, erroMsg, chamadaAtiva, chamadaEntrante,
    realizarChamada, atenderChamada, rejeitarChamada, encerrarChamada, conectar
  } = softphone;

  const [numero, setNumero] = useState('');
  const [mutado, setMutado] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const timerRef = useRef(null);

  // Timer duração da chamada
  useEffect(() => {
    if (chamadaAtiva?.status === 'em_ligacao') {
      setDuracao(0);
      timerRef.current = setInterval(() => setDuracao(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setDuracao(0);
    }
    return () => clearInterval(timerRef.current);
  }, [chamadaAtiva?.status]);

  // Reseta mutado quando chamada encerra
  useEffect(() => {
    if (!chamadaAtiva) setMutado(false);
  }, [chamadaAtiva]);

  const handleMutar = () => {
    const session = chamadaAtiva?.session;
    if (!session) return;
    mutado ? session.unmute({ audio: true }) : session.mute({ audio: true });
    setMutado(!mutado);
  };

  const handleLigar = () => {
    const num = numero.trim().replace(/\D/g, '');
    if (!num || sipStatus !== 'registrado') return;
    realizarChamada(num);
    setNumero('');
  };

  const formatDuracao = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const cfg = statusConfig[sipStatus] || statusConfig.desconectado;
  const StatusIcon = cfg.icon;

  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col">

      {/* Header */}
      <div className="bg-[#10353C] text-white px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Phone className="w-4 h-4 text-[#23BE84] shrink-0" />
          <span className="font-semibold text-sm">Softphone</span>
          {numbersip && (
            <span className="text-xs text-white/60 truncate">— {numbersip}</span>
          )}
        </div>
        <Badge className={cn('text-xs border shrink-0', cfg.color)}>
          <StatusIcon className={cn('w-3 h-3 mr-1', sipStatus === 'conectando' && 'animate-spin')} />
          {cfg.label}
        </Badge>
      </div>

      <div className="p-4 space-y-3 flex-1">

        {/* === CHAMADA ENTRANTE === */}
        {chamadaEntrante && (
          <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 text-center space-y-3 animate-pulse">
            <div className="w-14 h-14 bg-blue-100 rounded-full mx-auto flex items-center justify-center">
              <PhoneIncoming className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-blue-500 uppercase tracking-wide font-semibold">Chamada Entrante</p>
              <p className="font-bold text-blue-900 text-xl mt-1">{chamadaEntrante.origem}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={atenderChamada} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                <Phone className="w-4 h-4 mr-1" /> Atender
              </Button>
              <Button onClick={rejeitarChamada} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                <PhoneMissed className="w-4 h-4 mr-1" /> Rejeitar
              </Button>
            </div>
          </div>
        )}

        {/* === CHAMADA ATIVA === */}
        {chamadaAtiva && !chamadaEntrante && (
          <div className="bg-slate-900 text-white rounded-xl p-4 text-center space-y-3">
            <div className={cn(
              'w-16 h-16 rounded-full mx-auto flex items-center justify-center',
              chamadaAtiva.status === 'em_ligacao' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'
            )}>
              <Phone className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-xl tracking-wide">{chamadaAtiva.destino}</p>
              <p className="text-slate-400 text-xs mt-1">
                {chamadaAtiva.direcao === 'saida' ? '↗ Saída' : '↙ Entrada'}
              </p>
            </div>

            {chamadaAtiva.status === 'em_ligacao' ? (
              <p className="text-3xl font-mono text-green-400 tabular-nums">{formatDuracao(duracao)}</p>
            ) : (
              <p className="text-amber-300 text-sm animate-pulse">⟳ Chamando...</p>
            )}

            <div className="flex gap-2 mt-2">
              <Button
                onClick={handleMutar}
                variant="outline"
                size="sm"
                className={cn(
                  'flex-1 border-white/20 text-white hover:bg-white/10 bg-transparent',
                  mutado && 'bg-red-600/40 border-red-400 text-red-200'
                )}
              >
                {mutado ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
                {mutado ? 'Mudo' : 'Mic'}
              </Button>
              <Button
                onClick={encerrarChamada}
                size="sm"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <PhoneOff className="w-4 h-4 mr-1" /> Encerrar
              </Button>
            </div>
          </div>
        )}

        {/* === DISCADOR === */}
        {!chamadaAtiva && !chamadaEntrante && (
          <div className="space-y-3">

            {/* Input + botão ligar */}
            <div className="flex gap-2">
              <Input
                placeholder="DDD + número"
                value={numero}
                onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleLigar()}
                className="flex-1 text-base"
                autoFocus
              />
              <Button
                onClick={handleLigar}
                disabled={!numero.trim() || sipStatus !== 'registrado'}
                className="bg-green-600 hover:bg-green-700 text-white px-4 disabled:opacity-40"
              >
                <Phone className="w-4 h-4" />
              </Button>
            </div>

            {/* Teclado numérico */}
            <div className="grid grid-cols-3 gap-1.5">
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                <button
                  key={d}
                  onClick={() => setNumero(prev => prev + d)}
                  className="h-10 rounded-lg border bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-semibold text-sm transition-colors select-none"
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Status messages */}
            {sipStatus === 'conectando' && (
              <p className="text-xs text-yellow-600 text-center animate-pulse">
                ⟳ Conectando ao servidor SIP NVOIP...
              </p>
            )}
            {sipStatus === 'registrado' && (
              <p className="text-xs text-green-600 text-center font-medium">
                ✓ WebRTC ativo — ligações diretas no navegador
              </p>
            )}
            {(sipStatus === 'erro' || sipStatus === 'desconectado') && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800 space-y-1.5">
                {erroMsg ? (
                  <p className="font-semibold">{erroMsg}</p>
                ) : (
                  <p className="font-semibold">⚠️ SIP desconectado</p>
                )}
                <p className="text-orange-700">
                  Verifique se a <strong>senha SIP</strong> está configurada em "Meu Ramal".
                </p>
                <button
                  onClick={conectar}
                  className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                >
                  <RefreshCw className="w-3 h-3" /> Tentar reconectar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
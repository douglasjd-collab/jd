import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Phone, PhoneOff, PhoneIncoming,
  Mic, MicOff, Wifi, WifiOff, Loader2, RefreshCw, Radio, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ChamadaEntrantePopup from './ChamadaEntrantePopup';

const STATUS_CFG = {
  desconectado: { label: 'Desconectado',  color: 'bg-slate-100 text-slate-500',   icon: WifiOff,  dot: 'bg-slate-400' },
  conectando:   { label: 'Conectando...',  color: 'bg-yellow-100 text-yellow-700', icon: Loader2,  dot: 'bg-yellow-400' },
  registrado:   { label: 'Pronto',         color: 'bg-green-100 text-green-700',   icon: Wifi,     dot: 'bg-green-500' },
  erro:         { label: 'Erro SIP',       color: 'bg-red-100 text-red-700',       icon: WifiOff,  dot: 'bg-red-500' },
};

export default function SoftphonePanel({ softphone, numbersip, numeroChip }) {
  const {
    sipStatus, erroMsg,
    chamadaAtiva, chamadaEntrante,
    realizarChamada, atenderChamada, rejeitarChamada, encerrarChamada, conectar,
  } = softphone;

  const [numero, setNumero] = useState('');
  const [mutado, setMutado] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const timerRef = useRef(null);

  // Timer
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

  // Reset mudo ao encerrar
  useEffect(() => { if (!chamadaAtiva) setMutado(false); }, [chamadaAtiva]);

  const handleMutar = () => {
    const s = chamadaAtiva?.session;
    if (!s) return;
    mutado ? s.unmute({ audio: true }) : s.mute({ audio: true });
    setMutado(!mutado);
  };

  const handleLigar = () => {
    const num = numero.replace(/\D/g, '');
    if (!num || sipStatus !== 'registrado') return;
    realizarChamada(num);
    setNumero('');
  };

  const fmtDuracao = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const cfg = STATUS_CFG[sipStatus] || STATUS_CFG.desconectado;
  const StatusIcon = cfg.icon;

  return (
    <>
    {/* Popup global de chamada entrante */}
    <ChamadaEntrantePopup
      chamadaEntrante={chamadaEntrante}
      onAtender={atenderChamada}
      onRejeitar={rejeitarChamada}
    />

    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">

      {/* Header */}
      <div className="bg-[#10353C] px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="w-4 h-4 text-[#23BE84] shrink-0" />
          <span className="font-semibold text-sm text-white">Webphone NVOIP</span>
          {numbersip && <span className="text-xs text-white/50 truncate">— {numbersip}</span>}
        </div>
        <Badge className={cn('text-xs border-0 shrink-0 gap-1', cfg.color)}>
          <span className={cn('w-2 h-2 rounded-full inline-block', cfg.dot, sipStatus === 'conectando' && 'animate-pulse')} />
          {cfg.label}
        </Badge>
      </div>

      <div className="p-4 space-y-3 flex-1">

        {/* Chamada entrante: tratada pelo popup global ChamadaEntrantePopup */}
        {chamadaEntrante && (
          <div className="border-2 border-green-400 bg-green-50 rounded-xl p-3 text-center">
            <div className="flex items-center gap-2 justify-center text-green-700">
              <PhoneIncoming className="w-5 h-5 animate-bounce" />
              <span className="font-semibold text-sm">
                {chamadaEntrante.clienteNome || chamadaEntrante.origem} — ligando...
              </span>
            </div>
          </div>
        )}

        {/* ── CHAMADA ATIVA ── */}
        {chamadaAtiva && !chamadaEntrante && (
          <div className="bg-slate-900 text-white rounded-xl p-5 text-center space-y-3">
            <div className={cn(
              'w-16 h-16 rounded-full mx-auto flex items-center justify-center',
              chamadaAtiva.status === 'em_ligacao' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'
            )}>
              <Phone className="w-8 h-8" />
            </div>
            <div>
              {chamadaAtiva.clienteNome && (
                <p className="text-green-300 text-sm font-semibold">{chamadaAtiva.clienteNome}</p>
              )}
              <p className="font-bold text-xl tracking-wide">{chamadaAtiva.destino}</p>
              <p className="text-slate-400 text-xs mt-0.5">
                {chamadaAtiva.direcao === 'saida' ? '↗ Saída' : '↙ Entrada'}
              </p>
            </div>
            {chamadaAtiva.status === 'em_ligacao'
              ? <p className="text-3xl font-mono text-green-400 tabular-nums">{fmtDuracao(duracao)}</p>
              : <p className="text-amber-300 text-sm animate-pulse">⟳ Chamando...</p>
            }
            <div className="flex gap-2">
              <Button
                onClick={handleMutar}
                variant="outline"
                size="sm"
                className={cn(
                  'flex-1 border-white/20 text-white hover:bg-white/10 bg-transparent',
                  mutado && 'bg-red-600/40 border-red-400'
                )}
              >
                {mutado ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
                {mutado ? 'Mudo' : 'Microfone'}
              </Button>
              <Button onClick={encerrarChamada} size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                <PhoneOff className="w-4 h-4 mr-1" /> Encerrar
              </Button>
            </div>
          </div>
        )}

        {/* Aviso: numero_chip desvia chamadas para celular físico */}
        {numeroChip && sipStatus === 'registrado' && !chamadaAtiva && !chamadaEntrante && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">Chamadas sendo desviadas para celular!</p>
              <p className="mt-0.5">O campo <strong>"Número Chip"</strong> está preenchido ({numeroChip}). O NVOIP encaminha chamadas entrantes para esse número em vez do Webphone. Para receber aqui, limpe esse campo em <strong>"Meu Ramal"</strong>.</p>
            </div>
          </div>
        )}

        {/* ── DISCADOR ── */}
        {!chamadaAtiva && !chamadaEntrante && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="DDD + número"
                value={numero}
                onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleLigar()}
                className="flex-1 text-base"
                autoFocus
                disabled={sipStatus !== 'registrado'}
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
                  onClick={() => setNumero(p => p + d)}
                  disabled={sipStatus !== 'registrado'}
                  className="h-10 rounded-lg border bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-semibold text-sm transition-colors disabled:opacity-30 select-none"
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Status messages */}
            {sipStatus === 'registrado' && (
              <p className="text-xs text-green-600 text-center font-medium">
                ✓ Registrado — ligações com áudio direto no navegador
              </p>
            )}
            {sipStatus === 'conectando' && (
              <p className="text-xs text-yellow-600 text-center animate-pulse">
                ⟳ Conectando ao servidor SIP NVOIP...
              </p>
            )}
            {(sipStatus === 'erro' || sipStatus === 'desconectado') && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2">
                <p className="font-semibold">
                  {erroMsg || (sipStatus === 'erro' ? '⚠️ Falha na conexão SIP' : 'Softphone desconectado')}
                </p>
                {!erroMsg?.includes('Senha SIP') && (
                  <p className="text-red-700">Verifique se a <strong>Senha SIP</strong> está configurada em "Meu Ramal".</p>
                )}
                <button
                  onClick={conectar}
                  className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                >
                  <RefreshCw className="w-3 h-3" /> Reconectar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alerta offline */}
      {(sipStatus === 'erro' || sipStatus === 'desconectado') && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Webphone offline. Chamadas recebidas não chegarão no CRM.</span>
        </div>
      )}

      {/* Modo info */}
      <div className="px-4 py-2 border-t bg-slate-50 text-xs text-slate-400 text-center">
        Webphone WebRTC — INVITE SIP direto • wss://app.nvoip.com.br:7443
      </div>
    </div>
    </>
  );
}
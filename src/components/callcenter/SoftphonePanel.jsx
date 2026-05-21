import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Phone, PhoneOff, PhoneIncoming, PhoneMissed,
  Mic, MicOff, Wifi, WifiOff, Loader2, Hash
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig = {
  desconectado: { label: 'Desconectado', color: 'bg-slate-100 text-slate-600', icon: WifiOff },
  conectando:   { label: 'Conectando...', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  registrado:   { label: 'Online', color: 'bg-green-100 text-green-700', icon: Wifi },
  erro:         { label: 'Erro SIP', color: 'bg-red-100 text-red-700', icon: WifiOff },
};

export default function SoftphonePanel({ softphone, numbersip }) {
  const {
    sipStatus, chamadaAtiva, chamadaEntrante,
    realizarChamada, atenderChamada, rejeitarChamada, encerrarChamada
  } = softphone;

  const [numero, setNumero] = useState('');
  const [mutado, setMutado] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const timerRef = useRef(null);

  // Timer de duração
  useEffect(() => {
    if (chamadaAtiva?.status === 'em_ligacao') {
      timerRef.current = setInterval(() => setDuracao(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setDuracao(0);
    }
    return () => clearInterval(timerRef.current);
  }, [chamadaAtiva?.status]);

  const handleMutar = () => {
    const session = chamadaAtiva?.session;
    if (!session) return;
    if (mutado) {
      session.unmute({ audio: true });
    } else {
      session.mute({ audio: true });
    }
    setMutado(!mutado);
  };

  const handleLigar = () => {
    if (!numero.trim()) return;
    realizarChamada(numero.trim());
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
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#10353C] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-[#23BE84]" />
          <span className="font-semibold text-sm">Softphone</span>
          {numbersip && (
            <span className="text-xs text-white/60">— {numbersip}</span>
          )}
        </div>
        <Badge className={cn('text-xs', cfg.color)}>
          <StatusIcon className={cn('w-3 h-3 mr-1', sipStatus === 'conectando' && 'animate-spin')} />
          {cfg.label}
        </Badge>
      </div>

      <div className="p-4 space-y-4">

        {/* Chamada Entrante */}
        {chamadaEntrante && (
          <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-center space-y-3 animate-pulse">
            <PhoneIncoming className="w-8 h-8 text-blue-600 mx-auto" />
            <div>
              <p className="font-bold text-blue-800 text-lg">{chamadaEntrante.origem}</p>
              <p className="text-blue-600 text-sm">Chamada entrante...</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={atenderChamada}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Phone className="w-4 h-4 mr-2" />
                Atender
              </Button>
              <Button
                onClick={rejeitarChamada}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <PhoneMissed className="w-4 h-4 mr-2" />
                Rejeitar
              </Button>
            </div>
          </div>
        )}

        {/* Chamada Ativa */}
        {chamadaAtiva && !chamadaEntrante && (
          <div className="bg-slate-900 text-white rounded-xl p-4 text-center space-y-3">
            <div className={cn(
              'w-14 h-14 rounded-full mx-auto flex items-center justify-center',
              chamadaAtiva.status === 'em_ligacao' ? 'bg-green-500' : 'bg-yellow-500'
            )}>
              <Phone className="w-7 h-7" />
            </div>
            <div>
              <p className="font-bold text-lg">{chamadaAtiva.destino}</p>
              <p className="text-slate-400 text-sm">
                {chamadaAtiva.direcao === 'saida' ? '↗ Saída' : '↙ Entrada'}
              </p>
            </div>
            {chamadaAtiva.status === 'em_ligacao' ? (
              <p className="text-2xl font-mono text-green-400">{formatDuracao(duracao)}</p>
            ) : (
              <p className="text-yellow-300 text-sm animate-pulse">Chamando...</p>
            )}
            <div className="flex gap-3">
              <Button
                onClick={handleMutar}
                variant="outline"
                className={cn(
                  'flex-1 border-white/20 text-white hover:bg-white/10',
                  mutado && 'bg-red-600/30 border-red-400'
                )}
              >
                {mutado ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {mutado ? 'Mudo' : 'Microfone'}
              </Button>
              <Button
                onClick={encerrarChamada}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                Encerrar
              </Button>
            </div>
          </div>
        )}

        {/* Discador — só mostra quando não há chamada ativa */}
        {!chamadaAtiva && !chamadaEntrante && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Digite o número (DDD + número)"
                value={numero}
                onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleLigar()}
                disabled={sipStatus !== 'registrado'}
                className="flex-1"
              />
              <Button
                onClick={handleLigar}
                disabled={!numero.trim() || sipStatus !== 'registrado'}
                className="bg-green-600 hover:bg-green-700 text-white px-4"
              >
                <Phone className="w-4 h-4" />
              </Button>
            </div>

            {/* Teclado numérico */}
            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                <button
                  key={d}
                  onClick={() => setNumero(prev => prev + d)}
                  disabled={sipStatus !== 'registrado'}
                  className="h-10 rounded-lg border bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-sm disabled:opacity-40 transition-colors"
                >
                  {d}
                </button>
              ))}
            </div>

            {sipStatus !== 'registrado' && (
              <p className="text-xs text-slate-400 text-center">
                {sipStatus === 'conectando' ? 'Conectando ao servidor SIP...' :
                 sipStatus === 'erro' ? 'Erro na conexão SIP. Verifique a Senha SIP nas configurações.' :
                 'Configure a Senha SIP para ativar chamadas de voz.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
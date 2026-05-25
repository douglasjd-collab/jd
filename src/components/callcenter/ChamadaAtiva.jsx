import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhoneOff, Loader2, Phone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const statusLabel = {
  calling_origin:      '📲 Aguarde — NVOIP ligando para seu celular...',
  calling_destination: '📞 Celular atendeu — ligando para o cliente...',
  established:         '✅ Chamada conectada com o cliente',
  noanswer:            '❌ Não atendida pelo celular',
  busy:                '📞 Ocupado',
  finished:            'Chamada encerrada',
  failed:              '❌ Falha na chamada',
};

const statusColor = {
  calling_origin:      'bg-yellow-100 text-yellow-800',
  calling_destination: 'bg-blue-100 text-blue-800',
  established:         'bg-green-100 text-green-700',
  noanswer:            'bg-slate-100 text-slate-600',
  busy:                'bg-slate-100 text-slate-600',
  finished:            'bg-slate-100 text-slate-600',
  failed:              'bg-red-100 text-red-700',
};

export default function ChamadaAtiva({ callId, destino, chip, onEncerrada }) {
  const [status, setStatus] = useState('calling_origin');
  const [duracao, setDuracao] = useState(0);
  const [encerrando, setEncerrando] = useState(false);
  const [logTecnico, setLogTecnico] = useState(null);
  const [mostrarLog, setMostrarLog] = useState(false);

  useEffect(() => {
    if (!callId) return;

    const poll = setInterval(async () => {
      const res = await base44.functions.invoke('nvoipCallCenter', {
        action: 'consultarChamada',
        callId,
      });
      const state = res.data?.state;
      // Salva log técnico completo
      setLogTecnico(res.data);
      if (state) setStatus(state);
      if (state === 'established' && res.data?.talkingDurationSeconds) {
        setDuracao(res.data.talkingDurationSeconds);
      }
      if (['finished', 'noanswer', 'busy'].includes(state)) {
        clearInterval(poll);
        setTimeout(() => onEncerrada?.(), 4000);
      }
      if (state === 'failed') {
        clearInterval(poll);
        setTimeout(() => onEncerrada?.(), 6000);
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [callId]);

  const handleEncerrar = async () => {
    setEncerrando(true);
    await base44.functions.invoke('nvoipCallCenter', {
      action: 'encerrarChamada',
      callId,
    });
    setEncerrando(false);
    toast.success('Chamada encerrada');
    onEncerrada?.();
  };

  const formatDuracao = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const isAtiva = ['calling_origin', 'calling_destination', 'established'].includes(status);

  const chipFormatado = chip || logTecnico?._chip || '—';

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-6 text-center space-y-4 shadow-xl">
      <div className="flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mx-auto">
        <Phone className="w-8 h-8" />
      </div>

      {/* Destino + callId */}
      <div>
        <p className="text-lg font-semibold">{destino}</p>
        <p className="text-slate-400 text-xs">ID: {callId}</p>
      </div>

      <Badge className={statusColor[status] || 'bg-slate-700 text-white'}>
        {statusLabel[status] || status}
      </Badge>

      {/* Passo 1 — ligando para o chip */}
      {status === 'calling_origin' && (
        <div className="text-xs text-yellow-200 text-left bg-yellow-900/40 rounded-lg p-3 space-y-1.5">
          <p className="font-semibold text-yellow-300">📲 Passo 1 de 2 — Atenda no seu chip!</p>
          <p className="text-yellow-100">Primeira ligação enviada para: <strong className="text-white">{chipFormatado}</strong></p>
          <p>Atenda essa chamada — depois a NVOIP disca para o cliente <strong>{destino}</strong>.</p>
        </div>
      )}

      {/* Passo 2 — discando para o cliente */}
      {status === 'calling_destination' && (
        <div className="text-xs text-blue-200 text-left bg-blue-900/40 rounded-lg p-3 space-y-1.5">
          <p className="font-semibold text-blue-300">📞 Passo 2 de 2 — Ligando para o cliente!</p>
          <p>Chip <strong>{chipFormatado}</strong> atendeu. Discando para <strong>{destino}</strong>...</p>
        </div>
      )}

      {/* Não atendida — diagnóstico detalhado */}
      {(status === 'noanswer' || status === 'failed') && (
        <div className="text-xs text-left bg-red-900/40 rounded-lg p-3 space-y-2">
          <p className="font-semibold text-red-300">❌ Chamada não atendida</p>
          <p className="text-red-200">A NVOIP tentou ligar para o chip <strong className="text-white">{chipFormatado}</strong>, mas não completou.</p>
          <div className="text-yellow-200 space-y-1 pt-1 border-t border-red-700/50">
            <p className="font-medium text-yellow-300">Causa mais provável:</p>
            <p>• O <strong>Número do Chip</strong> pode ser igual ao DID (número virtual). Configure um <strong>celular físico real</strong> em <em>Meu Ramal → Número do CHIP</em>.</p>
            <p>• Ou o encaminhamento no ramal NVOIP não está configurado.</p>
          </div>
        </div>
      )}

      {/* Busy */}
      {status === 'busy' && (
        <div className="text-xs text-left bg-slate-800 rounded-lg p-3 text-slate-300">
          <p className="font-semibold">Ocupado</p>
          <p>O chip <strong>{chipFormatado}</strong> ou o cliente estava ocupado no momento.</p>
        </div>
      )}

      {/* Em ligação */}
      {status === 'established' && duracao > 0 && (
        <p className="text-2xl font-mono text-green-400">{formatDuracao(duracao)}</p>
      )}

      {/* Botão encerrar */}
      {isAtiva && (
        <Button
          onClick={handleEncerrar}
          disabled={encerrando}
          className="bg-red-600 hover:bg-red-700 text-white w-full"
        >
          {encerrando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PhoneOff className="w-4 h-4 mr-2" />}
          Encerrar Chamada
        </Button>
      )}

      {/* Log técnico colapsável */}
      {logTecnico && (
        <div className="text-left">
          <button
            onClick={() => setMostrarLog(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            {mostrarLog ? 'Ocultar' : 'Ver'} log técnico
          </button>
          {mostrarLog && (
            <pre className="mt-2 text-xs text-slate-300 bg-slate-800 rounded p-2 overflow-x-auto max-h-40 text-left">
              {JSON.stringify(logTecnico, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
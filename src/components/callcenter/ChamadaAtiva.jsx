import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhoneOff, Loader2, Phone, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const statusLabel = {
  success:             '📞 Chamada iniciada — aguardando...',
  calling_origin:      '📞 NVOIP ligando para seu ramal SIP...',
  calling_destination: '📞 Conectando ao contato...',
  established:         '✅ Chamada conectada',
  noanswer:            '❌ Chamada não atendida',
  busy:                '📞 Ocupado',
  finished:            'Chamada encerrada',
  failed:              '❌ Falha na chamada',
};

const statusColor = {
  success:             'bg-blue-100 text-blue-800',
  calling_origin:      'bg-yellow-100 text-yellow-800',
  calling_destination: 'bg-blue-100 text-blue-800',
  established:         'bg-green-100 text-green-700',
  noanswer:            'bg-slate-100 text-slate-600',
  busy:                'bg-slate-100 text-slate-600',
  finished:            'bg-slate-100 text-slate-600',
  failed:              'bg-red-100 text-red-700',
};

export default function ChamadaAtiva({ callId, destino, onEncerrada }) {
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
        setTimeout(() => onEncerrada?.(), 5000);
      }
      if (state === 'failed') {
        clearInterval(poll);
        setTimeout(() => onEncerrada?.(), 7000);
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

  const isAtiva = ['success', 'calling_origin', 'calling_destination', 'established'].includes(status);

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

      {/* 1ª perna: NVOIP ligando para o ramal/celular do operador */}
      {(status === 'success' || status === 'calling_origin') && (
        <div className="text-xs text-left bg-yellow-900/40 rounded-lg p-3 text-yellow-200 space-y-1">
          <p className="font-semibold text-yellow-300">📱 Aguardando você atender...</p>
          <p>A NVOIP está ligando para o seu <strong className="text-white">celular/chip configurado</strong>.</p>
          <p className="text-yellow-300 font-medium">👆 Atenda seu celular — após você atender, a NVOIP conectará automaticamente com <strong className="text-white">{destino}</strong>.</p>
        </div>
      )}
      {/* 2ª perna: NVOIP ligando para o contato */}
      {status === 'calling_destination' && (
        <div className="text-xs text-left bg-blue-900/40 rounded-lg p-3 text-blue-200">
          <p className="font-semibold text-blue-300">📞 Você atendeu — conectando ao contato...</p>
          <p>Ligando para <strong className="text-white">{destino}</strong>. Aguarde na linha.</p>
        </div>
      )}

      {/* Não atendida */}
      {(status === 'noanswer' || status === 'failed') && (
        <div className="text-xs text-left bg-red-900/40 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-red-300">❌ Chamada não completada</p>
          <p className="text-red-200">O contato <strong className="text-white">{destino}</strong> não atendeu ou houve falha na conexão.</p>
          <p className="text-red-300 mt-1">💡 Se o seu celular não tocou, verifique se o <strong>callForward do ramal SIP</strong> está configurado no painel NVOIP apontando para o seu chip.</p>
        </div>
      )}

      {/* Busy */}
      {status === 'busy' && (
        <div className="text-xs text-left bg-slate-800 rounded-lg p-3 text-slate-300">
          <p className="font-semibold">Ocupado</p>
          <p>O número <strong>{destino}</strong> estava ocupado no momento.</p>
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
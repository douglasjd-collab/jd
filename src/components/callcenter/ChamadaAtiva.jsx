import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhoneOff, Loader2, Phone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const statusLabel = {
  calling_origin: '📲 Ligando para seu ramal...',
  calling_destination: '📞 Conectando ao destino...',
  established: 'Em ligação',
  noanswer: 'Sem resposta',
  busy: 'Ocupado',
  finished: 'Encerrada',
  failed: 'Falhou',
};

const statusColor = {
  calling_origin: 'bg-yellow-100 text-yellow-700',
  calling_destination: 'bg-yellow-100 text-yellow-700',
  established: 'bg-green-100 text-green-700',
  noanswer: 'bg-slate-100 text-slate-600',
  busy: 'bg-red-100 text-red-700',
  finished: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-700',
};

export default function ChamadaAtiva({ callId, destino, onEncerrada }) {
  const [status, setStatus] = useState('calling_origin');
  const [duracao, setDuracao] = useState(0);
  const [encerrando, setEncerrando] = useState(false);

  useEffect(() => {
    if (!callId) return;

    const poll = setInterval(async () => {
      const res = await base44.functions.invoke('nvoipCallCenter', {
        action: 'consultarChamada',
        callId,
      });
      const state = res.data?.state;
      if (state) setStatus(state);
      if (state === 'established' && res.data?.talkingDurationSeconds) {
        setDuracao(res.data.talkingDurationSeconds);
      }
      if (['finished', 'noanswer', 'busy'].includes(state)) {
        clearInterval(poll);
        setTimeout(() => onEncerrada?.(), 3000);
      }
      if (state === 'failed') {
        clearInterval(poll);
        // Mostra por mais tempo para o usuário ler a mensagem
        setTimeout(() => onEncerrada?.(), 5000);
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

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-6 text-center space-y-4 shadow-xl">
      <div className="flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mx-auto">
        <Phone className="w-8 h-8" />
      </div>
      <div>
        <p className="text-lg font-semibold">{destino}</p>
        <p className="text-slate-400 text-sm">{callId}</p>
      </div>
      <Badge className={statusColor[status] || 'bg-slate-700 text-white'}>
        {statusLabel[status] || status}
      </Badge>
      {status === 'calling_origin' && (
        <div className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed bg-yellow-900/30 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-yellow-300">📲 Atenda a ligação no seu ramal!</p>
          <p>A NVOIP está ligando para o <strong>seu ramal SIP</strong>. Quando você atender, ela conectará automaticamente ao número <strong>{destino}</strong>.</p>
        </div>
      )}
      {status === 'calling_destination' && (
        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
          Conectando ao número <strong>{destino}</strong>...
        </p>
      )}
      {status === 'failed' && (
        <div className="text-xs text-red-300 max-w-xs mx-auto leading-relaxed space-y-1 text-left bg-red-900/30 rounded-lg p-3">
          <p className="font-semibold">Chamada não atendida.</p>
          <p>Possíveis causas: ramal offline, softphone desconectado ou chip não disponível.</p>
          <p className="font-medium mt-1 text-yellow-300">Dica: se o softphone estiver aberto, atenda a ligação que chegará no seu ramal SIP primeiro.</p>
        </div>
      )}
      {status === 'established' && duracao > 0 && (
        <p className="text-2xl font-mono text-green-400">{formatDuracao(duracao)}</p>
      )}
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
    </div>
  );
}
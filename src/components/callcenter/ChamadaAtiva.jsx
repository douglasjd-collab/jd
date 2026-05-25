import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PhoneOff, Loader2, Phone, Mic } from 'lucide-react';
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
    <div className="flex flex-col items-center justify-center space-y-6 py-8">
      {/* Título */}
      <h2 className="text-xl font-bold text-slate-800">Ligação em Andamento</h2>

      {/* Avatar circulado */}
      <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-green-200 flex items-center justify-center">
          <Phone className="w-8 h-8 text-green-600" />
        </div>
      </div>

      {/* Nome do contato */}
      <div className="text-center">
        <p className="text-2xl font-bold text-slate-900">{destino}</p>
        <p className="text-sm text-slate-500 mt-1">{destino}</p>
      </div>

      {/* Status chamando */}
      <p className="text-orange-500 font-semibold text-sm">Chamando...</p>

      {/* Ícone telefone grande */}
      <Phone className="w-12 h-12 text-green-500" />

      {/* Botões de controle */}
      <div className="flex gap-4">
        {/* Botão mute/microfone */}
        <button className="w-14 h-14 rounded-full border-2 border-green-500 flex items-center justify-center hover:bg-green-50 transition">
          <Mic className="w-6 h-6 text-green-600" />
        </button>

        {/* Botão encerrar */}
        <button
          onClick={handleEncerrar}
          disabled={encerrando}
          className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition text-white"
        >
          {encerrando ? <Loader2 className="w-6 h-6 animate-spin" /> : <PhoneOff className="w-6 h-6" />}
        </button>
      </div>

      {/* Log técnico colapsável */}
      {logTecnico && (
        <div className="text-center w-full max-w-sm mt-4">
          <button
            onClick={() => setMostrarLog(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            {mostrarLog ? 'Ocultar' : 'Ver'} log técnico
          </button>
          {mostrarLog && (
            <pre className="mt-2 text-xs text-slate-500 bg-slate-100 rounded p-2 overflow-x-auto max-h-32">
              {JSON.stringify(logTecnico, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
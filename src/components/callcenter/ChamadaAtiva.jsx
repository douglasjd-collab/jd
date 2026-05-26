import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { PhoneOff, Loader2, Phone, Mic } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import CallEndModal from './CallEndModal';

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

export default function ChamadaAtiva({ callId, destino, nomeContato, empresaId, usuarioId, usuarioNome, clienteId, clienteNome, onEncerrada }) {
  const [status, setStatus] = useState('calling_origin');
  const [duracao, setDuracao] = useState(0);
  const [encerrando, setEncerrando] = useState(false);
  const [logTecnico, setLogTecnico] = useState(null);
  const [mostrarLog, setMostrarLog] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const historicoIdRef = useRef(null);
  const inicioRef = useRef(new Date().toISOString());

  // Cria registro "em_andamento" no histórico ao montar
  useEffect(() => {
    if (!empresaId || !callId) return;
    const criar = async () => {
      const reg = await base44.entities.HistoricoChamadaMicroSIP.create({
        empresa_id: empresaId,
        usuario_id: usuarioId || '',
        usuario_nome: usuarioNome || '',
        direcao: 'saida',
        numero: destino,
        cliente_id: clienteId || '',
        cliente_nome: clienteNome || '',
        status: 'em_andamento',
        inicio: inicioRef.current,
      });
      historicoIdRef.current = reg?.id;
    };
    criar();
  }, []);

  useEffect(() => {
    if (!callId) return;

    const poll = setInterval(async () => {
      try {
        const res = await base44.functions.invoke('nvoipCallCenter', {
          action: 'consultarChamada',
          callId,
        });
        const state = res.data?.state;
        const dur = res.data?.talkingDurationSeconds || res.data?.durationInSeconds || 0;
        
        setLogTecnico(res.data);
        if (state) setStatus(state);
        if (dur > 0) setDuracao(dur);
        
        if (['finished', 'noanswer', 'busy', 'failed'].includes(state)) {
          clearInterval(poll);
          // Atualiza histórico com resultado final
          if (historicoIdRef.current && empresaId) {
            await base44.entities.HistoricoChamadaMicroSIP.update(historicoIdRef.current, {
              status: state === 'finished' || state === 'established' ? 'atendida' : 
                      state === 'noanswer' ? 'nao_atendida' : 
                      state === 'busy' ? 'ocupado' : 'nao_atendida',
              fim: new Date().toISOString(),
              duracao_segundos: dur,
            });
          }
          setTimeout(() => setShowEndModal(true), 500);
        }
      } catch (err) {
        console.error('Erro ao consultar chamada:', err);
        setLogTecnico({ error: err.message, timestamp: new Date().toISOString() });
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [callId]);

  const handleEncerrar = async () => {
    setEncerrando(true);
    await base44.functions.invoke('nvoipCallCenter', {
      action: 'encerrarChamada',
      callId,
    });
    // Atualiza histórico
    if (historicoIdRef.current && empresaId) {
      await base44.entities.HistoricoChamadaMicroSIP.update(historicoIdRef.current, {
        status: duracao > 0 ? 'atendida' : 'nao_atendida',
        fim: new Date().toISOString(),
        duracao_segundos: duracao,
      });
    }
    setEncerrando(false);
    setShowEndModal(true);
  };

  const handleConfirmResult = async (resultado) => {
    setSavingResult(true);
    try {
      toast.success(`Ligação registrada como "${resultado}"`);
      setShowEndModal(false);
      setTimeout(() => onEncerrada?.(), 500);
    } finally {
      setSavingResult(false);
    }
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
      <div className="flex items-center gap-2">
        <p className={`font-semibold text-sm ${statusColor[status]?.split(' ')[0]}`}>
          {statusLabel[status] || `Status: ${status}`}
        </p>
        {isAtiva && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
      </div>

      {/* Duração se conectada */}
      {duracao > 0 && (
        <p className="text-lg font-bold text-green-600">{formatDuracao(duracao)}</p>
      )}

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

      {/* Modal de encerramento */}
      <CallEndModal
        open={showEndModal}
        onOpenChange={setShowEndModal}
        contato={nomeContato || destino}
        numero={destino}
        duracao={duracao}
        onConfirm={handleConfirmResult}
        loading={savingResult}
      />
    </div>
  );
}
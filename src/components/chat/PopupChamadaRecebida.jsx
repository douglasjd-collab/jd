import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { PhoneIncoming, Phone, X } from 'lucide-react';
import useDapiCall from '@/components/chat/useDapiCall';
import DapiCallBar from '@/components/chat/DapiCallBar.jsx';

// Chamada de voz WhatsApp recebida (evento call.offer da D-API).
// Permite atender a ligação dentro do CRM (áudio no navegador) ou recusar.
const IDADE_MAXIMA_OFERTA_MS = 45000;

export default function PopupChamadaRecebida({ user }) {
  const [chamada, setChamada] = useState(null);
  const [atendendo, setAtendendo] = useState(false);
  const call = useDapiCall();

  useEffect(() => {
    if (!user?.empresa_id) return;
    const unsub = base44.entities.ChamadaVozWhatsapp.subscribe((event) => {
      if (event.type !== 'create') return;
      const data = event.data;
      if (data?.empresa_id !== user.empresa_id || data?.status !== 'recebida') return;
      // Oferta antiga não é mais atendível
      const idade = Date.now() - new Date(data.created_date || Date.now()).getTime();
      if (idade > IDADE_MAXIMA_OFERTA_MS) return;
      setChamada(data);
    });
    return unsub;
  }, [user?.empresa_id]);

  useEffect(() => {
    if (call.status !== 'ended') return;
    setAtendendo(false);
    setChamada(null);
  }, [call.status]);

  if (!chamada) return null;

  const marcarVisualizada = async () => {
    try {
      await base44.entities.ChamadaVozWhatsapp.update(chamada.id, { status: 'visualizada' });
    } catch (_) {}
  };

  const atenderChamada = async () => {
    if (atendendo) return;
    setAtendendo(true);
    await marcarVisualizada();
    await call.atender(chamada.connection_id, chamada.call_id);
  };

  const recusarChamada = async () => {
    await marcarVisualizada();
    await call.recusar(chamada.connection_id, chamada.call_id);
    setChamada(null);
  };

  const fechar = () => {
    call.encerrar();
    setAtendendo(false);
    setChamada(null);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-80 rounded-2xl shadow-2xl bg-white border border-emerald-200 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
      {atendendo ? (
        <div className="rounded-2xl overflow-hidden">
          <DapiCallBar
            status={call.status}
            erro={call.erro}
            clienteNome={chamada.cliente_nome || chamada.cliente_telefone}
            mutado={call.mutado}
            via={call.via}
            onEncerrar={fechar}
            onMutar={call.alternarMudo}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 p-4">
            <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 animate-pulse">
              <PhoneIncoming className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">Chamada de voz recebida</p>
              <p className="text-xs text-slate-500 truncate">{chamada.cliente_nome || chamada.cliente_telefone}</p>
            </div>
            <button onClick={fechar} className="p-1 rounded-full hover:bg-slate-100 flex-shrink-0">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={recusarChamada}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Recusar
            </button>
            <button
              onClick={atenderChamada}
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium inline-flex items-center justify-center gap-1.5"
            >
              <Phone className="w-4 h-4" />
              Atender
            </button>
          </div>
        </>
      )}
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { PhoneIncoming, X } from 'lucide-react';

// Popup de chamada de voz WhatsApp recebida (evento call.offer da D-API).
// Ao clicar, abre a conversa do cliente já com a mensagem "Vou te ligar." pronta para enviar.
export default function PopupChamadaRecebida({ user }) {
  const [chamada, setChamada] = useState(null);

  useEffect(() => {
    if (!user?.empresa_id) return;
    const unsub = base44.entities.ChamadaVozWhatsapp.subscribe((event) => {
      if (event.type !== 'create') return;
      const data = event.data;
      if (data?.empresa_id !== user.empresa_id || data?.status !== 'recebida') return;
      setChamada(data);
    });
    return unsub;
  }, [user?.empresa_id]);

  if (!chamada) return null;

  const fechar = () => setChamada(null);

  const abrirConversa = async () => {
    try {
      await base44.entities.ChamadaVozWhatsapp.update(chamada.id, { status: 'visualizada' });
    } catch (_) {}
    const params = new URLSearchParams({
      conversa_id: chamada.conversa_id || '',
      mensagem_inicial: 'Vou te ligar.'
    });
    window.location.href = `/BatePapo?${params.toString()}`;
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-80 rounded-2xl shadow-2xl bg-white border border-emerald-200 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
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
          onClick={fechar}
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Fechar
        </button>
        <button
          onClick={abrirConversa}
          className="flex-1 text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
        >
          Abrir conversa
        </button>
      </div>
    </div>
  );
}
import React from 'react';
import { Clock, MessageSquare, CalendarClock } from 'lucide-react';
import { formatarTelefoneBR } from '@/components/utils/formatarTelefone';
import { formatarEspera, horaLocal } from './tempoAtendimento';

/**
 * Cliente aguardando resposta humana. A prioridade aqui é sempre responder:
 * "Atender" abre a conversa na conexão original e "Finalizar" fica secundário.
 */
export default function ItemAguardando({ item, onAtender, onAdiar, onFinalizar, processando, adiado }) {
  return (
    <div className={`px-3 py-2.5 ${adiado ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{item.cliente_nome}</p>
          <p className="truncate text-xs text-slate-500">{formatarTelefoneBR(item.cliente_telefone)}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          <Clock className="h-3 w-3" />
          {formatarEspera(item.minutos)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAtender(item)}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Responder agora
        </button>
        <button
          type="button"
          disabled={processando}
          onClick={() => onAdiar(item)}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Adiar 5 min
        </button>
        <button
          type="button"
          disabled={processando}
          onClick={() => onFinalizar(item)}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          Finalizar
        </button>
        <button
          type="button"
          disabled={processando}
          onClick={() => onFinalizar(item, { agendar: true })}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <CalendarClock className="h-3 w-3" />
          Agendar retorno
        </button>
      </div>

      {adiado && item.adiado_ate && (
        <p className="mt-1 text-[11px] text-slate-400">Adiado até {horaLocal(item.adiado_ate)}</p>
      )}
    </div>
  );
}
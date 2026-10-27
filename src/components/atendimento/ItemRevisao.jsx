import React from 'react';
import { MessageSquare, CheckCheck, CalendarClock, Clock } from 'lucide-react';
import { formatarTelefoneBR } from '@/components/utils/formatarTelefone';
import { formatarEspera } from './tempoAtendimento';

/**
 * Revisão após 1 hora de atendimento. Nada é finalizado automaticamente:
 * o usuário escolhe continuar (adiar 30 min), finalizar ou agendar retorno.
 */
export default function ItemRevisao({ item, onAtender, onContinuar, onFinalizar, processando }) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{item.cliente_nome}</p>
          <p className="truncate text-xs text-slate-500">{formatarTelefoneBR(item.cliente_telefone)}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
          <Clock className="h-3 w-3" />
          {formatarEspera(item.minutos)} de atendimento
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAtender(item)}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Atender
        </button>
        <button
          type="button"
          disabled={processando}
          onClick={() => onContinuar(item)}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Continuar atendimento
        </button>
        <button
          type="button"
          disabled={processando}
          onClick={() => onFinalizar(item)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <CheckCheck className="h-3 w-3" />
          Finalizar
        </button>
        <button
          type="button"
          disabled={processando}
          onClick={() => onFinalizar(item, { agendar: true })}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <CalendarClock className="h-3 w-3" />
          Agendar retorno e finalizar
        </button>
      </div>
    </div>
  );
}
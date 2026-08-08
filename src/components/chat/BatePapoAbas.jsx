import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Star } from 'lucide-react';

/**
 * Abas/contadores de filtro do Bate-Papo + indicador de prioritários e sub-filtro.
 * Extraído do BatePapo.jsx para reduzir o tamanho do arquivo principal.
 */
export default function BatePapoAbas({
  contadores,
  filtroStatus,
  setFiltroStatus,
  filtroPrioridade,
  setFiltroPrioridade,
  encerrarTodosTransferidos,
  encerrandoTransferidos,
}) {
  const mostrarPrioridade = !['grupos', 'campanhas', 'microtarefas'].includes(filtroStatus);

  return (
    <div className="space-y-1.5">
      {/* Linha 1: Todos | Em Atend. | Esperando | Responsável */}
      <div className="grid grid-cols-4 gap-1.5">
        <button onClick={() => setFiltroStatus('todas')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'todas' ? 'bg-slate-600' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'todas' ? 'text-white' : 'text-slate-700'}`}>{contadores.todas}</span>
          <span className={`text-[10px] font-medium ${filtroStatus === 'todas' ? 'text-white' : 'text-slate-600'}`}>Todos</span>
        </button>

        <button onClick={() => setFiltroStatus('ativa')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'ativa' ? 'bg-slate-600' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'ativa' ? 'text-white' : 'text-slate-700'}`}>{contadores.ativa}</span>
          <span className={`text-[10px] font-medium ${filtroStatus === 'ativa' ? 'text-white' : 'text-slate-600'}`}>Em Atend.</span>
        </button>

        <button onClick={() => setFiltroStatus('espera')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'espera' ? 'bg-red-500' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'espera' ? 'text-white' : 'text-red-500'}`}>{contadores.espera}</span>
          <span className={`text-[10px] font-medium ${filtroStatus === 'espera' ? 'text-white' : 'text-slate-600'}`}>Esperando</span>
        </button>

        <button onClick={() => setFiltroStatus('meu')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-2 py-1.5 ${filtroStatus === 'meu' ? 'bg-emerald-600' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'meu' ? 'text-white' : 'text-emerald-500'}`}>{contadores.meu}</span>
          <span className={`text-[10px] font-medium ${filtroStatus === 'meu' ? 'text-white' : 'text-slate-600'}`}>Responsável</span>
        </button>
      </div>

      {/* Linha 2: Transferidos | Grupos | Campanhas | Finalizados */}
      <div className="grid grid-cols-4 gap-1.5">
        <button onClick={() => setFiltroStatus('transferida')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-1 py-1.5 ${filtroStatus === 'transferida' ? 'bg-orange-500' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'transferida' ? 'text-white' : 'text-orange-500'}`}>{contadores.transferida}</span>
          <span className={`text-[9px] font-medium ${filtroStatus === 'transferida' ? 'text-white' : 'text-slate-600'}`}>Transferidos</span>
        </button>
        <button onClick={() => setFiltroStatus('grupos')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-1 py-1.5 ${filtroStatus === 'grupos' ? 'bg-emerald-600' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'grupos' ? 'text-white' : 'text-emerald-500'}`}>{contadores.grupos}</span>
          <span className={`text-[9px] font-medium ${filtroStatus === 'grupos' ? 'text-white' : 'text-slate-600'}`}>Grupos</span>
        </button>
        <button onClick={() => setFiltroStatus('microtarefas')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-1 py-1.5 ${filtroStatus === 'microtarefas' ? 'bg-amber-500' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'microtarefas' ? 'text-white' : 'text-amber-600'}`}>{contadores.microtarefas || 0}</span>
          <span className={`text-[9px] font-medium ${filtroStatus === 'microtarefas' ? 'text-white' : 'text-slate-600'}`}>Microtarefas</span>
        </button>
        <button onClick={() => setFiltroStatus('encerrada')} className={`flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 transition-all rounded-lg px-1 py-1.5 ${filtroStatus === 'encerrada' ? 'bg-slate-600' : 'bg-slate-100'}`}>
          <span className={`text-sm font-bold ${filtroStatus === 'encerrada' ? 'text-white' : 'text-slate-400'}`}>{contadores.encerrada}</span>
          <span className={`text-[9px] font-medium ${filtroStatus === 'encerrada' ? 'text-white' : 'text-slate-500'}`}>Finalizados</span>
        </button>
      </div>

      {/* Indicador de prioritários + sub-filtro opcional */}
      {mostrarPrioridade && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-yellow-600">
            <Star className="h-3 w-3" fill="currentColor" />
            Prioritários: {contadores.prioritarios || 0}
          </span>
          <div className="flex items-center gap-1">
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'prioritarios', label: '⭐ Prioritários' },
              { key: 'sem', label: 'Sem prioridade' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setFiltroPrioridade(opt.key)}
                className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                  filtroPrioridade === opt.key
                    ? 'bg-yellow-400 text-yellow-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtroStatus === 'transferida' && contadores.transferida > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50"
          onClick={encerrarTodosTransferidos}
          disabled={encerrandoTransferidos}
        >
          {encerrandoTransferidos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Encerrar todos os {contadores.transferida} transferidos
        </Button>
      )}
    </div>
  );
}
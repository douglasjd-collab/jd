import React from 'react';
import { differenceInCalendarDays, format } from 'date-fns';

const parseData = (valor, fimDoDia = false) => {
  if (!valor) return null;
  const texto = String(valor);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? new Date(`${texto}T${fimDoDia ? '23:59:59' : '00:00:00'}`)
    : new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
};

export default function TempoTarefa({ tarefa, compacto = false }) {
  const finalizada = tarefa?.status === 'concluido' || tarefa?.status === 'arquivado';
  const inicio = parseData(tarefa?.data_cadastro || tarefa?.created_date);
  const fimRegistrado = tarefa?.data_conclusao_real || (finalizada ? tarefa?.updated_date : null);
  const fim = finalizada ? parseData(fimRegistrado, true) : new Date();

  if (!inicio || !fim) return null;

  const dias = Math.max(0, differenceInCalendarDays(fim, inicio));
  const percentual = Math.min(100, Math.max(4, (dias / 30) * 100));
  const cor = dias <= 7
    ? 'bg-emerald-500'
    : dias <= 15
      ? 'bg-amber-400'
      : dias <= 30
        ? 'bg-orange-500'
        : 'bg-red-500';
  const textoCor = dias <= 7
    ? 'text-emerald-700'
    : dias <= 15
      ? 'text-amber-700'
      : dias <= 30
        ? 'text-orange-700'
        : 'text-red-700';
  const rotulo = finalizada
    ? `Concluída em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
    : `Aberta há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;

  return (
    <div className={compacto ? 'space-y-1' : 'rounded-xl border border-slate-200 bg-white p-3 space-y-2'}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${compacto ? 'text-[11px]' : 'text-sm'} font-bold ${textoCor}`}>
          ⏱ {rotulo}
        </span>
        {!compacto && (
          <span className="text-[11px] text-slate-400">Escala de 30 dias</span>
        )}
      </div>
      <div className={`w-full overflow-hidden rounded-full bg-slate-200 ${compacto ? 'h-1.5' : 'h-2.5'}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${cor}`}
          style={{ width: `${percentual}%` }}
        />
      </div>
      {!compacto && (
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>Criada: {format(inicio, 'dd/MM/yyyy')}</span>
          <span>{finalizada ? 'Concluída' : 'Hoje'}: {format(fim, 'dd/MM/yyyy')}</span>
        </div>
      )}
    </div>
  );
}

// Badge visual que mostra o estado da fila de envio assíncrono numa bolha.
//
// Renderizado dentro de MensagemItem quando a mensagem tem
// `fila_envio_estado` setado (somente em bolhas vendedor).
//
// Mostra:
//  - preparando / carregando / na_fila / enviando → spinner + barra de
//    progresso + %.
//  - enviada / entregue / lida → nada (delega para o status normal do WhatsApp).
//  - falhou → ícone vermelho "✕" + motivo + botões "Tentar novamente" e "Cancelar".
//  - cancelado → texto discreto "Cancelado".

import React from 'react';
import { Loader2, AlertCircle, RotateCcw, X } from 'lucide-react';

const ESTADO_LABEL = {
  preparando: 'Preparando envio...',
  carregando: 'Carregando mídia...',
  na_fila: 'Na fila de envio...',
  enviando: 'Enviando...',
  enviada: 'Enviada',
  entregue: 'Entregue',
  lida: 'Lida',
  falhou: 'Falha no envio',
  cancelado: 'Cancelado',
};

// Tema: bolhas vendedor têm fundo verde-clean (#dcf8c6). Para combinar, o
// overlay fica em tons de verde-escuro durante progresso e vermelho em erro.
export default function FilaEnvioBadge({ mensagem, onReenviarEnvio, onCancelarEnvio }) {
  const estado = mensagem?.fila_envio_estado;
  if (!estado || estado === 'enviada' || estado === 'entregue' || estado === 'lida') return null;

  const progresso = Math.round(mensagem?.fila_envio_progresso || 0);
  const erro = mensagem?.fila_envio_erro;

  // Cancelado: discreto e uma leve opacidade (feito via mensagem вставится no MensagemItem)
  if (estado === 'cancelado') {
    return (
      <div className="mt-1 text-[11px] text-slate-500 italic flex items-center gap-1.5">
        <X className="w-3 h-3" /> {ESTADO_LABEL.cancelado}
      </div>
    );
  }

  // Em progresso (preparando/carregando/na_fila/enviando)
  const emProgresso = ['preparando', 'carregando', 'na_fila', 'enviando'].includes(estado);
  if (emProgresso) {
    return (
      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-700">
        <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="truncate font-medium">{ESTADO_LABEL[estado]}</span>
            {progresso > 0 && progresso < 100 && <span className="text-slate-500">{progresso}%</span>}
          </div>
          <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.max(6, progresso)}%` }}
            />
          </div>
        </div>
        {/* Botão de cancelar durante upload/envio */}
        {onCancelarEnvio && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancelarEnvio(mensagem.id); }}
            className="p-1 rounded-full hover:bg-emerald-50 text-slate-400 hover:text-red-500 flex-shrink-0"
            title="Cancelar envio"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  // Falhou
  if (estado === 'falhou') {
    return (
      <div className="mt-1.5 rounded-md bg-red-50/80 border border-red-200 px-2 py-1.5">
        <div className="flex items-start gap-1.5 text-[11px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{ESTADO_LABEL.falhou}</p>
            {erro && <p className="text-red-600/90 truncate">{erro}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {onReenviarEnvio && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReenviarEnvio(mensagem.id); }}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <RotateCcw className="w-3 h-3" /> Tentar novamente
            </button>
          )}
          {onCancelarEnvio && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancelarEnvio(mensagem.id); }}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-red-600 hover:bg-red-100"
            >
              <X className="w-3 h-3" /> Cancelar envio
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
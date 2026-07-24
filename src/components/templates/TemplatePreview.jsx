import React from 'react';
import { Smartphone, AlertCircle } from 'lucide-react';
import { applyPreview } from './templateHelpers';

// Simulação de celular com a prévia da mensagem em tempo real.
export default function TemplatePreview({
  headerText,
  tipo,
  headerMediaUrl,
  bodyText,
  footerText,
  buttons,
  examples,
}) {
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="relative w-full max-w-[260px] rounded-[2rem] bg-slate-800 p-2 shadow-xl border border-slate-700">
        <div className="flex items-center justify-between gap-1 px-4 pt-1 pb-2 text-xs text-slate-300">
          <span className="font-medium">WhatsApp</span>
          <Smartphone className="w-3 h-3" />
        </div>
        <div className="rounded-[1.4rem] bg-[#e5ddd5] bg-gradient-to-b from-slate-50 to-slate-100 min-h-[260px] p-3">
          {/* Bolha */}
          <div className="bg-white rounded-lg shadow-sm p-2.5 mb-1.5 max-w-[95%] text-slate-800 text-xs relative">
            <div className="absolute -left-1.5 top-0 w-3 h-3 bg-white rounded-bl-none transform rotate-180" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }} />
            {(tipo === 'IMAGE' || tipo === 'VIDEO') && (
              <div className="w-full h-24 rounded mb-2 flex items-center justify-center bg-slate-200 text-slate-500 text-[10px]">
                {headerMediaUrl ? (
                  tipo === 'VIDEO' ? (
                    <span>🎬 vídeo de exemplo</span>
                  ) : (
                    <img src={headerMediaUrl} alt="header" className="w-full h-full object-cover rounded" />
                  )
                ) : (
                  <span>{tipo === 'VIDEO' ? '🎬 vídeo ainda não enviado' : '🖼️ imagem ainda não enviada'}</span>
                )}
              </div>
            )}
            {headerText && tipo === 'TEXT' && (
              <div className="font-semibold mb-1 text-[13px]">{headerText}</div>
            )}
            {bodyText ? (
              <p className="whitespace-pre-wrap leading-relaxed">{applyPreview(bodyText, examples) || ''}</p>
            ) : (
              <p className="text-slate-400 italic">Digite a mensagem no lado esquerdo…</p>
            )}
            {footerText && (
              <div className="mt-1.5 pt-1 border-t border-slate-100 text-[10px] text-slate-500">{footerText}</div>
            )}
            <div className="text-right text-[9px] text-slate-400 mt-1">00:00 ✓✓</div>
          </div>

          {buttons && buttons.length > 0 && (
            <div className="bg-white rounded-lg overflow-hidden border border-slate-100 shadow-sm">
              {buttons.map((b, i) => (
                <div key={i} className="px-3 py-2 text-xs text-blue-600 font-medium border-b border-slate-100 last:border-0">
                  {b.type === 'URL' && '🔗 '}
                  {b.type === 'PHONE_NUMBER' && '📞 '}
                  {b.type === 'QUICK_REPLY' && '↩ '}
                  {b.text || 'Botão'}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-start gap-1.5 text-[10px] text-slate-500 px-2">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>Esta é apenas uma pré-visualização. A aparência final pode variar no WhatsApp.</span>
      </div>
    </div>
  );
}
import React, { useEffect, useRef } from 'react';
import { Loader2, MapPin, Film, ImageIcon } from 'lucide-react';
import { useGaleriaMensagens } from './useGaleriaMensagens';
import { ehImagem, ehVideo, formatarDataCurta } from './helpers';

/**
 * Aba "Mídias" — grade de imagens e vídeos. Mostra miniaturas diretamente
 * das URLs públicas (sem baixar o arquivo completo).
 */
export default function AbaMidias({ conversaId, filtros, onLocalizarMensagem, onAbrirMidia }) {
  const { resultados, total, loading, hasMore, carregarMais } = useGaleriaMensagens({
    conversaId,
    categoria: ['midias'],
    remetente: filtros.remetente,
    q: filtros.q,
    dataInicio: filtros.dataInicio,
    dataFim: filtros.dataFim,
    ordem: filtros.ordem,
    limit: 24,
  });

  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) carregarMais();
    }, { rootMargin: '200px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, carregarMais]);

  if (!loading && resultados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-sm">
        <ImageIcon className="w-10 h-10 opacity-40 mb-2" />
        Nenhuma mídia nesta conversa.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 p-2">
        {resultados.map((m, idx) => {
          const isVid = ehVideo(m);
          const enviarLabel = m.remetente === 'vendedor' ? '↑' : '↓';
          return (
            <div
              key={m.id}
              className="relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-100 cursor-pointer group"
              onClick={() => onAbrirMidia?.(idx, resultados)}
              title={`${m.arquivo_nome || 'Mídia'} · ${formatarDataCurta(m.data_envio)}`}
            >
              <img
                src={m.arquivo_url}
                alt={m.arquivo_nome || 'Mídia'}
                loading="lazy"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              {isVid && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Film className="w-6 h-6 text-white" />
                </div>
              )}
              <span className="absolute top-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">{enviarLabel}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onLocalizarMensagem?.(m.id); }}
                className="absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full bg-white/80 hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Localizar na conversa"
              >
                <MapPin className="w-3 h-3 text-slate-700" />
              </button>
            </div>
          );
        })}
      </div>

      <div ref={sentinelRef} />

      <p className="text-center text-xs text-slate-400 py-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> :
         hasMore ? '' :
         `${resultados.length} de ${total} mídias`}
      </p>
    </div>
  );
}
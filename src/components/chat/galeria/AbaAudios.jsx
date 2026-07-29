import React, { useEffect, useRef } from 'react';
import { Loader2, Headphones } from 'lucide-react';
import { useGaleriaMensagens } from './useGaleriaMensagens';
import ItemAudio from './ItemAudio';

/**
 * Aba "Áudios" — lista de áudios/mensagens de voz com player, controle de
 * velocidade (1x/1,5x/2x), download e "localizar na conversa".
 */
export default function AbaAudios({ conversaId, filtros, onLocalizarMensagem }) {
  const { resultados, total, loading, hasMore, carregarMais } = useGaleriaMensagens({
    conversaId,
    categoria: ['audios'],
    remetente: filtros.remetente,
    q: filtros.q,
    dataInicio: filtros.dataInicio,
    dataFim: filtros.dataFim,
    ordem: filtros.ordem,
    limit: 20,
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
        <Headphones className="w-10 h-10 opacity-40 mb-2" />
        Nenhum áudio nesta conversa.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 p-2">
        {resultados.map((m) => (
          <ItemAudio key={m.id} mensagem={m} onLocalizarMensagem={onLocalizarMensagem} />
        ))}
      </div>
      <div ref={sentinelRef} />
      <p className="text-center text-xs text-slate-400 py-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> :
         hasMore ? '' :
         `${resultados.length} de ${total} áudios`}
      </p>
    </div>
  );
}
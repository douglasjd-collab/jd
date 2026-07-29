import React, { useEffect, useRef } from 'react';
import { Loader2, MapPin, ExternalLink, LinkIcon } from 'lucide-react';
import { useGaleriaMensagens } from './useGaleriaMensagens';
import { formatarDataHora, extrairLinks } from './helpers';

/**
 * Aba "Links" — extrai URLs das mensagens (texto) e lista com botão
 * "abrir em nova aba" e "localizar na conversa".
 */
export default function AbaLinks({ conversaId, filtros, onLocalizarMensagem }) {
  const { resultados, total, loading, hasMore, carregarMais } = useGaleriaMensagens({
    conversaId,
    categoria: ['links'],
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
        <LinkIcon className="w-10 h-10 opacity-40 mb-2" />
        Nenhum link nesta conversa.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-slate-100">
        {resultados.map((m) => {
          const links = extrairLinks(m.texto);
          const remetenteLabel = m.remetente === 'vendedor' ? 'Enviado' : 'Recebido';
          return (
            <div key={m.id} className="p-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {links.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium text-blue-600 hover:underline truncate"
                      title={url}
                    >
                      {url}
                    </a>
                  ))}
                  {m.texto && m.texto !== links[0] && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 break-words">{m.texto}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${m.remetente === 'vendedor' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{remetenteLabel}</span>
                    <span>•</span>
                    <span>{formatarDataHora(m.data_envio)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={links[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center"
                    title="Abrir em nova aba"
                  >
                    <ExternalLink className="h-4 w-4 text-slate-600" />
                  </a>
                  <button onClick={() => onLocalizarMensagem?.(m.id)} className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center" title="Localizar na conversa">
                    <MapPin className="h-4 w-4 text-slate-600" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} />
      <p className="text-center text-xs text-slate-400 py-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> :
         hasMore ? '' :
         `${resultados.length} de ${total} mensagens com link`}
      </p>
    </div>
  );
}
import React, { useEffect, useRef } from 'react';
import { Loader2, MapPin, FileText, Download, Eye } from 'lucide-react';
import { useGaleriaMensagens } from './useGaleriaMensagens';
import { formatarDataHora, formatarBytes, iconeArquivo, ehPdf } from './helpers';

/**
 * Aba "Documentos" — PDF/DOC/XLS/CSV/TXT/ZIP. PDFs abrem em visualizador inline.
 */
export default function AbaDocumentos({ conversaId, filtros, onLocalizarMensagem, onAbrirPdf }) {
  const { resultados, total, loading, hasMore, carregarMais } = useGaleriaMensagens({
    conversaId,
    categoria: ['documentos'],
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
        <FileText className="w-10 h-10 opacity-40 mb-2" />
        Nenhum documento nesta conversa.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-slate-100">
        {resultados.map((m) => {
          const remetenteLabel = m.remetente === 'vendedor' ? 'Enviado' : 'Recebido';
          const isPdf = ehPdf(m);
          return (
            <div key={m.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center text-xl">
                {iconeArquivo(m.arquivo_nome)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.arquivo_nome || 'Documento'}</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded-full font-medium ${m.remetente === 'vendedor' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{remetenteLabel}</span>
                  <span>•</span>
                  <span>{formatarDataHora(m.data_envio)}</span>
                  <span>•</span>
                  <span>{formatarBytes(m.arquivo_tamanho)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isPdf && (
                  <button onClick={() => onAbrirPdf?.(m)} className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center" title="Visualizar PDF">
                    <Eye className="h-4 w-4 text-slate-600" />
                  </button>
                )}
                <a href={m.arquivo_url} download={m.arquivo_nome || 'documento'} target="_blank" rel="noreferrer" className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center" title="Baixar">
                  <Download className="h-4 w-4 text-slate-600" />
                </a>
                <button onClick={() => onLocalizarMensagem?.(m.id)} className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center" title="Localizar na conversa">
                  <MapPin className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} />
      <p className="text-center text-xs text-slate-400 py-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> :
         hasMore ? '' :
         `${resultados.length} de ${total} documentos`}
      </p>
    </div>
  );
}
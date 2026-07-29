import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Hook genérico usado pelas abas da galeria.
 * Carrega (modo='galeria') as mensagens por categoria com paginação progressiva.
 */
export function useGaleriaMensagens({
  conversaId,
  categoria,
  remetente = 'todas',
  q = '',
  dataInicio = null,
  dataFim = null,
  ordem = 'recente',
  limit = 24,
  enabled = true,
}) {
  const [resultados, setResultados] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const carregar = useCallback(async (novoPage = 1) => {
    if (!conversaId) return;
    if (novoPage === 1) setLoading(true);
    try {
      const resp = await base44.functions.invoke('buscarMensagensBatePapo', {
        conversa_id: conversaId,
        modo: 'galeria',
        categoria,
        remetente,
        q,
        data_inicio: dataInicio,
        data_fim: dataFim,
        page: novoPage,
        limit,
        ordem,
      });
      const data = resp?.data || {};
      const novos = Array.isArray(data.resultados) ? data.resultados : [];
      setTotal(data.total || 0);
      if (novoPage === 1) {
        setResultados(novos);
      } else {
        setResultados(prev => {
          const seen = new Set(prev.map(p => p.id));
          return [...prev, ...novos.filter(n => !seen.has(n.id))];
        });
      }
      setHasMore(novoPage * limit < (data.total || 0));
      setPage(novoPage);
    } catch (e) {
      // Erro silencioso: apenas exibe estado vazio na aba da galeria.
      // Mostra toast só na primeira tentativa (evita cascata de toasts em re-fetches).
      if (novoPage === 1) {
        toast.error('Erro ao carregar: ' + (e?.message || 'falha'));
      }
      if (novoPage === 1) setResultados([]);
      if (novoPage === 1) setTotal(0);
      if (novoPage === 1) setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [conversaId, categoria, remetente, q, dataInicio, dataFim, ordem, limit]);

  useEffect(() => {
    if (!enabled || !conversaId) return;
    carregar(1);
  }, [carregar, enabled, conversaId]);

  const carregarMais = useCallback(() => {
    if (loading || !hasMore) return;
    carregar(page + 1);
  }, [loading, hasMore, page, carregar]);

  return { resultados, total, page, loading, hasMore, carregarMais, recarregar: () => carregar(1) };
}
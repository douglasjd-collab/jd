import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Guarda requisição em voo para evitar cascata de chamadas (rate limit 429)
  const inflightRef = useRef(false);
  const cooldownAteRef = useRef(0);

  const carregar = useCallback(async (novoPage = 1) => {
    if (!conversaId) return;
    // Se já existe uma chamada em voo, ignora (evita 429 por concorrência)
    if (inflightRef.current) return;
    // Respeita cooldown pós-429 para não martelar o backend
    if (Date.now() < cooldownAteRef.current) return;
    inflightRef.current = true;
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
      const eh429 = e?.status === 429 || e?.statusCode === 429 || String(e?.message || '').includes('429');
      if (eh429) {
        // Rate limit: aplica cooldown de 2s para não saturar o backend
        cooldownAteRef.current = Date.now() + 2000;
        if (novoPage === 1) { setResultados([]); setTotal(0); setHasMore(false); }
      } else if (novoPage === 1) {
        // Erro real: exibe toast uma única vez (primeira página)
        toast.error('Erro ao carregar: ' + (e?.message || 'falha'));
        setResultados([]); setTotal(0); setHasMore(false);
      }
    } finally {
      inflightRef.current = false;
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
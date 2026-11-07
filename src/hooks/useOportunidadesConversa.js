import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useOportunidadesConversa(conversa, empresaId) {
  const queryClient = useQueryClient();
  const telefone = conversa?.cliente_telefone || '';
  const clienteId = conversa?.cliente_id || '';
  const filtros = useMemo(() => {
    const limpo = telefone.replace(/\D/g, '');
    const variantes = new Set([telefone, limpo]);
    if (limpo.length === 10 || limpo.length === 11) variantes.add('55' + limpo);
    if (limpo.startsWith('55') && (limpo.length === 12 || limpo.length === 13)) variantes.add(limpo.slice(2));
    const numeros = [...variantes].filter(Boolean);
    const alternativas = [];
    if (clienteId) alternativas.push({ cliente_id: clienteId });
    if (numeros.length) alternativas.push({ cliente_telefone: { $in: numeros } }, { telefone_lead: { $in: numeros } });
    return alternativas;
  }, [telefone, clienteId]);
  const queryKey = ['oportunidades-conversa', empresaId, conversa?.id, clienteId, telefone];
  const consulta = useQuery({
    queryKey,
    enabled: !!empresaId && !!conversa?.id && filtros.length > 0,
    staleTime: 30000,
    queryFn: async () => {
      const resultado = [];
      for (let skip = 0; ; skip += 100) {
        const pagina = await base44.entities.Oportunidade.filter({ empresa_id: empresaId, $or: filtros }, '-updated_date', 100, skip);
        resultado.push(...pagina);
        if (pagina.length < 100) break;
      }
      return resultado;
    },
  });
  useEffect(() => {
    if (!empresaId || !conversa?.id || !filtros.length) return;
    return base44.entities.Oportunidade.subscribe((event) => {
      const registro = event.data;
      const corresponde = registro?.empresa_id === empresaId && filtros.some(f =>
        f.cliente_id ? registro.cliente_id === f.cliente_id :
        Object.entries(f).some(([campo, condicao]) => condicao.$in.includes(registro[campo]))
      );
      const cache = queryClient.getQueryData(queryKey) || [];
      if (corresponde || cache.some(o => o.id === event.id)) {
        queryClient.invalidateQueries({ queryKey });
      }
    });
  }, [empresaId, conversa?.id, filtros, queryClient, clienteId, telefone]);
  return consulta.data || [];
}

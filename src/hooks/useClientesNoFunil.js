import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Clientes que estão no funil de vendas (oportunidades abertas).
 * Usado pelo filtro rápido "Clientes no Funil" do Bate-Papo.
 * Retorna um helper que verifica se uma conversa pertence a um cliente do funil,
 * comparando o telefone da conversa com o telefone da oportunidade (somente dígitos).
 */
export default function useClientesNoFunil(empresaId) {
  const { data: oportunidades = [] } = useQuery({
    queryKey: ['oportunidades-funil-chat', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const itens = await base44.entities.Oportunidade.filter(
        { empresa_id: empresaId, status: 'aberta' },
        '-updated_date',
        1000
      );
      return itens || [];
    },
    refetchInterval: 30000,
  });

  const telefonesNoFunil = useMemo(() => {
    const telefones = new Set();
    oportunidades.forEach(o => {
      const tel = String(o.cliente_telefone || o.telefone_lead || '').replace(/\D/g, '');
      if (!tel) return;
      telefones.add(tel);
      if (tel.startsWith('55') && tel.length > 10) telefones.add(tel.slice(2));
    });
    return telefones;
  }, [oportunidades]);

  const estaNoFunil = (conversa) => {
    const tel = String(conversa?.cliente_telefone || '').replace(/\D/g, '');
    if (!tel) return false;
    return telefonesNoFunil.has(tel) || (tel.startsWith('55') && telefonesNoFunil.has(tel.slice(2)));
  };

  return { estaNoFunil, totalNoFunil: telefonesNoFunil.size };
}
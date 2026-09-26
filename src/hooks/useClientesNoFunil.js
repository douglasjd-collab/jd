import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Clientes que estão no funil de vendas em aberto.
 * Usado pelo filtro rápido "Clientes no Funil" do Bate-Papo.
 *
 * Regra: entram apenas oportunidades em aberto. Oportunidades já ganhas
 * (status 'ganha' ou etapa do tipo 'ganho') são desconsideradas, inclusive
 * quando o cliente também possui uma oportunidade aberta.
 *
 * Retorna um helper que verifica se uma conversa pertence a um cliente do funil,
 * comparando o telefone da conversa com o telefone da oportunidade (somente dígitos).
 */
export default function useClientesNoFunil(empresaId) {
  const { data } = useQuery({
    queryKey: ['oportunidades-funil-chat', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const [itens, etapas] = await Promise.all([
        base44.entities.Oportunidade.filter({ empresa_id: empresaId }, '-updated_date', 1000),
        base44.entities.EtapaFunil.filter({ empresa_id: empresaId }, null, 300),
      ]);
      const tipoPorEtapa = {};
      (etapas || []).forEach(e => { tipoPorEtapa[e.id] = e.tipo; });
      return { itens: itens || [], tipoPorEtapa };
    },
    refetchInterval: 30000,
  });

  const telefonesNoFunil = useMemo(() => {
    const tipoPorEtapa = data?.tipoPorEtapa || {};
    const ganhos = new Set();
    const abertos = new Set();

    const variantes = (valor) => {
      const tel = String(valor || '').replace(/\D/g, '');
      if (!tel) return [];
      const lista = [tel];
      if (tel.startsWith('55') && tel.length > 10) lista.push(tel.slice(2));
      return lista;
    };

    (data?.itens || []).forEach(o => {
      const ehGanho = o.status === 'ganha' || tipoPorEtapa[o.etapa_id] === 'ganho';
      const destino = ehGanho ? ganhos : (o.status === 'aberta' ? abertos : null);
      if (!destino) return;
      variantes(o.cliente_telefone || o.telefone_lead).forEach(tel => destino.add(tel));
    });

    // Cliente com qualquer oportunidade ganha sai do funil, mesmo que tenha outra em aberto
    ganhos.forEach(tel => abertos.delete(tel));
    return abertos;
  }, [data]);

  const estaNoFunil = (conversa) => {
    const tel = String(conversa?.cliente_telefone || '').replace(/\D/g, '');
    if (!tel) return false;
    return telefonesNoFunil.has(tel) || (tel.startsWith('55') && telefonesNoFunil.has(tel.slice(2)));
  };

  return { estaNoFunil, totalNoFunil: telefonesNoFunil.size };
}
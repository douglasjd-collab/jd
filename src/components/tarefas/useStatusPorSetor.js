import { useQuery } from '@tanstack/react-query';
import { carregarConfigStatusSetor } from './statusSetorConfig';

export default function useStatusPorSetor(empresaId) {
  const { data: config = {} } = useQuery({
    queryKey: ['status-por-setor', empresaId],
    enabled: !!empresaId,
    queryFn: () => carregarConfigStatusSetor(empresaId),
  });
  return (lista = [], setorId, atual) => {
    const cfg = config[setorId];
    let resultado = lista.filter(s => !s.slug?.startsWith('setor_') || s.slug.startsWith('setor_' + setorId + '_'));
    if (cfg?.usar_especificas) {
      resultado = (cfg.status_slugs || []).map(slug => lista.find(s => (s.slug || s.id) === slug)).filter(Boolean);
    }
    const existente = atual && lista.find(s => (s.slug || s.id) === atual);
    if (existente && !resultado.some(s => (s.slug || s.id) === atual)) resultado = [...resultado, existente];
    return resultado;
  };
}

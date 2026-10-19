import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function useStatusPorSetor(empresaId) {
  const { data: config = {} } = useQuery({
    queryKey: ['status-por-setor', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const rows = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'status_por_setor' });
      try { return JSON.parse(rows[0]?.valor || '{}'); } catch { return {}; }
    },
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

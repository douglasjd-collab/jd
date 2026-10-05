import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Carrega as pendências de vinculação de tipo (e as últimas vinculações concluídas).
 * Compartilhado entre a página de Tipos de Empréstimo (contadores das abas) e a lista de pendências.
 */
export default function usePendenciasVinculacao(empresaId) {
  const queryClient = useQueryClient();

  const { data: pendencias = [], isLoading } = useQuery({
    queryKey: ['pendencias-vinculacao', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const lista = await base44.entities.PendenciaVinculacaoTipo.filter(
        { empresa_id: empresaId, status: 'pendente' }, '-ultima_ocorrencia', 200
      );
      return lista || [];
    },
  });

  const { data: historico = [] } = useQuery({
    queryKey: ['pendencias-vinculacao-historico', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const lista = await base44.entities.PendenciaVinculacaoTipo.filter(
        { empresa_id: empresaId, status: 'resolvida' }, '-vinculado_em', 5
      );
      return lista || [];
    },
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ['pendencias-vinculacao', empresaId] });
    queryClient.invalidateQueries({ queryKey: ['pendencias-vinculacao-historico', empresaId] });
  };

  return { pendencias, isLoading, historico, recarregar };
}
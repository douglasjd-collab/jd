import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useTarefaFormData(empresaId) {
  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-tarefa', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 200),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-tarefa', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: () => base44.entities.Cliente.filter({ empresa_id: empresaId }, 'nome_completo', 500),
  });

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-tarefa'],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: async () => {
      try { return await base44.entities.StatusTarefa.list('ordem', 100); }
      catch { return [{ slug: 'a_fazer', nome: 'A Fazer' }, { slug: 'em_andamento', nome: 'Em Andamento' }, { slug: 'concluido', nome: 'Concluído' }]; }
    },
  });

  const { data: setores = [] } = useQuery({
    queryKey: ['setores-tarefa', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: async () => {
      try { return await base44.entities.SetorTarefa.filter({ empresa_id: empresaId, status: 'ativo' }); }
      catch { return []; }
    },
  });

  const { data: subsetores = [] } = useQuery({
    queryKey: ['subsetores-tarefa', empresaId],
    enabled: !!empresaId,
    staleTime: 60000,
    queryFn: async () => {
      try { return await base44.entities.SubsetorTarefa.filter({ empresa_id: empresaId, ativo: true }); }
      catch { return []; }
    },
  });

  return { colaboradores, clientes, statusList, setores, subsetores };
}
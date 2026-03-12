import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import TarefaCard from '@/components/tarefas/TarefaCard';
import TarefaFormModal from '@/components/tarefas/TarefaFormModal';
import TarefaDetalhesModal from '@/components/tarefas/TarefaDetalhesModal';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STATUS_PADRAO = [
  { slug: 'a_fazer', nome: 'A Fazer', cor: '#f59e0b', ordem: 1 },
  { slug: 'aguardando_documentacao', nome: 'Aguardando Documentação', cor: '#3b82f6', ordem: 2 },
  { slug: 'em_analise', nome: 'Em Análise', cor: '#8b5cf6', ordem: 3 },
  { slug: 'retornado_pendencia', nome: 'Retornado com Pendência', cor: '#f97316', ordem: 4 },
  { slug: 'concluido', nome: 'Concluído', cor: '#22c55e', ordem: 5 },
  { slug: 'arquivado', nome: 'Arquivado', cor: '#94a3b8', ordem: 6 },
];

export default function Tarefas() {
  const [currentUser, setCurrentUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) return;
      if (me.role === 'super_admin') {
        setCurrentUser({ ...me, perfil: 'super_admin', empresa_id: null });
        return;
      }
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const c = colabs[0];
        setCurrentUser({ ...me, colaborador_id: c.id, empresa_id: c.empresa_id, perfil: c.perfil, nome_perfil: c.nome });
      } else {
        setCurrentUser({ ...me, perfil: 'vendedor', empresa_id: null });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const empresaId = currentUser?.empresa_id;

  const { data: statusCustom = [] } = useQuery({
    queryKey: ['status-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.StatusTarefa.filter({ empresa_id: empresaId, ativo: true }),
  });

  const statusList = useMemo(() => {
    if (statusCustom.length > 0) return [...statusCustom].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    return STATUS_PADRAO;
  }, [statusCustom]);

  const { data: tarefas = [] } = useQuery({
    queryKey: ['tarefas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Tarefa.filter({ empresa_id: empresaId }, '-created_date'),
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Cliente.filter({ empresa_id: empresaId, status: 'ativo' }),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['checklist-templates', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ChecklistTemplate.filter({ empresa_id: empresaId }),
  });

  const criarTarefa = useMutation({
    mutationFn: (data) => base44.entities.Tarefa.create({ ...data, empresa_id: empresaId, criado_por_id: currentUser?.id, criado_por_nome: currentUser?.nome_perfil || currentUser?.full_name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarefas'] }); setFormOpen(false); toast.success('Tarefa criada!'); },
  });

  const atualizarTarefa = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Tarefa.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarefas'] }); setFormOpen(false); setTarefaSelecionada(null); toast.success('Tarefa atualizada!'); },
  });

  const excluirTarefa = useMutation({
    mutationFn: (id) => base44.entities.Tarefa.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarefas'] }); toast.success('Tarefa excluída!'); },
  });

  const salvarTemplate = useMutation({
    mutationFn: (data) => base44.entities.ChecklistTemplate.create({ ...data, empresa_id: empresaId, criado_por_id: currentUser?.id, criado_por_nome: currentUser?.nome_perfil || currentUser?.full_name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklist-templates'] }); toast.success('Template salvo!'); },
  });

  const handleSave = (data, id) => {
    if (id) atualizarTarefa.mutate({ id, data });
    else criarTarefa.mutate(data);
  };

  const handleUpdate = (id, data) => {
    base44.entities.Tarefa.update(id, data).then(() => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      // atualizar local no modal
      if (tarefaSelecionada?.id === id) {
        setTarefaSelecionada(prev => ({ ...prev, ...data }));
      }
    });
  };

  const hoje = format(new Date(), 'yyyy-MM-dd');

  // Filtro de busca
  const tarefasFiltradas = tarefas.filter(t => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return t.titulo?.toLowerCase().includes(s) || t.cliente_nome?.toLowerCase().includes(s);
  });

  // Contadores badge
  const atrasadas = tarefas.filter(t => t.data_conclusao_prevista && t.data_conclusao_prevista < hoje && t.status !== 'concluido' && t.status !== 'arquivado').length;
  const aFazer = tarefas.filter(t => t.status === 'a_fazer').length;

  if (!currentUser) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1e3a5f]"></div></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Tarefas" subtitle="Gerencie as tarefas da equipe" actionLabel="Nova Tarefa" onAction={() => { setTarefaSelecionada(null); setFormOpen(true); }}>
        <div className="flex items-center gap-2">
          {atrasadas > 0 && <Badge className="bg-red-600 text-white px-2 py-1 text-sm">{atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</Badge>}
          {aFazer > 0 && <Badge className="bg-yellow-500 text-white px-2 py-1 text-sm">{aFazer} a fazer</Badge>}
          <Link to={createPageUrl('ConfiguracaoTarefas')}>
            <Button variant="outline" size="icon" title="Configurar status e templates"><Settings className="w-4 h-4" /></Button>
          </Link>
        </div>
      </PageHeader>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Buscar tarefa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {statusList.map(status => {
          const colTarefas = tarefasFiltradas.filter(t => t.status === status.slug);
          return (
            <div key={status.slug} className="flex-shrink-0 w-80">
              <div className="bg-white rounded-xl shadow-sm border-0 overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b" style={{ borderTopColor: status.cor, borderTopWidth: 4 }}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 text-sm">{status.nome}</h3>
                    <Badge variant="secondary">{colTarefas.length}</Badge>
                  </div>
                </div>
                {/* Cards */}
                <div className="p-2 space-y-2 min-h-[200px] max-h-[600px] overflow-y-auto">
                  {colTarefas.map(tarefa => (
                    <TarefaCard
                      key={tarefa.id}
                      tarefa={tarefa}
                      statusList={statusList}
                      onEdit={(t) => { setTarefaSelecionada(t); setFormOpen(true); }}
                      onDelete={(t) => { if (confirm(`Excluir tarefa "${t.titulo}"?`)) excluirTarefa.mutate(t.id); }}
                      onVerDetalhes={(t) => { setTarefaSelecionada(t); setDetalhesOpen(true); }}
                    />
                  ))}
                  {colTarefas.length === 0 && (
                    <div className="text-center py-6 text-slate-300 text-xs">Nenhuma tarefa</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <TarefaFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        tarefa={tarefaSelecionada}
        onSave={handleSave}
        colaboradores={colaboradores}
        clientes={clientes}
        statusList={statusList}
        templates={templates}
        currentUser={currentUser}
        onSaveTemplate={(data) => salvarTemplate.mutate(data)}
      />

      <TarefaDetalhesModal
        open={detalhesOpen}
        onOpenChange={setDetalhesOpen}
        tarefa={tarefaSelecionada}
        statusList={statusList}
        currentUser={currentUser}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
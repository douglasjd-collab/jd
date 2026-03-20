import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Settings, AlertTriangle, Clock3, CheckCircle2, UserSquare2, LayoutList, Kanban } from 'lucide-react';
import TarefasLista from '@/components/tarefas/TarefasLista';
import { toast } from 'sonner';
import { format } from 'date-fns';
import TarefaCard from '@/components/tarefas/TarefaCard';
import TarefaFormModal from '@/components/tarefas/TarefaFormModal';
import TarefaDetalhesModal from '@/components/tarefas/TarefaDetalhesModal';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STATUS_PADRAO = [
  { slug: 'a_fazer', nome: 'A Fazer', cor: '#f59e0b', ordem: 1 },
  { slug: 'em_andamento', nome: 'Em Andamento', cor: '#3b82f6', ordem: 2 },
  { slug: 'aguardando_cliente', nome: 'Aguardando Cliente', cor: '#8b5cf6', ordem: 3 },
  { slug: 'aguardando_banco', nome: 'Aguardando Banco', cor: '#f97316', ordem: 4 },
  { slug: 'concluido', nome: 'Concluído', cor: '#22c55e', ordem: 5 },
  { slug: 'arquivado', nome: 'Arquivado', cor: '#94a3b8', ordem: 6 },
];

const SETORES = [
  { value: 'consorcio', label: 'Consórcio' },
  { value: 'emprestimo', label: 'Empréstimo' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'cobranca', label: 'Cobrança' },
];

export default function Tarefas() {
  const [currentUser, setCurrentUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroPrioridade, setFiltroPrioridade] = useState('todas');
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos');
  const [filtroSetor, setFiltroSetor] = useState('todos');
  const [mostrarSoMinhas, setMostrarSoMinhas] = useState(false);
  const [modoVisualizacao, setModoVisualizacao] = useState('lista'); // 'kanban' | 'lista'
  const [abaAtiva, setAbaAtiva] = useState('andamento'); // 'andamento' | 'finalizados'
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

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
    } catch (e) { console.error(e); }
  };

  const empresaId = currentUser?.empresa_id;
  const hoje = format(new Date(), 'yyyy-MM-dd');

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
    queryFn: () => base44.entities.Cliente.filter({ empresa_id: empresaId }, '-created_date', 500),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['checklist-templates', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ChecklistTemplate.filter({ empresa_id: empresaId }),
  });

  const registrarHistorico = async ({ tarefaId, acao, descricao, statusAnterior = null, statusNovo = null, valorAnterior = null, valorNovo = null }) => {
    if (!currentUser || !empresaId) return;
    try {
      await base44.entities.TarefaHistorico.create({
        tarefa_id: tarefaId,
        empresa_id: empresaId,
        usuario_id: currentUser.id,
        usuario_nome: currentUser.nome_perfil || currentUser.full_name || '',
        acao,
        descricao,
        status_anterior: statusAnterior,
        status_novo: statusNovo,
        valor_anterior: valorAnterior,
        valor_novo: valorNovo,
      });
    } catch (e) { console.error('Histórico:', e); }
  };

  const criarTarefa = useMutation({
    mutationFn: async (data) => {
      const tarefa = await base44.entities.Tarefa.create({
        ...data,
        empresa_id: empresaId,
        criado_por_id: currentUser?.id,
        criado_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
        data_cadastro: data.data_cadastro || hoje,
      });
      await registrarHistorico({ tarefaId: tarefa.id, acao: 'criou', descricao: `Criou a tarefa "${tarefa.titulo}"`, statusNovo: tarefa.status });
      return tarefa;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarefas'] }); setFormOpen(false); toast.success('Tarefa criada!'); },
  });

  const atualizarTarefa = useMutation({
    mutationFn: async ({ id, data, tarefaAntiga }) => {
      const result = await base44.entities.Tarefa.update(id, data);
      if (tarefaAntiga?.status && data.status && tarefaAntiga.status !== data.status) {
        await registrarHistorico({ tarefaId: id, acao: 'moveu_status', descricao: `Status alterado`, statusAnterior: tarefaAntiga.status, statusNovo: data.status });
      }
      if (tarefaAntiga?.data_conclusao_prevista && data.data_conclusao_prevista && tarefaAntiga.data_conclusao_prevista !== data.data_conclusao_prevista) {
        await registrarHistorico({ tarefaId: id, acao: 'alterou_prazo', descricao: `Prazo alterado`, valorAnterior: tarefaAntiga.data_conclusao_prevista, valorNovo: data.data_conclusao_prevista });
      }
      return result;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarefas'] }); setFormOpen(false); setTarefaSelecionada(null); toast.success('Tarefa atualizada!'); },
  });

  const excluirTarefa = useMutation({
    mutationFn: async (tarefa) => {
      await registrarHistorico({ tarefaId: tarefa.id, acao: 'excluiu', descricao: `Excluiu a tarefa "${tarefa.titulo}"` });
      return base44.entities.Tarefa.delete(tarefa.id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarefas'] }); toast.success('Tarefa excluída!'); },
  });

  const salvarTemplate = useMutation({
    mutationFn: (data) => base44.entities.ChecklistTemplate.create({ ...data, empresa_id: empresaId, criado_por_id: currentUser?.id, criado_por_nome: currentUser?.nome_perfil || currentUser?.full_name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklist-templates'] }); toast.success('Template salvo!'); },
  });

  const handleSave = (data, id) => {
    if (id) atualizarTarefa.mutate({ id, data, tarefaAntiga: tarefaSelecionada });
    else criarTarefa.mutate(data);
  };

  const handleUpdate = async (id, data) => {
    const tarefaOriginal = tarefas.find(t => t.id === id);
    await base44.entities.Tarefa.update(id, data);
    if (tarefaOriginal?.status && data.status && tarefaOriginal.status !== data.status) {
      await registrarHistorico({ tarefaId: id, acao: 'moveu_status', descricao: `Status alterado`, statusAnterior: tarefaOriginal.status, statusNovo: data.status });
    }
    queryClient.invalidateQueries({ queryKey: ['tarefas'] });
    if (tarefaSelecionada?.id === id) setTarefaSelecionada(prev => ({ ...prev, ...data }));
  };

  const tarefasFiltradas = tarefas.filter(t => {
    const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const s = normalize(search);
    const matchBusca = !search.trim() || normalize(t.titulo).includes(s) || normalize(t.cliente_nome).includes(s);
    const matchStatus = filtroStatus === 'todos' || t.status === filtroStatus;
    const matchPrioridade = filtroPrioridade === 'todas' || t.prioridade === filtroPrioridade;
    const matchSetor = filtroSetor === 'todos' || t.setor === filtroSetor;
    let responsaveisIds = [];
    try { responsaveisIds = t.responsaveis_ids ? JSON.parse(t.responsaveis_ids) : []; } catch {}
    const matchResponsavel = filtroResponsavel === 'todos' || t.responsavel_principal_id === filtroResponsavel || responsaveisIds.includes(filtroResponsavel);
    const matchMinhas = !mostrarSoMinhas || t.responsavel_principal_id === currentUser?.id || responsaveisIds.includes(currentUser?.id);
    return matchBusca && matchStatus && matchPrioridade && matchSetor && matchResponsavel && matchMinhas;
  });

  const atrasadas = tarefas.filter(t => t.data_conclusao_prevista && t.data_conclusao_prevista < hoje && t.status !== 'concluido' && t.status !== 'arquivado').length;
  const minhasTarefas = tarefas.filter(t => {
    let ids = [];
    try { ids = t.responsaveis_ids ? JSON.parse(t.responsaveis_ids) : []; } catch {}
    return t.responsavel_principal_id === currentUser?.id || ids.includes(currentUser?.id);
  }).length;
  const vencemHoje = tarefas.filter(t => t.data_conclusao_prevista === hoje && t.status !== 'concluido' && t.status !== 'arquivado').length;
  const concluidas = tarefas.filter(t => t.status === 'concluido').length;

  if (!currentUser) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1e3a5f]" />
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tarefas"
        subtitle="Gerencie tarefas da equipe com histórico e responsáveis múltiplos"
        actionLabel="Nova Tarefa"
        onAction={() => { setTarefaSelecionada(null); setFormOpen(true); }}
      >
        <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-slate-100">
          <Button
            variant={modoVisualizacao === 'lista' ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 gap-1.5 ${modoVisualizacao === 'lista' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            onClick={() => setModoVisualizacao('lista')}
            title="Lista"
          >
            <LayoutList className="w-4 h-4" />
            <span className="text-xs">Lista</span>
          </Button>
          <Button
            variant={modoVisualizacao === 'kanban' ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 gap-1.5 ${modoVisualizacao === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            onClick={() => setModoVisualizacao('kanban')}
            title="Kanban"
          >
            <Kanban className="w-4 h-4" />
            <span className="text-xs">Kanban</span>
          </Button>
        </div>
        <Link to={createPageUrl('ConfiguracaoTarefas')}>
          <Button variant="outline" size="icon" title="Configurar status e templates"><Settings className="w-4 h-4" /></Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Minhas tarefas</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{minhasTarefas}</p>
          </div>
          <UserSquare2 className="w-8 h-8 text-slate-300" />
        </div>
        <div className="rounded-2xl bg-white border shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Atrasadas</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{atrasadas}</p>
          </div>
          <AlertTriangle className="w-8 h-8 text-red-200" />
        </div>
        <div className="rounded-2xl bg-white border shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Vencem hoje</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{vencemHoje}</p>
          </div>
          <Clock3 className="w-8 h-8 text-amber-200" />
        </div>
        <div className="rounded-2xl bg-white border shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Concluídas</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{concluidas}</p>
          </div>
          <CheckCircle2 className="w-8 h-8 text-green-200" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar tarefa ou cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <select className="h-9 rounded-lg border px-3 text-sm bg-white" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="todos">Todos status</option>
            {statusList.map(s => <option key={s.slug} value={s.slug}>{s.nome}</option>)}
          </select>
          <select className="h-9 rounded-lg border px-3 text-sm bg-white" value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}>
            <option value="todas">Todas prioridades</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
          <select className="h-9 rounded-lg border px-3 text-sm bg-white" value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
            <option value="todos">Todos setores</option>
            {SETORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="h-9 rounded-lg border px-3 text-sm bg-white flex-1" value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)}>
              <option value="todos">Todos responsáveis</option>
              {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <Button
              variant={mostrarSoMinhas ? 'default' : 'outline'}
              size="sm"
              className={mostrarSoMinhas ? 'bg-[#1e3a5f] text-white h-9 px-3' : 'h-9 px-3'}
              onClick={() => setMostrarSoMinhas(p => !p)}
            >
              Minhas
            </Button>
          </div>
        </div>
      </div>

      {modoVisualizacao === 'lista' ? (
        <TarefasLista
          tarefas={tarefasFiltradas}
          statusList={statusList}
          onEdit={(t) => { setTarefaSelecionada(t); setFormOpen(true); }}
          onDelete={(t) => { if (confirm(`Excluir tarefa "${t.titulo}"?`)) excluirTarefa.mutate(t); }}
          onVerDetalhes={(t) => { setTarefaSelecionada(t); setDetalhesOpen(true); }}
        />
      ) : null}

      {modoVisualizacao === 'kanban' && (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {statusList.map(status => {
          const colTarefas = tarefasFiltradas.filter(t => t.status === status.slug);
          return (
            <div key={status.slug} className="flex-shrink-0 w-80">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderTop: `4px solid ${status.cor}` }}>
                <div className="px-4 py-3 flex items-center justify-between border-b bg-slate-50">
                  <h3 className="font-semibold text-slate-800 text-sm">{status.nome}</h3>
                  <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">{colTarefas.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[200px] max-h-[600px] overflow-y-auto">
                  {colTarefas.map(tarefa => (
                    <TarefaCard
                      key={tarefa.id}
                      tarefa={tarefa}
                      statusList={statusList}
                      onEdit={(t) => { setTarefaSelecionada(t); setFormOpen(true); }}
                      onDelete={(t) => { if (confirm(`Excluir tarefa "${t.titulo}"?`)) excluirTarefa.mutate(t); }}
                      onVerDetalhes={(t) => { setTarefaSelecionada(t); setDetalhesOpen(true); }}
                    />
                  ))}
                  {colTarefas.length === 0 && (
                    <div className="text-center py-8 text-slate-300 text-xs">Nenhuma tarefa</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

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
        colaboradores={colaboradores}
      />
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search, MoreHorizontal, Pencil, Trash2, Plus, Upload,
        User, Calendar, Building2, FileText, MessageCircle,
        TrendingUp, Clock, CheckCircle2, Settings, Loader2,
        AlignJustify, Kanban, ArrowRightLeft, DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PropostaEditModal from '@/components/forms/PropostaEditModal';
import ImportarPropostasLoteModal from '@/components/emprestimos/ImportarPropostasLoteModal';
import KanbanConfigModal from '@/components/emprestimos/KanbanConfigModal';
import ComentariosModal from '@/components/emprestimos/ComentariosModal';
import StatusQuickModal from '@/components/emprestimos/StatusQuickModal';
import PortabilidadeHojeModal from '@/components/emprestimos/PortabilidadeHojeModal';

const TIPO_LABELS = {
  NOVO: 'Novo',
  REFINANCIAMENTO: 'Refinanciamento',
  PORTABILIDADE_PURA: 'Portabilidade',
  REFIN_PORTABILIDADE: 'Refin + Port',
};

const TIPO_COLORS = {
  NOVO: 'bg-blue-100 text-blue-700',
  REFINANCIAMENTO: 'bg-purple-100 text-purple-700',
  PORTABILIDADE_PURA: 'bg-emerald-100 text-emerald-700',
  REFIN_PORTABILIDADE: 'bg-orange-100 text-orange-700',
};

const STATUS_COLOR_MAP = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-500 text-white',
  yellow: 'bg-yellow-100 text-yellow-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
};

export default function VendasEmprestimos() {
  const navigate = useNavigate();
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterBanco, setFilterBanco] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [searchNome, setSearchNome] = useState('');
  const [searchCpf, setSearchCpf] = useState('');
  const [searchBancoText, setSearchBancoText] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [propostaToDelete, setPropostaToDelete] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [propostaToEdit, setPropostaToEdit] = useState(null);
  const [importarLoteOpen, setImportarLoteOpen] = useState(false);
  const [kanbanConfigOpen, setKanbanConfigOpen] = useState(false);
  const [comentariosOpen, setComentariosOpen] = useState(false);
  const [propostaComentarios, setPropostaComentarios] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [propostaStatus, setPropostaStatus] = useState(null);
  const [portabilidadeHojeOpen, setPortabilidadeHojeOpen] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'kanban'
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setCurrentUser({ ...me, auth_id: me.id, empresa_id: null, perfil: 'super_admin' });
        return;
      }
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date');
      if (!colabs || colabs.length === 0) {
        setCurrentUser({ ...me, auth_id: me.id, empresa_id: null, perfil: 'vendedor' });
        return;
      }
      const colab = colabs[0];
      setCurrentUser({ ...me, auth_id: me.id, empresa_id: colab.empresa_id || null, perfil: colab.perfil || 'vendedor', colaborador_id: colab.id });
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ['vendas-emprestimos', currentUser?.empresa_id, currentUser?.perfil],
    enabled: !!currentUser,
    queryFn: () => {
      const isSuperAdmin = currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'master';
      const filter = { produto: 'emprestimo' };
      if (!isSuperAdmin && currentUser?.empresa_id) filter.empresa_id = currentUser.empresa_id;
      return base44.entities.Proposta.filter(filter, '-data_venda', 500);
    },
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos-emprestimos'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });

  const getBanco = (administradoraId) => bancos.find(b => b.id === administradoraId);

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-emprestimos'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-propostas-emprestimos'],
    queryFn: () => base44.entities.StatusProposta.filter({ ativo: true }),
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['colaboradores-vendedores', currentUser?.empresa_id],
    enabled: !!currentUser && podeVerTodos,
    queryFn: () => {
      const filter = { status: 'ativo' };
      if (currentUser?.empresa_id) filter.empresa_id = currentUser.empresa_id;
      return base44.entities.Colaborador.filter(filter, 'nome');
    },
  });

  const getCliente = (clienteId) => clientes.find(c => c.id === clienteId);
  const getClienteCpf = (clienteId) => {
    const c = getCliente(clienteId);
    return c?.cpf || c?.pj_cnpj || '';
  };

  const getStatusConfig = (proposta) => {
    if (proposta.status_id) return statusList.find(s => s.id === proposta.status_id);
    return statusList.find(s => s.codigo === proposta.status || normStr(s.nome) === normStr(proposta.status));
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Proposta.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      setDeleteDialogOpen(false);
      setPropostaToDelete(null);
      toast.success('Proposta excluída com sucesso!');
    },
    onError: () => toast.error('Erro ao excluir proposta'),
  });

  const isAdmin = ['master', 'super_admin', 'admin'].includes(currentUser?.perfil);
  const podeVerTodos = isAdmin || ['gerente', 'colaborador', 'funcionario'].includes(currentUser?.perfil);
  

  const filteredByRole = propostas.filter(p => {
    if (podeVerTodos) return true;
    return p.vendedor_id === currentUser?.colaborador_id;
  });

  const normStr = s => String(s || '').toLowerCase().trim();

  const isPagoFilter = filterStatus !== 'todos' && statusList.find(s => s.id === filterStatus && (s.nome?.toLowerCase().includes('pago') || s.funcao_fluxo === 'finalizado'));

  const filteredPropostas = filteredByRole.filter(p => {
    const cpf = getClienteCpf(p.cliente_id) || p.cliente_cpf || '';
    const matchNome = !searchNome || p.cliente_nome?.toLowerCase().includes(searchNome.toLowerCase());
    const matchCpf = !searchCpf || cpf.includes(searchCpf);
    const matchBancoText = !searchBancoText || p.administradora_nome?.toLowerCase().includes(searchBancoText.toLowerCase());
    const matchBanco = filterBanco === 'todos' || p.administradora_nome === filterBanco;
    const matchTipo = filterTipo === 'todos' || p.emprestimo_tipo === filterTipo;
    const filterStatusObj = statusList.find(s => s.id === filterStatus);
    const matchStatus = filterStatus === 'todos' || 
      p.status_id === filterStatus || 
      (!p.status_id && filterStatusObj && (normStr(p.status) === normStr(filterStatusObj.nome) || normStr(p.status) === normStr(filterStatusObj.codigo)));
    const matchVendedor = filterVendedor === 'todos' || p.vendedor_id === filterVendedor || (filterVendedor === 'sem_vendedor' && !p.vendedor_id);
    return matchNome && matchCpf && matchBancoText && matchBanco && matchTipo && matchStatus && matchVendedor;
  }).sort((a, b) => {
    if (isPagoFilter) {
      const dateA = a.emprestimo_data_liberacao || a.data_venda || '';
      const dateB = b.emprestimo_data_liberacao || b.data_venda || '';
      return dateB.localeCompare(dateA);
    }
    const dateA = a.data_venda || '';
    const dateB = b.data_venda || '';
    return dateB.localeCompare(dateA);
  });

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const getTipoLabel = (proposta) => TIPO_LABELS[proposta.emprestimo_tipo] || proposta.emprestimo_tipo || 'Pessoal';

  // Summary stats
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.substring(0, 7); // YYYY-MM
  
  const todayPropostas = filteredByRole.filter(p => p.data_venda === today);
  const valorHoje = todayPropostas.reduce((acc, p) => acc + (p.valor_credito || 0), 0);

  // IDs de status com funcao_fluxo 'finalizado' ou nome 'Pago'
  const statusPagoIds = statusList
    .filter(s => s.funcao_fluxo === 'finalizado' || ['pago', 'paga'].includes(normStr(s.nome)))
    .map(s => s.id);

  const isPaga = (p) =>
    (p.status_id && statusPagoIds.includes(p.status_id)) ||
    ['pago', 'paga', 'pago_vendedor'].includes(normStr(p.status));

  // Propostas pagas
  const propostas_pagas_mes = filteredByRole.filter(isPaga);
  const valor_pagas_mes = propostas_pagas_mes.reduce((acc, p) => acc + (p.valor_credito || 0), 0);

  // IDs de status com funcao_fluxo 'cancelado' ou nome 'Cancelado'
  const statusCanceladoIds = statusList
    .filter(s => s.funcao_fluxo === 'cancelado' || normStr(s.nome) === 'cancelado')
    .map(s => s.id);
  const isCancelada = (p) =>
    (p.status_id && statusCanceladoIds.includes(p.status_id)) ||
    normStr(p.status) === 'cancelado';

  // Em andamento: todas as propostas MENOS canceladas MENOS pagas
  const emAndamento = filteredByRole.filter(p => !isPaga(p) && !isCancelada(p));
  const valor_em_andamento = emAndamento.reduce((acc, p) => acc + (p.valor_credito || 0), 0);

  // Portabilidades previstas para hoje (data_venda === hoje e tipo portabilidade)
  const portabilidadesHoje = filteredByRole.filter(p =>
    ['PORTABILIDADE_PURA', 'REFIN_PORTABILIDADE'].includes(p.emprestimo_tipo) &&
    p.emprestimo_data_liberacao === today
  );
  const valorPortabilidadesHoje = portabilidadesHoje.reduce((acc, p) => acc + (p.valor_credito || 0), 0);

  // CIP - Retorno de Saldo previsto para hoje (excluindo propostas com status resolvido)
  const propostasCip = filteredByRole.filter(p =>
    p.cip_data_retorno_prevista === today && p.cip_valor_previsto && 
    !isPaga(p) && !isCancelada(p) && normStr(p.status) !== 'saldo_retornado'
  );

  // Counts per tipo for filter pills
  const countByTipo = (tipo) => tipo === 'todos'
    ? filteredByRole.length
    : filteredByRole.filter(p => p.emprestimo_tipo === tipo).length;

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23BE84]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Empréstimos</h1>
          <p className="text-slate-500 mt-1">{filteredPropostas.length} propostas encontradas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'cards' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <AlignJustify className="w-4 h-4" /> Tabela
            </button>
            <div className="w-px h-6 bg-slate-200" />
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'kanban' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Kanban className="w-4 h-4" /> Kanban
            </button>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => setImportarLoteOpen(true)}>
            <Upload className="w-4 h-4" />
            Importar em Lote
          </Button>
          <Button
            className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
            onClick={() => navigate(createPageUrl('NovaVendaEmprestimo'))}
          >
            <Plus className="w-4 h-4" />
            Nova Venda
          </Button>
        </div>
      </div>

      {/* CIP Retorno Alert */}
      {propostasCip.length > 0 && (
        <button
          onClick={() => setPortabilidadeHojeOpen(true)}
          className="w-full text-left"
        >
          <div className="bg-white rounded-xl shadow-sm border border-orange-100 hover:border-orange-200 p-4 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900">💰 Retorno de Saldo CIP — Hoje!</h3>
                <p className="text-sm text-orange-700 mt-1">
                  <strong>{propostasCip.length} proposta(s)</strong> com retorno de saldo previsto para hoje.
                </p>
              </div>
              <span className="text-orange-600 text-sm font-bold bg-orange-100 px-3 py-1 rounded-full border border-orange-300">
                Ver
              </span>
            </div>
          </div>
        </button>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Hoje</p>
              <p className="font-bold text-slate-900 text-sm">{formatCurrency(valorHoje)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">{todayPropostas.length} propostas</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Em andamento</p>
              <p className="font-bold text-slate-900 text-sm">{formatCurrency(valor_em_andamento)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">{emAndamento.length} propostas</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Pagas</p>
              <p className="font-bold text-slate-900">{formatCurrency(valor_pagas_mes)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">{propostas_pagas_mes.length} propostas</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Valor total do dia</p>
              <p className="font-bold text-slate-900 text-sm">{formatCurrency(valorHoje)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros rápidos por status */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterStatus('todos')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${filterStatus === 'todos' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          Todos <span className="bg-white/20 text-inherit px-1.5 py-0.5 rounded-full text-xs">{filteredByRole.length}</span>
        </button>
        {[...statusList].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(s => {
          const colorClass = STATUS_COLOR_MAP[s.cor] || STATUS_COLOR_MAP.slate;
          const isActive = filterStatus === s.id;
          const count = filteredByRole.filter(p => p.status_id === s.id || normStr(p.status) === normStr(s.nome) || normStr(p.status) === normStr(s.codigo)).length;
          return (
            <button
              key={s.id}
              onClick={() => setFilterStatus(isActive ? 'todos' : s.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 border-2 ${
                isActive
                  ? 'border-slate-800 ring-2 ring-slate-800 ring-offset-1 bg-slate-800 text-white'
                  : `border-transparent ${colorClass}`
              }`}
            >
              {s.nome} <span className="opacity-70 text-xs">{count}</span>
            </button>
          );
        })}
        <button
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center ml-auto"
                onClick={() => setKanbanConfigOpen(true)}
                title="Configurar Kanban"
              >
                <Settings className="w-4 h-4" />
              </button>
      </div>

      {/* Filtros de busca */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar por nome..." value={searchNome} onChange={(e) => setSearchNome(e.target.value)} className="pl-9 border-0 bg-slate-50" />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar por CPF..." value={searchCpf} onChange={(e) => setSearchCpf(e.target.value)} className="pl-9 border-0 bg-slate-50" />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar por banco..." value={searchBancoText} onChange={(e) => setSearchBancoText(e.target.value)} className="pl-9 border-0 bg-slate-50" />
          </div>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-full sm:w-44 border-0 bg-slate-50">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              <SelectItem value="NOVO">Novo</SelectItem>
              <SelectItem value="REFINANCIAMENTO">Refinanciamento</SelectItem>
              <SelectItem value="PORTABILIDADE_PURA">Portabilidade</SelectItem>
              <SelectItem value="REFIN_PORTABILIDADE">Refin + Port</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {[...statusList].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(s => {
              const colPropostas = filteredPropostas.filter(p => p.status === s.codigo);
              const colColor = STATUS_COLOR_MAP[s.cor] || STATUS_COLOR_MAP.slate;
              return (
                <div key={s.id} className="w-72 flex-shrink-0">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${colColor}`}>
                    <span className="font-semibold text-sm">{s.nome}</span>
                    <span className="text-xs font-bold opacity-70">{colPropostas.length}</span>
                  </div>
                  <div className="bg-slate-100 rounded-b-lg p-2 space-y-2 min-h-[200px] max-h-[600px] overflow-y-auto">
                    {colPropostas.map(p => (
                      <div key={p.id} className="bg-white rounded-lg p-3 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => navigate(createPageUrl(`VendaEmprestimoDetalhes?id=${p.id}`))}>
                        <p className="font-semibold text-xs text-slate-900 leading-tight">{p.cliente_nome}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{getClienteCpf(p.cliente_id)}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {/* Banco */}
                          {p.administradora_nome && (() => {
                            const banco = getBanco(p.administradora_id);
                            return (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
                                {banco?.logo_url && <img src={banco.logo_url} alt="" className="w-3 h-3 object-contain" />}
                                {p.administradora_nome}
                              </span>
                            );
                          })()}
                          {/* Convênio */}
                          {p.emprestimo_convenio_nome && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-100 text-cyan-700">{p.emprestimo_convenio_nome}</span>
                          )}
                          {/* Tipo */}
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIPO_COLORS[p.emprestimo_tipo] || 'bg-slate-100 text-slate-600'}`}>
                            {getTipoLabel(p)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs font-bold text-slate-800">{formatCurrency(p.valor_credito)}</span>
                        </div>
                        {p.vendedor_nome && <p className="text-xs text-slate-400 mt-1">{p.vendedor_nome}</p>}
                      </div>
                    ))}
                    {colPropostas.length === 0 && (
                      <div className="text-center py-6 text-slate-400 text-xs">Nenhuma proposta</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'cards' && isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 animate-pulse h-44" />
          ))}
        </div>
      ) : viewMode === 'cards' && filteredPropostas.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-100">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma proposta encontrada</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPropostas.map(p => {
            const cpf = getClienteCpf(p.cliente_id) || p.cliente_cpf || '';
            const statusConfig = getStatusConfig(p);
            const statusColorClass = statusConfig ? (STATUS_COLOR_MAP[statusConfig.cor] || STATUS_COLOR_MAP.slate) : 'bg-slate-100 text-slate-600';
            const tipoColor = TIPO_COLORS[p.emprestimo_tipo] || 'bg-slate-100 text-slate-600';
            const tipoLabel = getTipoLabel(p);

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
                onDoubleClick={() => navigate(createPageUrl(`PropostaEmprestimoDetalhes?id=${p.id}`))}
              >
                {/* Card Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                        {p.cliente_nome?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                      <p className="font-bold text-slate-900 text-sm leading-tight">{p.cliente_nome || '-'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {cpf && <span className="font-medium text-slate-500">CPF: {cpf}</span>}
                        {p.contrato && <span>{cpf ? ' | ' : ''}Contrato: {p.contrato}</span>}
                      </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setPropostaToEdit(p); setEditModalOpen(true); }}>
                          <Pencil className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        {isAdmin && (
                          <DropdownMenuItem onClick={() => { setPropostaToDelete(p); setDeleteDialogOpen(true); }} className="text-red-600 focus:text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Tags row: Banco > Convênio > Tipo */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Banco com logo */}
                      {p.administradora_nome && (() => {
                        const banco = getBanco(p.administradora_id);
                        return (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {banco?.logo_url ? (
                              <img src={banco.logo_url} alt={p.administradora_nome} className="w-4 h-4 object-contain rounded-sm flex-shrink-0" />
                            ) : (
                              <Building2 className="w-3 h-3 text-slate-400" />
                            )}
                            {p.administradora_nome}
                          </span>
                        );
                      })()}
                      {/* Convênio */}
                      {p.emprestimo_convenio_nome && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-700">
                          {p.emprestimo_convenio_nome}
                        </span>
                      )}
                      {/* Tipo */}
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tipoColor}`}>
                        {tipoLabel}
                      </span>
                    </div>
                    <p className="font-bold text-slate-900 text-base">{formatCurrency(p.valor_credito)}</p>
                  </div>

                  {/* Info row */}
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      <span>{p.vendedor_nome || '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.data_venda && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{format(new Date(p.data_venda + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                        </div>
                      )}
                      {statusConfig && (
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColorClass}`}>
                          {statusConfig.nome}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer / Actions */}
                <div className="px-4 py-3 border-t border-slate-100 space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-1 border-[#10353C] text-[#10353C] hover:bg-[#10353C] hover:text-white font-semibold"
                    onClick={() => navigate(createPageUrl(`PropostaEmprestimoDetalhes?id=${p.id}`))}
                  >
                    <FileText className="w-3.5 h-3.5" /> Ver Detalhes
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => { setPropostaComentarios(p); setComentariosOpen(true); }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Comentários
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs gap-1 border-slate-200 text-slate-600 hover:bg-slate-50"
                      onClick={() => { setPropostaStatus(p); setStatusModalOpen(true); }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Status
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs gap-1 bg-green-500 hover:bg-green-600 text-white"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {/* Modals */}
      <ImportarPropostasLoteModal open={importarLoteOpen} onOpenChange={setImportarLoteOpen} />
      <ComentariosModal open={comentariosOpen} onOpenChange={setComentariosOpen} proposta={propostaComentarios} />
      <StatusQuickModal open={statusModalOpen} onOpenChange={setStatusModalOpen} proposta={propostaStatus} empresaId={currentUser?.empresa_id} />
      <KanbanConfigModal open={kanbanConfigOpen} onOpenChange={setKanbanConfigOpen} empresaId={currentUser?.empresa_id} />
      <PortabilidadeHojeModal open={portabilidadeHojeOpen} onOpenChange={setPortabilidadeHojeOpen} propostas={propostasCip} />

      <PropostaEditModal
        proposta={propostaToEdit}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta proposta?
              {propostaToDelete && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="font-medium text-slate-900">{propostaToDelete.cliente_nome}</p>
                  <p className="text-sm text-slate-600">{getTipoLabel(propostaToDelete)}</p>
                </div>
              )}
              <p className="mt-3 text-sm text-red-600">Esta ação não pode ser desfeita.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => propostaToDelete && deleteMutation.mutate(propostaToDelete.id)} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
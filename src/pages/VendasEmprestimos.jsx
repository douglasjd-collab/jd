import React, { useState, useEffect, useMemo } from 'react';
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
  AlignJustify, Kanban, ArrowRightLeft, DollarSign, Copy, RefreshCw,
  History, UserCheck, FileSignature
  } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import moment from 'moment';
import PropostaEditModal from '@/components/forms/PropostaEditModal';
import ImportarPropostasLoteModal from '@/components/emprestimos/ImportarPropostasLoteModal';
import KanbanConfigModal from '@/components/emprestimos/KanbanConfigModal';
import HistoricoModal from '@/components/emprestimos/HistoricoModal';
import ResponsavelModal from '@/components/emprestimos/ResponsavelModal';
import StatusQuickModal from '@/components/emprestimos/StatusQuickModal';
import PortabilidadeHojeModal from '@/components/emprestimos/PortabilidadeHojeModal';
import ChatPopupModal from '@/components/chat/ChatPopupModal';
import TermoAutorizacaoModal from '@/components/emprestimos/TermoAutorizacaoModal';

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
  const [searchGeral, setSearchGeral] = useState('');
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [filterResponsavel, setFilterResponsavel] = useState('todos');
  const [currentUser, setCurrentUser] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [propostaToDelete, setPropostaToDelete] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [propostaToEdit, setPropostaToEdit] = useState(null);
  const [importarLoteOpen, setImportarLoteOpen] = useState(false);
  const [kanbanConfigOpen, setKanbanConfigOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [propostaHistorico, setPropostaHistorico] = useState(null);
  const [responsavelOpen, setResponsavelOpen] = useState(false);
  const [propostaResponsavel, setPropostaResponsavel] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [propostaStatus, setPropostaStatus] = useState(null);
  const [portabilidadeHojeOpen, setPortabilidadeHojeOpen] = useState(false);
  const [chatPopupOpen, setChatPopupOpen] = useState(false);
  const [chatContato, setChatContato] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'kanban'
  const [sincronizandoApi, setSincronizandoApi] = useState(false);
  const [termoModalOpen, setTermoModalOpen] = useState(false);
  const [propostaTermo, setPropostaTermo] = useState(null);
  const [empresaTermo, setEmpresaTermo] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        // Super admin: tenta pegar a primeira empresa da base
        const empresas = await base44.entities.Empresa.filter({}, '-created_date', 1);
        const empresaId = empresas && empresas[0] ? empresas[0].id : null;
        setCurrentUser({ ...me, auth_id: me.id, empresa_id: empresaId, perfil: 'super_admin' });
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
    staleTime: 0,
    refetchOnWindowFocus: true,
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

  const { data: tabelasEmprestimo = [] } = useQuery({
    queryKey: ['tabelas-emprestimo-parceira', currentUser?.empresa_id],
    queryFn: () => base44.entities.TabelaEmprestimo.filter(
      currentUser?.empresa_id ? { empresa_id: currentUser.empresa_id } : {},
      undefined,
      500
    ),
    enabled: !!currentUser,
  });

  const getEmpresaParceiraNome = (tabelaComissaoId) => {
    if (!tabelaComissaoId) return null;
    const tabela = tabelasEmprestimo.find(t => t.id === tabelaComissaoId);
    return tabela?.empresa_parceira_nome || null;
  };

  const getCliente = (clienteId) => clientes.find(c => c.id === clienteId);
  const getClienteCpf = (clienteId) => {
    const c = getCliente(clienteId);
    return c?.cpf || c?.pj_cnpj || '';
  };

  const getStatusConfig = (proposta) => {
    let status = proposta.status_id
      ? statusList.find(s => s.id === proposta.status_id)
      : statusList.find(s => s.codigo === proposta.status || normStr(s.nome) === normStr(proposta.status));
    // Se for substatus, retorna o status pai
    if (status?.status_pai_id) {
      return statusList.find(s => s.id === status.status_pai_id) || status;
    }
    return status;
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

  const gerarSegundaViaComissao = async (p) => {
    if (!propostas || propostas.length === 0) return;
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

    // Buscar todas as propostas do mesmo vendedor pagas na mesma data
    const getValPago = (x) => x.valor_comissao_vendedor_pago || 0;
    const getPercVendedor = (x) => {
      if (x.percentual_comissao_vendedor) return x.percentual_comissao_vendedor;
      // Derivar % do valor efetivamente pago
      if (x.valor_comissao_vendedor_pago && x.valor_credito) return (x.valor_comissao_vendedor_pago / x.valor_credito) * 100;
      if (x.valor_comissao && x.valor_credito) return (x.valor_comissao / x.valor_credito) * 100;
      return 0;
    };

    let todasPropostas = propostas.filter(x =>
      x.comissao_vendedor_paga &&
      x.vendedor_id === p.vendedor_id &&
      x.comissao_vendedor_data_pagamento === p.comissao_vendedor_data_pagamento
    );
    if (todasPropostas.length === 0) todasPropostas = [p];

    const totalPago = todasPropostas.reduce((acc, x) => acc + getValPago(x), 0);

    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFillColor(16, 53, 60);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO — EMPRÉSTIMOS', 148, 10, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`2ª Via  |  Gerado em: ${moment().format('DD/MM/YYYY HH:mm')}`, 148, 17, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(10, 26, 277, 22, 2, 2, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Vendedor:', 14, 33); doc.text('Data Pagamento:', 90, 33);
    doc.text('Forma Pagamento:', 160, 33); doc.text('Qtd. Itens:', 230, 33);
    doc.setFont('helvetica', 'normal');
    doc.text(p.vendedor_nome || '-', 14, 39);
    doc.text(p.comissao_vendedor_data_pagamento ? moment(p.comissao_vendedor_data_pagamento).format('DD/MM/YYYY') : '-', 90, 39);
    doc.text(p.comissao_vendedor_forma_pagamento || '-', 160, 39);
    doc.text(String(todasPropostas.length), 230, 39);

    doc.autoTable({
      startY: 54,
      head: [['Cliente', 'Contrato', 'Banco', 'Data Lib.', 'Vl. Crédito', '% Vendedor', 'Vl. Pago']],
      body: todasPropostas.map(x => {
        const perc = getPercVendedor(x);
        const valPago = getValPago(x);
        return [
          x.cliente_nome || '-',
          x.contrato || '-',
          x.administradora_nome || '-',
          x.emprestimo_data_liberacao ? moment(x.emprestimo_data_liberacao).format('DD/MM/YYYY') : '-',
          fmt(x.valor_credito),
          `${perc.toFixed(2)}%`,
          fmt(valPago),
        ];
      }),
      foot: [['', '', '', '', '', 'Total:', fmt(totalPago)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [230, 240, 255], fontStyle: 'bold', textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', textColor: [0, 80, 180] } },
    });

    const ph = doc.internal.pageSize.height;
    doc.setFontSize(7); doc.setTextColor(0, 0, 255);
    doc.text(`2ª Via gerada em ${moment().format('DD/MM/YYYY HH:mm')}`, 148, ph - 5, { align: 'center' });
    doc.save(`2via_comissao_${(p.vendedor_nome || 'vendedor').replace(/\s+/g, '_')}_${moment(p.comissao_vendedor_data_pagamento || undefined).format('YYYYMMDD')}.pdf`);
  };

  const copiarInfoContrato = (p) => {
    const cpf = getClienteCpf(p.cliente_id) || p.cliente_cpf || '';
    const tipoLabel = getTipoLabel(p);
    const valorLiberado = formatCurrency(p.valor_liquido || p.valor_credito);
    const dataLib = p.emprestimo_data_liberacao
      ? format(new Date(p.emprestimo_data_liberacao + 'T12:00:00'), 'dd/MM/yyyy')
      : '-';
    const banco = p.administradora_nome || '-';

    const texto = [
      `Nome: ${p.cliente_nome || '-'}`,
      `CPF: ${cpf || '-'}`,
      `Banco: ${banco}`,
      `Contrato: ${p.contrato || '-'}`,
      `Tipo: ${tipoLabel}`,
      `Corretor/Vendedor: ${p.vendedor_nome || '-'}`,
      `Valor Liberado: ${valorLiberado}`,
      `Data de Liberação: ${dataLib}`,
    ].join('\n');

    navigator.clipboard.writeText(texto).then(() => {
      toast.success('Informações copiadas!');
    });
  };

  const handleAbrirTermoModal = async (p) => {
    try {
      const empresas = await base44.entities.Empresa.filter({ id: p.empresa_id || currentUser?.empresa_id });
      setEmpresaTermo(empresas?.[0] || null);
    } catch {
      setEmpresaTermo(null);
    }
    setPropostaTermo(p);
    setTermoModalOpen(true);
  };

  const isAdmin = ['master', 'super_admin', 'admin'].includes(currentUser?.perfil);
  const podeExcluir = ['master', 'super_admin', 'admin', 'colaborador', 'funcionario'].includes(currentUser?.perfil);

  const handleSincronizarApi = async () => {
    if (sincronizandoApi) return;
    setSincronizandoApi(true);
    try {
      // Busca todas as configurações da empresa (filtra ativas em JS)
      const filtro = currentUser.empresa_id ? { empresa_id: currentUser.empresa_id } : {};
      const todasConfigs = await base44.entities.ConfiguracaoApiBanco.filter(filtro);
      const configs = (todasConfigs || []).filter(c => c.integracao_ativa === true || c.integracao_ativa === 'true');
      if (!configs || configs.length === 0) {
        if (todasConfigs && todasConfigs.length > 0) {
          toast.error(`Você tem ${todasConfigs.length} integração(ões) cadastrada(s) mas nenhuma está ativa. Ative em Configuração API.`);
        } else {
          toast.error('Nenhuma integração de API cadastrada. Configure em Configuração API.');
        }
        return;
      }
      const empresaId = currentUser?.empresa_id;
      if (!empresaId) {
        toast.error('Empresa não identificada. Verifique seu cadastro.');
        return;
      }
      let totalImportadas = 0;
      let totalAtualizadas = 0;
      let totalClientesCriados = 0;
      for (const cfg of configs) {
        const res = await base44.functions.invoke('importarPropostasBanco', {
          configuracao_id: cfg.id,
          empresa_id: String(empresaId),
        });
        if (res.data?.success) {
          totalImportadas += res.data.importadas || 0;
          totalAtualizadas += res.data.atualizadas || 0;
          totalClientesCriados += res.data.clientes_criados || 0;
        } else if (res.data?.error) {
          toast.error(res.data.error);
        }
      }
      toast.success(`Sincronização concluída: ${totalImportadas} novas, ${totalAtualizadas} atualizadas${totalClientesCriados > 0 ? `, ${totalClientesCriados} clientes` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
    } catch (e) {
      toast.error('Erro na sincronização: ' + e.message);
    } finally {
      setSincronizandoApi(false);
    }
  };

  const podeVerTodos = isAdmin || ['gerente', 'colaborador', 'funcionario', 'colaborador_vendedor'].includes(currentUser?.perfil);
  const podeVerEmpresaParceira = ['master', 'super_admin', 'admin', 'gerente', 'colaborador'].includes(currentUser?.perfil);

  const filteredByRole = (propostas || []).filter(p => {
    if (podeVerTodos) return true;
    return p.vendedor_id === currentUser?.colaborador_id;
  });

  const normStr = s => String(s || '').toLowerCase().trim();

  const isPagoFilter = filterStatus !== 'todos' && statusList.find(s => s.id === filterStatus && (s.nome?.toLowerCase().includes('pago') || s.funcao_fluxo === 'finalizado'));

  const stripCpf = (s) => String(s || '').replace(/[.\-\/\s]/g, '');

  const filteredPropostas = filteredByRole.filter(p => {
    const cpf = getClienteCpf(p.cliente_id) || p.cliente_cpf || '';
    const q = searchGeral.toLowerCase();
    const qStripped = stripCpf(q);
    const cpfStripped = stripCpf(cpf);
    const matchGeral = !searchGeral || 
      p.cliente_nome?.toLowerCase().includes(q) ||
      cpf.includes(q) ||
      (qStripped.length >= 3 && cpfStripped.includes(qStripped)) ||
      (p.contrato || '').toLowerCase().includes(q) ||
      (p.emprestimo_numero_ade || '').toLowerCase().includes(q) ||
      (p.administradora_nome || '').toLowerCase().includes(q);
    const matchVendedor = filterVendedor === 'todos' || p.vendedor_nome === filterVendedor;
    const matchBanco = filterBanco === 'todos' || p.administradora_nome === filterBanco;
    const matchTipo = filterTipo === 'todos' || p.emprestimo_tipo === filterTipo;
    const filterStatusObj = statusList.find(s => s.id === filterStatus);
    const filterFilhosIds = filterStatus !== 'todos' ? statusList.filter(x => x.status_pai_id === filterStatus).map(x => x.id) : [];
    const filterTodosIds = filterStatus !== 'todos' ? [filterStatus, ...filterFilhosIds] : [];
    const matchStatus = filterStatus === 'todos' || 
      filterTodosIds.includes(p.status_id) || 
      (!p.status_id && filterStatusObj && (normStr(p.status) === normStr(filterStatusObj.nome) || normStr(p.status) === normStr(filterStatusObj.codigo)));
    let matchResponsavel = true;
    if (filterResponsavel !== 'todos') {
      let responsaveis = [];
      try { responsaveis = p.responsaveis_json ? JSON.parse(p.responsaveis_json) : []; } catch {}
      if (responsaveis.length === 0 && p.responsavel_id) responsaveis = [{ id: p.responsavel_id }];
      matchResponsavel = responsaveis.some(r => r.id === filterResponsavel);
    }
    return matchGeral && matchBanco && matchTipo && matchStatus && matchVendedor && matchResponsavel;
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

  // Vendedores únicos para o filtro
  const vendedoresUnicos = useMemo(() => {
    if (!filteredByRole || filteredByRole.length === 0) return [];
    const nomes = [...new Set(filteredByRole.map(p => p.vendedor_nome).filter(Boolean))].sort();
    return nomes;
  }, [filteredByRole]);

  // Responsáveis únicos para o filtro
  const responsaveisUnicos = useMemo(() => {
    if (!filteredByRole || filteredByRole.length === 0) return [];
    const map = {};
    filteredByRole.forEach(p => {
      let responsaveis = [];
      try { responsaveis = p.responsaveis_json ? JSON.parse(p.responsaveis_json) : []; } catch {}
      if (responsaveis.length === 0 && p.responsavel_id) {
        responsaveis = [{ id: p.responsavel_id, nome: p.responsavel_nome, foto: p.responsavel_foto }];
      }
      responsaveis.forEach(r => { if (r.id && r.nome) map[r.id] = r; });
    });
    return Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredByRole]);

  // Counts per tipo for filter pills
  const countByTipo = (tipo) => {
    if (!filteredByRole || filteredByRole.length === 0) return 0;
    return tipo === 'todos'
      ? filteredByRole.length
      : filteredByRole.filter(p => p.emprestimo_tipo === tipo).length;
  };

  if (!currentUser || isLoading) {
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
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">Empréstimos</h1>
          <p className="text-slate-500 mt-1 text-base">{filteredPropostas.length} propostas encontradas</p>
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
          {isAdmin && (
            <Button
              variant="outline"
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={handleSincronizarApi}
              disabled={sincronizandoApi}
            >
              {sincronizandoApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {sincronizandoApi ? 'Sincronizando...' : 'Sincronizar API'}
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setImportarLoteOpen(true)}>
            <Upload className="w-4 h-4" />
            Importar em Lote
          </Button>
          <Button
            className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
            onClick={() => navigate(createPageUrl('NovaVendaConsignado'))}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Hoje</p>
              <p className="font-bold text-slate-900 text-lg">{formatCurrency(valorHoje)}</p>
              <p className="text-xs text-slate-400 mt-1">{todayPropostas.length} propostas</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Em andamento</p>
              <p className="font-bold text-slate-900 text-lg">{formatCurrency(valor_em_andamento)}</p>
              <p className="text-xs text-slate-400 mt-1">{emAndamento.length} propostas</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Pagas</p>
              <p className="font-bold text-slate-900 text-lg">{formatCurrency(valor_pagas_mes)}</p>
              <p className="text-xs text-slate-400 mt-1">{propostas_pagas_mes.length} propostas</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Valor total do dia</p>
              <p className="font-bold text-slate-900 text-lg">{formatCurrency(valorHoje)}</p>
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
        {[...statusList]
          .filter(s => s.tipo === 'principal' || !s.tipo)
          .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
          .filter((s, idx, arr) => arr.findIndex(x => normStr(x.nome) === normStr(s.nome)) === idx)
          .map(s => {
          const colorClass = STATUS_COLOR_MAP[s.cor] || STATUS_COLOR_MAP.slate;
          const isActive = filterStatus === s.id;
          // Incluir substatuses filhos na contagem
          const filhosIds = statusList.filter(x => x.status_pai_id === s.id).map(x => x.id);
          const todosIds = [s.id, ...filhosIds];
          const count = filteredByRole.filter(p => 
            todosIds.includes(p.status_id) || 
            normStr(p.status) === normStr(s.nome) || 
            normStr(p.status) === normStr(s.codigo)
          ).length;
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
            <Input placeholder="Buscar por nome, CPF, Contrato, ADE..." value={searchGeral} onChange={(e) => setSearchGeral(e.target.value)} className="pl-9 border-0 bg-slate-50" />
          </div>
          <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
            <SelectTrigger className="w-full sm:w-52 border-0 bg-slate-50">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Responsáveis</SelectItem>
              {responsaveisUnicos.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  <div className="flex items-center gap-2">
                    {r.foto ? (
                      <img src={r.foto} alt={r.nome} className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-purple-400 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                        {r.nome?.charAt(0)?.toUpperCase()}
                      </span>
                    )}
                    {r.nome}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterBanco} onValueChange={setFilterBanco}>
            <SelectTrigger className="w-full sm:w-52 border-0 bg-slate-50">
              <SelectValue placeholder="Selecionar banco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Bancos</SelectItem>
              {bancos.map(b => (
                <SelectItem key={b.id} value={b.nome}>{b.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {podeVerTodos && (
            <Select value={filterVendedor} onValueChange={setFilterVendedor}>
              <SelectTrigger className="w-full sm:w-48 border-0 bg-slate-50">
                <SelectValue placeholder="Todos os Vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Vendedores</SelectItem>
                {vendedoresUnicos.map(nome => (
                  <SelectItem key={nome} value={nome}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
                              <span className="flex items-center gap-1 px-2.5 py-1 rounded text-sm bg-slate-100 text-slate-600 border border-slate-200">
                                {banco?.logo_url && <img src={banco.logo_url} alt="" className="w-4 h-4 object-contain" />}
                                {p.administradora_nome}
                              </span>
                            );
                          })()}
                          {/* Convênio */}
                          {p.emprestimo_convenio_nome && (
                            <span className="px-2.5 py-1 rounded text-sm bg-cyan-100 text-cyan-700">{p.emprestimo_convenio_nome}</span>
                          )}
                          {/* Tipo */}
                          <span className={`px-2.5 py-1 rounded text-sm font-medium ${TIPO_COLORS[p.emprestimo_tipo] || 'bg-slate-100 text-slate-600'}`}>
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
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {p.cliente_nome?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-900 text-base leading-tight">{p.cliente_nome || '-'}</p>
                        {(() => {
                          const cliente = getCliente(p.cliente_id);
                          const tel = cliente?.celular || p.cliente_cpf ? null : null;
                          const celular = cliente?.celular;
                          if (!celular) return null;
                          const numero = celular.replace(/\D/g, '');
                          const whatsappUrl = `https://wa.me/55${numero}`;
                          return (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`WhatsApp: ${celular}`}
                              className="text-green-500 hover:text-green-600 transition-colors flex-shrink-0"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          );
                        })()}
                      </div>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {cpf && <span className="font-medium text-slate-500">CPF: {cpf}</span>}
                        {p.contrato && <span>{cpf ? ' | ' : ''}Contrato: {p.contrato}</span>}
                      </p>

                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {p.comissao_vendedor_paga && (
                        <button
                          title="Comissão paga — Gerar 2ª via do comprovante"
                          onClick={(e) => { e.stopPropagation(); gerarSegundaViaComissao(p); }}
                          className="h-8 w-8 flex items-center justify-center rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copiarInfoContrato(p)}>
                          <Copy className="w-4 h-4 mr-2" /> Copiar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setPropostaToEdit(p); setEditModalOpen(true); }}>
                          <Pencil className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAbrirTermoModal(p)}>
                          <FileSignature className="w-4 h-4 mr-2" />
                          Gerar Termo de Autorização
                        </DropdownMenuItem>
                        {podeExcluir && (
                          <DropdownMenuItem onClick={() => { setPropostaToDelete(p); setDeleteDialogOpen(true); }} className="text-red-600 focus:text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </div>

                  {/* Tags row: Banco > Convênio > Tipo */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Banco com logo */}
                      {p.administradora_nome && (() => {
                        const banco = getBanco(p.administradora_id);
                        return (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {banco?.logo_url ? (
                              <img src={banco.logo_url} alt={p.administradora_nome} className="w-4 h-4 object-contain rounded-sm flex-shrink-0" />
                            ) : (
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            {p.administradora_nome}
                          </span>
                        );
                      })()}
                      {/* Convênio */}
                      {p.emprestimo_convenio_nome && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium bg-cyan-100 text-cyan-700">
                          {p.emprestimo_convenio_nome}
                        </span>
                      )}
                      {/* Tipo */}
                      <span className={`px-2.5 py-1 rounded text-sm font-semibold ${tipoColor}`}>
                        {tipoLabel}
                      </span>
                      {/* Empresa Parceira — visível apenas para admin/gerente/colaborador */}
                      {podeVerEmpresaParceira && p.empresa_parceira_nome && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                          <Building2 className="w-3.5 h-3.5" />
                          {p.empresa_parceira_nome}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      {p.valor_liquido && (
                        <p className="text-xs text-slate-400">Bruto: {formatCurrency(p.valor_credito)}</p>
                      )}
                      <p className="font-bold text-slate-900 text-lg leading-tight">{formatCurrency(p.valor_liquido || p.valor_credito)}</p>
                      {p.emprestimo_valor_parcela && (
                        <p className="text-xs text-slate-500">Parcela: {formatCurrency(p.emprestimo_valor_parcela)}</p>
                      )}
                    </div>
                  </div>

                  {/* Info row */}
                  <div className="flex items-center justify-between mt-2 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span>{p.vendedor_nome || '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.data_venda && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{format(new Date(p.data_venda + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                        </div>
                      )}
                      {statusConfig && (
                        <span className={`px-2.5 py-1 rounded text-sm font-semibold ${statusColorClass}`}>
                          {statusConfig.nome}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer / Actions */}
                <div className="px-4 py-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => { setPropostaHistorico(p); setHistoricoOpen(true); }}
                    >
                      <History className="w-3.5 h-3.5" /> Histórico
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs gap-1 border-slate-200 text-slate-600 hover:bg-slate-50"
                      onClick={() => { setPropostaStatus(p); setStatusModalOpen(true); }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Status
                    </Button>
                    {(() => {
                      const cliente = getCliente(p.cliente_id);
                      const celular = cliente?.celular || p.cliente_cpf ? cliente?.celular : null;
                      if (!celular) return null;
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                          onClick={() => {
                            setChatContato({ nome: p.cliente_nome, telefone: celular.replace(/\D/g, '') });
                            setChatPopupOpen(true);
                          }}
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Ver conversa
                        </Button>
                      );
                    })()}
                    {(() => {
                      let responsaveis = [];
                      try { responsaveis = p.responsaveis_json ? JSON.parse(p.responsaveis_json) : []; } catch {}
                      if (responsaveis.length === 0 && p.responsavel_id) {
                        responsaveis = [{ id: p.responsavel_id, nome: p.responsavel_nome, foto: p.responsavel_foto }];
                      }
                      const nomes = responsaveis.map(r => r.nome).join(', ');
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs gap-1 border-purple-200 text-purple-700 hover:bg-purple-50"
                          onClick={() => { setPropostaResponsavel(p); setResponsavelOpen(true); }}
                          title={nomes || 'Definir Responsável'}
                        >
                          {responsaveis.length > 0 ? (
                            <div className="flex items-center -space-x-1.5 flex-shrink-0">
                              {responsaveis.slice(0, 3).map((r, i) => (
                                r.foto ? (
                                  <img key={r.id} src={r.foto} alt={r.nome} className="w-4 h-4 rounded-full object-cover border border-white" style={{ zIndex: 3 - i }} />
                                ) : (
                                  <span key={r.id} className="w-4 h-4 rounded-full bg-purple-500 text-white text-[8px] font-bold flex items-center justify-center border border-white" style={{ zIndex: 3 - i }}>
                                    {r.nome?.charAt(0)?.toUpperCase()}
                                  </span>
                                )
                              ))}
                            </div>
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                          {responsaveis.length > 0 ? (
                            responsaveis.length === 1
                              ? responsaveis[0].nome.split(' ')[0]
                              : `${responsaveis.length} resp.`
                          ) : 'Responsável'}
                        </Button>
                      );
                    })()}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {/* Modals */}
      <ImportarPropostasLoteModal open={importarLoteOpen} onOpenChange={setImportarLoteOpen} />
      <HistoricoModal open={historicoOpen} onOpenChange={setHistoricoOpen} proposta={propostaHistorico} empresaId={currentUser?.empresa_id} />
      <ResponsavelModal open={responsavelOpen} onOpenChange={setResponsavelOpen} proposta={propostaResponsavel} empresaId={currentUser?.empresa_id} currentUser={currentUser} />
      <StatusQuickModal open={statusModalOpen} onOpenChange={setStatusModalOpen} proposta={propostaStatus} empresaId={currentUser?.empresa_id} />
      <KanbanConfigModal open={kanbanConfigOpen} onOpenChange={setKanbanConfigOpen} empresaId={currentUser?.empresa_id} />
      <PortabilidadeHojeModal open={portabilidadeHojeOpen} onOpenChange={setPortabilidadeHojeOpen} propostas={propostasCip} />
      <ChatPopupModal
        open={chatPopupOpen}
        onOpenChange={setChatPopupOpen}
        contato={chatContato}
        empresaId={currentUser?.empresa_id}
        user={currentUser}
      />

      <TermoAutorizacaoModal
        open={termoModalOpen}
        onOpenChange={setTermoModalOpen}
        proposta={propostaTermo}
        cliente={propostaTermo ? getCliente(propostaTermo.cliente_id) : null}
        empresa={empresaTermo}
        currentUser={currentUser}
        onEditCliente={(clienteId) => navigate(createPageUrl(`ClienteDetalhes?id=${clienteId}`))}
        onEditProposta={(p) => { setPropostaToEdit(p); setEditModalOpen(true); }}
        onEditEmpresa={() => navigate(createPageUrl('Empresas'))}
        onGerado={() => queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] })}
      />

      <PropostaEditModal
        proposta={propostaToEdit}
        open={editModalOpen}
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
        }}
        currentUser={currentUser}
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
import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, RefreshCw, FileSignature, UserCheck, ExternalLink,
  Loader2, Calendar, Clock, ArrowUpDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import TermoAutorizacaoModal from '@/components/emprestimos/TermoAutorizacaoModal';
import AcompanhamentoAssinaturasModal from '@/components/emprestimos/AcompanhamentoAssinaturasModal';
import {
  SITUACOES, SITUACAO_ORDER, ROLE_LABELS,
  classificarProposta, getTermoRecenteAtivo, getSolicitacaoAtual,
  getDataEnvio, getTempoPendente, computePeriodoRange,
  stripCpf,
} from '@/components/emprestimos/gerenciadorAssinaturasHelpers';

const TIPO_LABELS = {
  NOVO: 'Novo', REFINANCIAMENTO: 'Refinanciamento',
  PORTABILIDADE_PURA: 'Portabilidade', REFIN_PORTABILIDADE: 'Refin + Port',
};

const PERIODO_ATALHOS = [
  { key: 'today', label: 'Hoje' },
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
  { key: '60', label: '60 dias' },
  { key: '90', label: '90 dias' },
  { key: 'all', label: 'Todo período' },
];

const PER_PAGE = 20;

export default function GerenciadorAssinaturas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [filterSituacao, setFilterSituacao] = useState('pendencias');
  const [filterBanco, setFilterBanco] = useState('todos');
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [filterResponsavel, setFilterResponsavel] = useState('todos');
  const [periodo, setPeriodo] = useState('all');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [sortOrder, setSortOrder] = useState('recente');
  const [page, setPage] = useState(1);

  const [termoModalOpen, setTermoModalOpen] = useState(false);
  const [propostaTermo, setPropostaTermo] = useState(null);
  const [empresaTermo, setEmpresaTermo] = useState(null);
  const [assinaturasModalOpen, setAssinaturasModalOpen] = useState(false);
  const [propostaAssinaturas, setPropostaAssinaturas] = useState(null);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        const empresas = await base44.entities.Empresa.filter({}, '-created_date', 1);
        const empresaId = empresas?.[0]?.id || null;
        setCurrentUser({ ...me, auth_id: me.id, empresa_id: empresaId, perfil: 'super_admin', colaborador_id: null });
        return;
      }
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date');
      if (!colabs || colabs.length === 0) {
        setCurrentUser({ ...me, auth_id: me.id, empresa_id: null, perfil: 'vendedor', colaborador_id: null });
        return;
      }
      const colab = colabs[0];
      setCurrentUser({ ...me, auth_id: me.id, empresa_id: colab.empresa_id || null, perfil: colab.perfil || 'vendedor', colaborador_id: colab.id });
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  const isSuperAdmin = currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'master';
  const isAdmin = ['master', 'super_admin', 'admin'].includes(currentUser?.perfil);
  const podeVerTodos = isAdmin || ['gerente', 'colaborador', 'funcionario', 'colaborador_vendedor'].includes(currentUser?.perfil);

  const buildFilter = (extra = {}) => {
    const f = { ...extra };
    if (!isSuperAdmin && currentUser?.empresa_id) f.empresa_id = currentUser.empresa_id;
    return f;
  };

  const { data: propostas = [], isLoading: isLoadingPropostas } = useQuery({
    queryKey: ['ger-assinaturas-propostas', currentUser?.empresa_id, currentUser?.perfil],
    enabled: !!currentUser,
    staleTime: 0,
    queryFn: () => base44.entities.Proposta.filter(buildFilter({ produto: 'emprestimo' }), '-data_venda', 5000),
  });

  const { data: termos = [] } = useQuery({
    queryKey: ['ger-assinaturas-termos', currentUser?.empresa_id],
    enabled: !!currentUser,
    staleTime: 0,
    queryFn: () => base44.entities.TermoAutorizacao.filter(buildFilter(), '-versao', 5000),
  });

  const { data: solicitacoes = [] } = useQuery({
    queryKey: ['ger-assinaturas-solicitacoes', currentUser?.empresa_id],
    enabled: !!currentUser,
    staleTime: 0,
    queryFn: () => base44.entities.SolicitacaoAssinatura.filter(buildFilter(), '-data_criacao', 5000),
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['ger-assinaturas-bancos'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['ger-assinaturas-clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  // Group terms and solicitacoes by proposta_id (sorted)
  const termosByProposta = useMemo(() => {
    const map = {};
    (termos || []).forEach((t) => {
      if (!map[t.proposta_id]) map[t.proposta_id] = [];
      map[t.proposta_id].push(t);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (b.versao || 0) - (a.versao || 0)));
    return map;
  }, [termos]);

  const solicitacoesByProposta = useMemo(() => {
    const map = {};
    (solicitacoes || []).forEach((s) => {
      if (!map[s.proposta_id]) map[s.proposta_id] = [];
      map[s.proposta_id].push(s);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => new Date(b.data_criacao || 0) - new Date(a.data_criacao || 0)));
    return map;
  }, [solicitacoes]);

  // Classify each proposal
  const propostasClassificadas = useMemo(() => {
    return (propostas || []).map((p) => {
      const termosP = termosByProposta[p.id] || [];
      const solsP = solicitacoesByProposta[p.id] || [];
      const termoRecente = getTermoRecenteAtivo(termosP);
      const solicitacaoAtual = getSolicitacaoAtual(solsP);
      const { situacao, faltantes, etapaAtual } = classificarProposta(termoRecente, solicitacaoAtual);
      return {
        ...p,
        _situacao: situacao,
        _faltantes: faltantes,
        _etapaAtual: etapaAtual,
        _termoRecente: termoRecente,
        _solicitacaoAtual: solicitacaoAtual,
        _dataEnvio: getDataEnvio(termoRecente, solicitacaoAtual),
        _tempoPendente: getTempoPendente(termoRecente, solicitacaoAtual, situacao),
      };
    });
  }, [propostas, termosByProposta, solicitacoesByProposta]);

  // Filter by role (like VendasEmprestimos)
  const filteredByRole = useMemo(() => {
    return propostasClassificadas.filter((p) => {
      if (podeVerTodos) return true;
      return p.vendedor_id === currentUser?.colaborador_id;
    });
  }, [propostasClassificadas, podeVerTodos, currentUser]);

  // Counters by situacao
  const contadores = useMemo(() => {
    const counts = {};
    SITUACAO_ORDER.forEach((k) => { counts[k] = 0; });
    filteredByRole.forEach((p) => {
      if (counts[p._situacao] !== undefined) counts[p._situacao]++;
    });
    counts._pendencias = SITUACAO_ORDER.filter((k) => k !== 'concluido').reduce((a, k) => a + counts[k], 0);
    counts._total = filteredByRole.length;
    return counts;
  }, [filteredByRole]);

  // Unique values for filters
  const vendedoresUnicos = useMemo(() => {
    const nomes = [...new Set(filteredByRole.map((p) => p.vendedor_nome).filter(Boolean))];
    return nomes.sort();
  }, [filteredByRole]);

  const responsaveisUnicos = useMemo(() => {
    const map = {};
    filteredByRole.forEach((p) => {
      let arr = [];
      try { arr = p.responsaveis_json ? JSON.parse(p.responsaveis_json) : []; } catch {}
      if (arr.length === 0 && p.responsavel_id) arr = [{ id: p.responsavel_id, nome: p.responsavel_nome }];
      arr.forEach((r) => { if (r.id && r.nome) map[r.id] = r; });
    });
    return Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredByRole]);

  const bancosUnicos = useMemo(() => {
    const nomes = [...new Set(filteredByRole.map((p) => p.administradora_nome).filter(Boolean))];
    return nomes.sort();
  }, [filteredByRole]);

  // Apply all filters
  const filtered = useMemo(() => {
    const range = computePeriodoRange(periodo);
    const inicio = dataInicio || range?.inicio || null;
    const fim = dataFim || range?.fim || null;

    return filteredByRole.filter((p) => {
      // Situacao filter
      if (filterSituacao === 'pendencias') {
        if (p._situacao === 'concluido') return false;
      } else if (filterSituacao !== 'all' && p._situacao !== filterSituacao) {
        return false;
      }

      // Period filter (inclusive)
      if (inicio && fim) {
        if (!p.data_venda || p.data_venda < inicio || p.data_venda > fim) return false;
      } else if (inicio && (!p.data_venda || p.data_venda < inicio)) return false;
      else if (fim && (!p.data_venda || p.data_venda > fim)) return false;

      // Search
      if (search) {
        const q = search.toLowerCase();
        const qStripped = stripCpf(q);
        const cpf = (p.cliente_cpf || (() => {
          const c = clientes.find((c) => c.id === p.cliente_id);
          return c?.cpf || c?.pj_cnpj || '';
        })()) || '';
        const cpfStripped = stripCpf(cpf);
        const matchSearch =
          p.cliente_nome?.toLowerCase().includes(q) ||
          (qStripped.length >= 3 && cpfStripped.includes(qStripped)) ||
          cpf.includes(q) ||
          (p.contrato || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      // Banco
      if (filterBanco !== 'todos' && p.administradora_nome !== filterBanco) return false;

      // Vendedor
      if (filterVendedor !== 'todos' && p.vendedor_nome !== filterVendedor) return false;

      // Responsavel
      if (filterResponsavel !== 'todos') {
        let arr = [];
        try { arr = p.responsaveis_json ? JSON.parse(p.responsaveis_json) : []; } catch {}
        if (arr.length === 0 && p.responsavel_id) arr = [{ id: p.responsavel_id }];
        if (!arr.some((r) => r.id === filterResponsavel)) return false;
      }

      return true;
    });
  }, [filteredByRole, filterSituacao, filterBanco, filterVendedor, filterResponsavel, search, periodo, dataInicio, dataFim, clientes]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const da = a.data_venda || '';
      const db = b.data_venda || '';
      return sortOrder === 'recente' ? db.localeCompare(da) : da.localeCompare(db);
    });
    return arr;
  }, [filtered, sortOrder]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, filterSituacao, filterBanco, filterVendedor, filterResponsavel, periodo, dataInicio, dataFim, sortOrder]);

  const getCliente = (id) => clientes.find((c) => c.id === id);
  const getClienteCpf = (p) => p.cliente_cpf || (() => { const c = getCliente(p.cliente_id); return c?.cpf || c?.pj_cnpj || ''; })();

  const handleAtalhoPeriodo = (key) => {
    setPeriodo(key);
    if (key === 'all') { setDataInicio(''); setDataFim(''); }
    else if (key === 'custom') { /* keep current */ }
    else {
      const r = computePeriodoRange(key);
      setDataInicio(r.inicio); setDataFim(r.fim);
    }
  };

  const handleDataChange = (v, tipo) => {
    if (tipo === 'inicio') setDataInicio(v); else setDataFim(v);
    setPeriodo('custom');
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['ger-assinaturas-propostas'] });
    queryClient.invalidateQueries({ queryKey: ['ger-assinaturas-termos'] });
    queryClient.invalidateQueries({ queryKey: ['ger-assinaturas-solicitacoes'] });
  };

  const handleAbrirTermoModal = async (p) => {
    try {
      const empresas = await base44.entities.Empresa.filter({ id: p.empresa_id || currentUser?.empresa_id });
      setEmpresaTermo(empresas?.[0] || null);
    } catch { setEmpresaTermo(null); }
    setPropostaTermo(p);
    setTermoModalOpen(true);
  };

  const handleAbrirAssinaturas = (p) => {
    setPropostaAssinaturas(p);
    setAssinaturasModalOpen(true);
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#23BE84]" />
      </div>
    );
  }

  const isLoading = isLoadingPropostas;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Gerenciador de Assinaturas</h1>
          <p className="text-slate-500 mt-1 text-sm">Empréstimos com Termo de Autorização pendente</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={invalidateAll}>
            <RefreshCw className="w-4 h-4" /> Atualizar
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setSortOrder((s) => (s === 'recente' ? 'antigo' : 'recente'))}
            title="Alternar ordem"
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortOrder === 'recente' ? 'Mais recentes' : 'Mais antigas'}
          </Button>
        </div>
      </div>

      {/* Contadores por situação */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          onClick={() => setFilterSituacao('pendencias')}
          className={`text-left bg-white rounded-xl p-3 shadow-sm border-2 transition-all ${filterSituacao === 'pendencias' ? 'border-[#23BE84] ring-1 ring-[#23BE84]' : 'border-slate-100 hover:border-slate-200'}`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-slate-500">Pendências</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">{contadores._pendencias}</p>
        </button>
        {SITUACAO_ORDER.map((key) => {
          const sit = SITUACOES[key];
          const isActive = filterSituacao === key;
          return (
            <button
              key={key}
              onClick={() => setFilterSituacao(isActive ? 'pendencias' : key)}
              className={`text-left bg-white rounded-xl p-3 shadow-sm border-2 transition-all ${isActive ? 'border-[#23BE84] ring-1 ring-[#23BE84]' : 'border-slate-100 hover:border-slate-200'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${sit.dot}`} />
                <span className="text-xs font-medium text-slate-500 truncate">{sit.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{contadores[key]}</p>
            </button>
          );
        })}
      </div>

      {/* Filtros de período */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODO_ATALHOS.map((at) => (
            <button
              key={at.key}
              onClick={() => handleAtalhoPeriodo(at.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${periodo === at.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {at.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <Input type="date" value={dataInicio} onChange={(e) => handleDataChange(e.target.value, 'inicio')} className="w-40 text-sm" />
            <span className="text-slate-400 text-sm">até</span>
            <Input type="date" value={dataFim} onChange={(e) => handleDataChange(e.target.value, 'fim')} className="w-40 text-sm" />
          </div>
        </div>
      </div>

      {/* Busca e filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar por nome, CPF ou contrato..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 border-0 bg-slate-50" />
          </div>
          <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
            <SelectTrigger className="w-full sm:w-48 border-0 bg-slate-50"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Responsáveis</SelectItem>
              {responsaveisUnicos.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBanco} onValueChange={setFilterBanco}>
            <SelectTrigger className="w-full sm:w-44 border-0 bg-slate-50"><SelectValue placeholder="Banco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Bancos</SelectItem>
              {bancosUnicos.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          {podeVerTodos && (
            <Select value={filterVendedor} onValueChange={setFilterVendedor}>
              <SelectTrigger className="w-full sm:w-44 border-0 bg-slate-50"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Vendedores</SelectItem>
                {vendedoresUnicos.map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Lista / Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileSignature className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">Nenhuma proposta encontrada</p>
            <p className="text-sm mt-1">Ajuste os filtros ou o período de busca.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Cliente / CPF</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Contrato</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Banco</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Tipo</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Vendedor</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Data Prop.</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Data Envio</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Faltantes</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Tempo</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600">Situação</th>
                    <th className="px-3 py-3 text-right font-semibold text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginated.map((p) => {
                    const sit = SITUACOES[p._situacao];
                    const cpf = getClienteCpf(p);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900">{p.cliente_nome || '-'}</div>
                          <div className="text-xs text-slate-400 font-mono">{cpf || '-'}</div>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-700 text-xs">{p.contrato || '-'}</td>
                        <td className="px-3 py-3 text-slate-600">{p.administradora_nome || '-'}</td>
                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                            {TIPO_LABELS[p.emprestimo_tipo] || p.emprestimo_tipo || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{p.vendedor_nome || '-'}</td>
                        <td className="px-3 py-3 text-slate-600 text-xs">
                          {p.data_venda ? format(new Date(p.data_venda + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                        </td>
                        <td className="px-3 py-3 text-slate-600 text-xs">
                          {p._dataEnvio ? format(new Date(p._dataEnvio), 'dd/MM/yyyy HH:mm') : '-'}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          {p._faltantes.length > 0 ? (
                            <div className="space-y-0.5">
                              {p._faltantes.map((r) => (
                                <div key={r} className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  {ROLE_LABELS[r] || r}
                                </div>
                              ))}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {p._tempoPendente ? (
                            <span className={`font-medium ${p._tempoPendente.includes('d') && parseInt(p._tempoPendente) >= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                              {p._tempoPendente}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${sit.badge}`}>{sit.label}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleAbrirTermoModal(p)}
                              title="Gerar / enviar termo"
                              className="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <FileSignature className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleAbrirAssinaturas(p)}
                              title="Acompanhar assinaturas"
                              className="h-8 w-8 flex items-center justify-center rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => navigate(createPageUrl(`PropostaEmprestimoDetalhes?id=${p.id}`))}
                              title="Abrir proposta"
                              className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-slate-100">
              {paginated.map((p) => {
                const sit = SITUACOES[p._situacao];
                const cpf = getClienteCpf(p);
                return (
                  <div key={p.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{p.cliente_nome || '-'}</p>
                        <p className="text-xs text-slate-400 font-mono">{cpf || '-'}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold flex-shrink-0 ${sit.badge}`}>{sit.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
                      <div><span className="text-slate-400">Contrato:</span> {p.contrato || '-'}</div>
                      <div><span className="text-slate-400">Banco:</span> {p.administradora_nome || '-'}</div>
                      <div><span className="text-slate-400">Tipo:</span> {TIPO_LABELS[p.emprestimo_tipo] || p.emprestimo_tipo || '-'}</div>
                      <div><span className="text-slate-400">Vendedor:</span> {p.vendedor_nome || '-'}</div>
                      <div><span className="text-slate-400">Proposta:</span> {p.data_venda ? format(new Date(p.data_venda + 'T12:00:00'), 'dd/MM/yyyy') : '-'}</div>
                      <div><span className="text-slate-400">Envio:</span> {p._dataEnvio ? format(new Date(p._dataEnvio), 'dd/MM/yyyy HH:mm') : '-'}</div>
                    </div>
                    {p._faltantes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p._faltantes.map((r) => (
                          <span key={r} className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs">
                            <Clock className="w-3 h-3" /> {ROLE_LABELS[r] || r}
                          </span>
                        ))}
                        {p._tempoPendente && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${p._tempoPendente.includes('d') && parseInt(p._tempoPendente) >= 3 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                            {p._tempoPendente}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleAbrirTermoModal(p)}>
                        <FileSignature className="w-3.5 h-3.5" /> Termo
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleAbrirAssinaturas(p)}>
                        <UserCheck className="w-3.5 h-3.5" /> Assinaturas
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate(createPageUrl(`PropostaEmprestimoDetalhes?id=${p.id}`))}>
                        <ExternalLink className="w-3.5 h-3.5" /> Abrir
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Paginação */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500 gap-2">
              <span>
                Mostrando {(currentPage - 1) * PER_PAGE + 1} a {Math.min(currentPage * PER_PAGE, sorted.length)} de {sorted.length} propostas
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  ← Anterior
                </Button>
                <span className="px-2 text-sm">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Próxima →
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <TermoAutorizacaoModal
        open={termoModalOpen}
        onOpenChange={(open) => {
          setTermoModalOpen(open);
          if (!open) invalidateAll();
        }}
        proposta={propostaTermo}
        cliente={propostaTermo ? getCliente(propostaTermo.cliente_id) : null}
        empresa={empresaTermo}
        currentUser={currentUser}
        onEditCliente={(clienteId) => navigate(createPageUrl(`ClienteDetalhes?id=${clienteId}`))}
        onEditProposta={(p) => navigate(createPageUrl(`PropostaEmprestimoDetalhes?id=${p.id}`))}
        onEditEmpresa={() => navigate(createPageUrl('Empresas'))}
        onGerado={invalidateAll}
      />
      <AcompanhamentoAssinaturasModal
        open={assinaturasModalOpen}
        onOpenChange={(open) => {
          setAssinaturasModalOpen(open);
          if (!open) invalidateAll();
        }}
        proposta={propostaAssinaturas}
      />
    </div>
  );
}
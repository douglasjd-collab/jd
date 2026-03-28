import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, UserCheck, Loader2, Users, ArrowLeft, Zap, Bug } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STATUS_COLOR_MAP = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
};

const TIPO_LABELS = {
  NOVO: 'Novo',
  REFINANCIAMENTO: 'Refinanciamento',
  PORTABILIDADE_PURA: 'Portabilidade',
  REFIN_PORTABILIDADE: 'Refin + Port',
};

export default function PropostasSemVendedor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [vendedorParaAtribuir, setVendedorParaAtribuir] = useState('');
  const [searchNome, setSearchNome] = useState('');
  const [filterBanco, setFilterBanco] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      setCurrentUser({ ...me, perfil: 'super_admin', empresa_id: null });
      return;
    }
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date');
    if (colabs?.length > 0) {
      setCurrentUser({ ...me, perfil: colabs[0].perfil, empresa_id: colabs[0].empresa_id, colaborador_id: colabs[0].id });
    }
  };

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ['propostas-sem-vendedor'],
    queryFn: () => base44.entities.Proposta.filter({ produto: 'emprestimo' }),
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores-emprestimos'],
    queryFn: () => base44.entities.Colaborador.filter({ perfil: ['vendedor', 'gerente', 'admin'], status: 'ativo' }),
  });

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-propostas'],
    queryFn: () => base44.entities.StatusProposta.filter({ ativo: true }),
  });

  const atribuirMutation = useMutation({
    mutationFn: async ({ ids, vendedorId }) => {
      const vendedor = vendedores.find(v => v.id === vendedorId);
      await Promise.all(ids.map(id =>
        base44.entities.Proposta.update(id, {
          vendedor_id: vendedorId,
          vendedor_nome: vendedor?.nome || '',
        })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propostas-sem-vendedor'] });
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      toast.success(`Vendedor atribuído a ${selectedIds.length} proposta(s)!`);
      setSelectedIds([]);
      setVendedorParaAtribuir('');
    },
    onError: () => toast.error('Erro ao atribuir vendedor'),
  });

  const sincronizarMutation = useMutation({
    mutationFn: async () => {
      const resp = await base44.functions.invoke('sincronizarVendedorAutomaticamente', {
        empresa_id: currentUser.empresa_id,
      });
      return resp.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['propostas-sem-vendedor'] });
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      toast.success(`✅ ${data.vinculadas || 0} proposta(s) sincronizada(s)!`);
    },
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const handleDebug = async () => {
    try {
      const resp = await base44.functions.invoke('debugSincronizacaoVendedor', {
        empresa_id: currentUser.empresa_id,
      });
      console.log('🐛 DEBUG:', resp.data);
      toast.info('Debug enviado - veja console para detalhes');
    } catch (err) {
      toast.error('Erro no debug: ' + err.message);
    }
  };

  const semVendedor = propostas.filter(p => !p.vendedor_id || p.vendedor_id === '');

  const filtered = semVendedor.filter(p => {
    const matchNome = !searchNome || p.cliente_nome?.toLowerCase().includes(searchNome.toLowerCase()) || p.contrato?.includes(searchNome);
    const matchBanco = filterBanco === 'todos' || p.administradora_nome === filterBanco || p.administradora_id === filterBanco;
    const matchTipo = filterTipo === 'todos' || p.emprestimo_tipo === filterTipo;
    const matchStatus = filterStatus === 'todos' || p.status_id === filterStatus;
    return matchNome && matchBanco && matchTipo && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedIds.length === paginated.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginated.map(p => p.id));
    }
  };

  const getStatusConfig = (p) => statusList.find(s => s.id === p.status_id);
  const getBancoLogo = (id) => bancos.find(b => b.id === id);

  const bancosUnicos = [...new Set(semVendedor.map(p => p.administradora_nome).filter(Boolean))];

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(currentUser?.perfil);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#23BE84]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(createPageUrl('VendasEmprestimos'))} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Propostas sem Vendedor</h1>
          <p className="text-slate-500 text-sm mt-0.5">Empréstimos → Propostas → Sem Vendedor</p>
        </div>
        <Badge className="ml-auto bg-red-100 text-red-700 text-sm px-3 py-1">
          {semVendedor.length} sem vendedor
        </Badge>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente ou contrato..."
              value={searchNome}
              onChange={e => { setSearchNome(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={filterBanco} onValueChange={v => { setFilterBanco(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Banco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Bancos</SelectItem>
              {bancosUnicos.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={v => { setFilterTipo(v); setPage(1); }}>
            <SelectTrigger className="w-44">
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
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              {statusList.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Atribuição em lote + Sincronização */}
      {isAdmin && (
        <div className="space-y-3">
          {/* Sincronização Automática */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl shadow-sm border border-blue-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-200 rounded-lg">
                <Zap className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="font-semibold text-blue-900">Sincronizar Vendedor Automaticamente</p>
                <p className="text-xs text-blue-700 mt-0.5">Vincula propostas sem vendedor baseado no CPF de propostas já vinculadas</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleDebug}
              >
                <Bug className="w-4 h-4" />
                Debug
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 gap-2 whitespace-nowrap"
                disabled={semVendedor.length === 0 || sincronizarMutation.isPending}
                onClick={() => sincronizarMutation.mutate()}
              >
                {sincronizarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {sincronizarMutation.isPending ? 'Sincronizando...' : 'Sincronizar Agora'}
              </Button>
            </div>
          </div>

          {/* Atribuição Manual */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Users className="w-5 h-5 text-slate-400" />
              <Select value={vendedorParaAtribuir} onValueChange={setVendedorParaAtribuir}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Selecionar Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
                disabled={!vendedorParaAtribuir || selectedIds.length === 0 || atribuirMutation.isPending}
                onClick={() => atribuirMutation.mutate({ ids: selectedIds, vendedorId: vendedorParaAtribuir })}
              >
                {atribuirMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                Atribuir vendedor aos selecionados ({selectedIds.length})
              </Button>
              {selectedIds.length > 0 && (
                <button onClick={() => setSelectedIds([])} className="text-sm text-slate-500 hover:text-slate-700">
                  Limpar seleção
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <UserCheck className="w-12 h-12 mx-auto mb-3 text-green-300" />
            <p className="font-medium text-green-600">Todas as propostas têm vendedor!</p>
            <p className="text-sm mt-1">Nenhuma proposta sem vendedor encontrada.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {isAdmin && (
                      <th className="px-4 py-3 text-left">
                        <Checkbox
                          checked={selectedIds.length === paginated.length && paginated.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Data da Proposta</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Nº Contrato</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Cliente</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">CPF</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Banco</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Valor Liberado</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Vendedor</th>
                    {isAdmin && <th className="px-4 py-3 text-left font-semibold text-slate-600">Ação Rápida</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginated.map(p => {
                    const statusCfg = getStatusConfig(p);
                    const colorClass = statusCfg ? (STATUS_COLOR_MAP[statusCfg.cor] || STATUS_COLOR_MAP.slate) : 'bg-slate-100 text-slate-600';
                    const banco = getBancoLogo(p.administradora_id);
                    const isSelected = selectedIds.includes(p.id);

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(p.id)} />
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-600">
                          {p.data_venda ? format(new Date(p.data_venda + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">{p.contrato || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{p.cliente_nome || '-'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {p.cliente_cpf || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {banco?.logo_url && <img src={banco.logo_url} alt="" className="w-5 h-5 object-contain rounded" />}
                            <span className="text-slate-700">{p.administradora_nome || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                            {TIPO_LABELS[p.emprestimo_tipo] || p.emprestimo_tipo || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor_credito || 0)}
                        </td>
                        <td className="px-4 py-3">
                          {statusCfg ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>{statusCfg.nome}</span>
                          ) : (
                            <span className="text-slate-400 text-xs">{p.status || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">Sem Vendedor</span>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <AtribuirVendedorInline
                              proposta={p}
                              vendedores={vendedores}
                              onSalvar={(vendedorId) => {
                                atribuirMutation.mutate({ ids: [p.id], vendedorId });
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
              <span>
                Mostrando {(page - 1) * PER_PAGE + 1} a {Math.min(page * PER_PAGE, filtered.length)} de {filtered.length} entradas
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  ← Anterior
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                  <Button
                    key={pg}
                    variant={pg === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(pg)}
                    className={pg === page ? 'bg-[#23BE84] hover:bg-[#1da570] border-0' : ''}
                  >
                    {pg}
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Próxima →
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AtribuirVendedorInline({ proposta, vendedores, onSalvar }) {
  const [vendedorId, setVendedorId] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async () => {
    if (!vendedorId) return;
    setSalvando(true);
    await onSalvar(vendedorId);
    setSalvando(false);
  };

  return (
    <div className="flex items-center gap-1">
      <Select value={vendedorId} onValueChange={setVendedorId}>
        <SelectTrigger className="h-7 text-xs w-36">
          <SelectValue placeholder="Selecionar..." />
        </SelectTrigger>
        <SelectContent>
          {vendedores.map(v => (
            <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-7 text-xs bg-[#23BE84] hover:bg-[#1da570] px-2"
        disabled={!vendedorId || salvando}
        onClick={handleSalvar}
      >
        {salvando ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
      </Button>
    </div>
  );
}
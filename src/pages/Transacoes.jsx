import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TrendingDown, TrendingUp, Search, Trash2, Edit2, CheckCircle, MoreVertical, AlertCircle, Clock, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import ModalNovaDespesa from '@/components/financeiro/ModalNovaDespesa';
import ModalNovaReceita from '@/components/financeiro/ModalNovaReceita';

export default function Transacoes() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterType, setFilterType] = useState('todos'); // despesas | receitas | todos
  const [editingDespesa, setEditingDespesa] = useState(null);
  const [editingReceita, setEditingReceita] = useState(null);
  const [pagandoConta, setPagandoConta] = useState(null); // { despesa, dataPagamento }
  const [recebendoReceita, setRecebendoReceita] = useState(null); // { receita, dataRecebimento }

  const queryClient = useQueryClient();

  React.useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, nome: colab.nome });
      }
    }
  };

  const { data: despesas = [], isLoading: loadingDespesas } = useQuery({
    queryKey: ['despesas-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.Despesa.filter(user?.empresa_id ? { empresa_id: user.empresa_id } : {}),
    enabled: !!user,
  });

  const { data: receitas = [], isLoading: loadingReceitas } = useQuery({
    queryKey: ['receitas-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.Receita.filter(user?.empresa_id ? { empresa_id: user.empresa_id } : {}),
    enabled: !!user,
  });

  const { data: categoriasDespesa = [] } = useQuery({
    queryKey: ['categorias-despesa-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.CategoriaDespesa.filter({ empresa_id: user.empresa_id, status: 'ativa' }),
    enabled: !!user?.empresa_id,
  });

  const { data: categoriasReceita = [] } = useQuery({
    queryKey: ['categorias-receita-transacoes'],
    queryFn: () => base44.entities.CategoriaReceita.filter({ ativo: true }, 'ordem'),
    enabled: !!user,
  });

  const updateDespesaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Despesa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas-transacoes']);
      toast.success('Despesa atualizada!');
      setEditingDespesa(null);
      setPagandoConta(null);
    },
  });

  const updateReceitaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Receita.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas-transacoes']);
      toast.success('Receita atualizada!');
      setEditingReceita(null);
      setRecebendoReceita(null);
    },
  });

  const deleteDespesaMutation = useMutation({
    mutationFn: (id) => base44.entities.Despesa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas-transacoes']);
      toast.success('Despesa excluída!');
    },
  });

  const deleteReceitaMutation = useMutation({
    mutationFn: (id) => base44.entities.Receita.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas-transacoes']);
      toast.success('Receita excluída!');
    },
  });

  const hoje = moment().format('YYYY-MM-DD');
  const em7dias = moment().add(7, 'days').format('YYYY-MM-DD');

  const getStatusDespesa = (d) => {
    if (d.status === 'pago' || d.status === 'paga') return 'pago';
    const venc = d.data_vencimento || d.data;
    if (!venc) return 'pendente';
    if (venc < hoje) return 'atrasada';
    if (venc === hoje) return 'vencendo_hoje';
    return 'pendente';
  };

  const statusLabel = {
    pago: { label: 'Pago', color: 'bg-green-100 text-green-700' },
    paga: { label: 'Pago', color: 'bg-green-100 text-green-700' },
    atrasada: { label: 'Atrasada', color: 'bg-red-100 text-red-700' },
    vencendo_hoje: { label: 'Vence Hoje', color: 'bg-orange-100 text-orange-700' },
    pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
    recebida: { label: 'Recebida', color: 'bg-green-100 text-green-700' },
  };

  // Montar lista unificada
  const allTransacoes = [
    ...despesas.map(d => ({ ...d, _tipo: 'despesa', _status: getStatusDespesa(d) })),
    ...receitas.map(r => ({ ...r, _tipo: 'receita', _status: r.status === 'recebida' ? 'recebida' : 'pendente' })),
  ].sort((a, b) => {
    const da = a.data_vencimento || a.data || '';
    const db = b.data_vencimento || b.data || '';
    return db.localeCompare(da);
  });

  const filtered = allTransacoes.filter(t => {
    if (filterType !== 'todos' && t._tipo !== filterType) return false;
    if (filterStatus === 'pagas' && !['pago', 'paga', 'recebida'].includes(t._status)) return false;
    if (filterStatus === 'atrasadas' && t._status !== 'atrasada') return false;
    if (filterStatus === 'pendentes' && !['pendente', 'vencendo_hoje'].includes(t._status)) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (t.descricao?.toLowerCase().includes(term) || t.categoria?.toLowerCase().includes(term) || t.categoria_nome?.toLowerCase().includes(term));
    }
    return true;
  });

  const totalDespesas = despesas.reduce((a, d) => a + (d.valor || 0), 0);
  const totalReceitas = receitas.reduce((a, r) => a + (r.valor || 0), 0);
  // Filtrar despesas com status !== 'pago' e data_vencimento ou data anterior a hoje
  const despesasAtrasadas = despesas.filter(d => {
    if (['pago', 'paga'].includes(d.status)) return false;
    const venc = d.data_vencimento || d.data;
    if (!venc) return false;
    return venc < hoje;
  });
  const atrasadas = despesasAtrasadas.length;
  const totalAtrasadas = despesasAtrasadas.reduce((a, d) => a + (d.valor || 0), 0);
  const despesasPendentes = despesas.filter(d => ['pendente', 'vencendo_hoje'].includes(getStatusDespesa(d)));
  const pendentes = despesasPendentes.length;
  const totalPendentes = despesasPendentes.reduce((a, d) => a + (d.valor || 0), 0);

  const [novaDespesaOpen, setNovaDespesaOpen] = useState(false);
  const [novaReceitaOpen, setNovaReceitaOpen] = useState(false);

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!user || !isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito a administradores e gerentes</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transações</h1>
          <p className="text-slate-500 text-sm">Todas as despesas e receitas lançadas</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => setNovaDespesaOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
            <TrendingDown className="w-4 h-4 mr-1" /> Nova Despesa
          </Button>
          <Button onClick={() => setNovaReceitaOpen(true)} className="bg-green-600 hover:bg-green-700 text-white">
            <TrendingUp className="w-4 h-4 mr-1" /> Nova Receita
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 mb-1">Total Despesas</p>
          <p className="text-xl font-bold text-red-600">{totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <TrendingDown className="w-5 h-5 text-red-400 mt-1" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 mb-1">Total Receitas</p>
          <p className="text-xl font-bold text-green-600">{totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <TrendingUp className="w-5 h-5 text-green-400 mt-1" />
        </Card>
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-xs text-red-500 mb-2">Contas Atrasadas</p>
          <p className="text-2xl font-bold text-red-700 mb-2">{atrasadas > 0 ? totalAtrasadas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-red-600 font-medium">{atrasadas}</p>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
        </Card>
        <Card className="p-4 border-yellow-200 bg-yellow-50">
          <p className="text-xs text-yellow-600 mb-2">Contas Pendentes</p>
          <p className="text-2xl font-bold text-yellow-700 mb-2">{pendentes > 0 ? totalPendentes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-yellow-600 font-medium">{pendentes}</p>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="despesa">Só Despesas</SelectItem>
              <SelectItem value="receita">Só Receitas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="atrasadas">Atrasadas</SelectItem>
              <SelectItem value="pendentes">Pendentes / A Vencer</SelectItem>
              <SelectItem value="pagas">Pagas / Recebidas</SelectItem>
            </SelectContent>
          </Select>
          {(filterStatus !== 'todos' || filterType !== 'todos' || searchTerm) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterStatus('todos'); setFilterType('todos'); setSearchTerm(''); }}>
              <X className="w-4 h-4 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-slate-700 text-sm">Tipo</th>
                <th className="text-left p-4 font-semibold text-slate-700 text-sm">Data</th>
                <th className="text-left p-4 font-semibold text-slate-700 text-sm">Descrição</th>
                <th className="text-left p-4 font-semibold text-slate-700 text-sm">Categoria</th>
                <th className="text-left p-4 font-semibold text-slate-700 text-sm">Valor</th>
                <th className="text-left p-4 font-semibold text-slate-700 text-sm">Status</th>
                <th className="text-left p-4 font-semibold text-slate-700 text-sm">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(loadingDespesas || loadingReceitas) ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhuma transação encontrada</td></tr>
              ) : filtered.map((t, i) => {
                const isDespesa = t._tipo === 'despesa';
                const venc = t.data_vencimento || t.data;
                const st = statusLabel[t._status] || statusLabel['pendente'];
                return (
                  <tr key={t.id + t._tipo} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      {isDespesa ? (
                        <span className="flex items-center gap-1 text-red-600 text-xs font-semibold">
                          <TrendingDown className="w-4 h-4" /> Despesa
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                          <TrendingUp className="w-4 h-4" /> Receita
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-700">
                      {venc ? moment(venc).format('DD/MM/YYYY') : '-'}
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-slate-900 text-sm">{t.descricao || '-'}</p>
                      {t.responsavel_nome && <p className="text-xs text-slate-400">{t.responsavel_nome}</p>}
                    </td>
                    <td className="p-4 text-sm text-slate-600">{t.categoria || t.categoria_nome || '-'}</td>
                    <td className="p-4">
                      <span className={`font-bold text-sm ${isDespesa ? 'text-red-600' : 'text-green-600'}`}>
                        {isDespesa ? '- ' : '+ '}
                        {(t.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {/* Botão Pagar / Receber */}
                        {isDespesa && !['pago', 'paga'].includes(t._status) && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2"
                            onClick={() => setPagandoConta({ despesa: t, dataPagamento: moment().format('YYYY-MM-DD') })}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Pagar
                          </Button>
                        )}
                        {!isDespesa && t._status !== 'recebida' && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2"
                            onClick={() => setRecebendoReceita({ receita: t, dataRecebimento: moment().format('YYYY-MM-DD') })}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Receber
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => isDespesa ? setEditingDespesa(t) : setEditingReceita(t)}>
                              <Edit2 className="w-4 h-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            {['master', 'super_admin', 'admin'].includes(user?.perfil) && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  if (confirm('Excluir esta transação?')) {
                                    isDespesa ? deleteDespesaMutation.mutate(t.id) : deleteReceitaMutation.mutate(t.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t text-sm text-slate-500">
          {filtered.length} transação(ões) exibida(s)
        </div>
      </Card>

      {/* Modal Pagar Despesa */}
      <Dialog open={!!pagandoConta} onOpenChange={() => setPagandoConta(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          {pagandoConta && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-semibold">{pagandoConta.despesa.descricao}</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {(pagandoConta.despesa.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <Label>Data de Pagamento</Label>
                <Input
                  type="date"
                  value={pagandoConta.dataPagamento}
                  onChange={e => setPagandoConta(prev => ({ ...prev, dataPagamento: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagandoConta(null)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => updateDespesaMutation.mutate({
                id: pagandoConta.despesa.id,
                data: { status: 'pago', data_pagamento: pagandoConta.dataPagamento }
              })}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Receber Receita */}
      <Dialog open={!!recebendoReceita} onOpenChange={() => setRecebendoReceita(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Recebimento</DialogTitle>
          </DialogHeader>
          {recebendoReceita && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-semibold">{recebendoReceita.receita.descricao}</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {(recebendoReceita.receita.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <Label>Data de Recebimento</Label>
                <Input
                  type="date"
                  value={recebendoReceita.dataRecebimento}
                  onChange={e => setRecebendoReceita(prev => ({ ...prev, dataRecebimento: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecebendoReceita(null)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => updateReceitaMutation.mutate({
                id: recebendoReceita.receita.id,
                data: { status: 'recebida', data_recebimento: recebendoReceita.dataRecebimento }
              })}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Confirmar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Despesa */}
      <Dialog open={!!editingDespesa} onOpenChange={() => setEditingDespesa(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Despesa</DialogTitle>
          </DialogHeader>
          {editingDespesa && (
            <EditDespesaForm
              despesa={editingDespesa}
              categorias={categoriasDespesa}
              onSave={(data) => updateDespesaMutation.mutate({ id: editingDespesa.id, data })}
              onCancel={() => setEditingDespesa(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Editar Receita */}
      <Dialog open={!!editingReceita} onOpenChange={() => setEditingReceita(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Receita</DialogTitle>
          </DialogHeader>
          {editingReceita && (
            <EditReceitaForm
              receita={editingReceita}
              categorias={categoriasReceita}
              onSave={(data) => updateReceitaMutation.mutate({ id: editingReceita.id, data })}
              onCancel={() => setEditingReceita(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Nova Despesa */}
      <ModalNovaDespesa
        open={novaDespesaOpen}
        onOpenChange={setNovaDespesaOpen}
        user={user}
        onSuccess={() => queryClient.invalidateQueries(['despesas-transacoes'])}
      />

      {/* Modal Nova Receita */}
      <ModalNovaReceita
        open={novaReceitaOpen}
        onOpenChange={setNovaReceitaOpen}
        user={user}
        onSuccess={() => queryClient.invalidateQueries(['receitas-transacoes'])}
      />
    </div>
  );
}

function EditDespesaForm({ despesa, categorias, onSave, onCancel }) {
  const [form, setForm] = useState({
    descricao: despesa.descricao || '',
    categoria: despesa.categoria || '',
    valor: (despesa.valor || 0).toFixed(2).replace('.', ','),
    data: despesa.data || '',
    data_vencimento: despesa.data_vencimento || '',
    observacao: despesa.observacao || '',
    status: despesa.status || 'pendente',
    data_pagamento: despesa.data_pagamento || '',
  });

  const handleSave = () => {
    const valorNum = parseFloat(form.valor.replace(/\./g, '').replace(',', '.'));
    onSave({
      descricao: form.descricao,
      categoria: form.categoria,
      valor: isNaN(valorNum) ? despesa.valor : valorNum,
      data: form.data,
      data_vencimento: form.data_vencimento || undefined,
      observacao: form.observacao,
      status: form.status,
      data_pagamento: form.status === 'pago' ? (form.data_pagamento || moment().format('YYYY-MM-DD')) : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Descrição</Label>
        <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Valor (R$)</Label>
          <Input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Data</Label>
          <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Vencimento</Label>
          <Input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} className="mt-1" />
        </div>
      </div>
      {form.status === 'pago' && (
        <div>
          <Label>Data de Pagamento</Label>
          <Input type="date" value={form.data_pagamento} onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))} className="mt-1" />
        </div>
      )}
      <div>
        <Label>Observação</Label>
        <Textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} className="mt-1" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">Salvar</Button>
      </DialogFooter>
    </div>
  );
}

function EditReceitaForm({ receita, categorias, onSave, onCancel }) {
  const [form, setForm] = useState({
    descricao: receita.descricao || '',
    valor: (receita.valor || 0).toFixed(2).replace('.', ','),
    data: receita.data || '',
    status: receita.status || 'pendente',
    data_recebimento: receita.data_recebimento || '',
    observacao: receita.observacao || '',
    origem: receita.origem || '',
  });

  const handleSave = () => {
    const valorNum = parseFloat(form.valor.replace(/\./g, '').replace(',', '.'));
    onSave({
      descricao: form.descricao,
      valor: isNaN(valorNum) ? receita.valor : valorNum,
      data: form.data,
      status: form.status,
      data_recebimento: form.status === 'recebida' ? (form.data_recebimento || moment().format('YYYY-MM-DD')) : undefined,
      observacao: form.observacao,
      origem: form.origem,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Descrição</Label>
        <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Valor (R$)</Label>
          <Input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="recebida">Recebida</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Data</Label>
          <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="mt-1" />
        </div>
        {form.status === 'recebida' && (
          <div>
            <Label>Data de Recebimento</Label>
            <Input type="date" value={form.data_recebimento} onChange={e => setForm(f => ({ ...f, data_recebimento: e.target.value }))} className="mt-1" />
          </div>
        )}
      </div>
      <div>
        <Label>Origem</Label>
        <Input value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))} className="mt-1" />
      </div>
      <div>
        <Label>Observação</Label>
        <Textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} className="mt-1" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">Salvar</Button>
      </DialogFooter>
    </div>
  );
}
import React, { useState, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, TrendingUp, TrendingDown, CheckCircle, MoreVertical, Trash2, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const BRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

const STATUS_COLORS = {
  pago: 'bg-green-100 text-green-700', paga: 'bg-green-100 text-green-700',
  recebida: 'bg-green-100 text-green-700', pendente: 'bg-yellow-100 text-yellow-700',
  atrasada: 'bg-red-100 text-red-700', cancelada: 'bg-slate-100 text-slate-500',
  'aguardando pagamento': 'bg-blue-100 text-blue-700', prevista: 'bg-purple-100 text-purple-700',
};

export default function AbaTransacoes({ despesas, receitas, categoriasDespesa, contasBancarias, user, refetchAll, queryClient: qc }) {
  const queryClient = useQueryClient();
  const hoje = moment().format('YYYY-MM-DD');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterProduto, setFilterProduto] = useState('todos');
  const [pagandoConta, setPagandoConta] = useState(null);
  const [recebendoReceita, setRecebendoReceita] = useState(null);
  const [editingDespesa, setEditingDespesa] = useState(null);
  const [editingReceita, setEditingReceita] = useState(null);

  const getStatusDespesa = (d) => {
    if (['pago','paga'].includes(d.status)) return 'pago';
    if (d.status === 'cancelado') return 'cancelada';
    const v = d.data_vencimento || d.data;
    if (v && v < hoje) return 'atrasada';
    return 'pendente';
  };

  const allTransacoes = useMemo(() => [
    ...despesas.map(d => ({ ...d, _tipo: 'despesa', _status: getStatusDespesa(d) })),
    ...receitas.map(r => ({ ...r, _tipo: 'receita', _status: r.status || 'pendente' })),
  ].sort((a, b) => {
    const da = a.data_vencimento || a.data || '';
    const db = b.data_vencimento || b.data || '';
    return db.localeCompare(da);
  }), [despesas, receitas, hoje]);

  const filtered = useMemo(() => allTransacoes.filter(t => {
    if (filterType !== 'todos' && t._tipo !== filterType) return false;
    if (filterStatus !== 'todos' && t._status !== filterStatus) return false;
    if (filterProduto !== 'todos' && (t.produto || 'Outros') !== filterProduto) return false;
    if (search) {
      const s = search.toLowerCase();
      return (t.descricao||'').toLowerCase().includes(s) || (t.categoria||'').toLowerCase().includes(s) || (t.cliente_nome||t.responsavel_nome||'').toLowerCase().includes(s);
    }
    return true;
  }), [allTransacoes, filterType, filterStatus, filterProduto, search]);

  const updateDespesa = useMutation({
    mutationFn: ({id,data}) => base44.entities.Despesa.update(id, data),
    onSuccess: () => { refetchAll(); setPagandoConta(null); setEditingDespesa(null); toast.success('Atualizado!'); },
  });
  const updateReceita = useMutation({
    mutationFn: ({id,data}) => base44.entities.Receita.update(id, data),
    onSuccess: () => { refetchAll(); setRecebendoReceita(null); setEditingReceita(null); toast.success('Atualizado!'); },
  });
  const deleteDespesa = useMutation({
    mutationFn: id => base44.entities.Despesa.delete(id),
    onSuccess: () => { refetchAll(); toast.success('Excluído!'); },
  });
  const deleteReceita = useMutation({
    mutationFn: id => base44.entities.Receita.delete(id),
    onSuccess: () => { refetchAll(); toast.success('Excluído!'); },
  });

  const canDelete = ['master','super_admin','admin'].includes(user?.perfil);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar cliente, descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos tipos</SelectItem>
              <SelectItem value="receita">Receitas</SelectItem>
              <SelectItem value="despesa">Despesas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="recebida">Recebida</SelectItem>
              <SelectItem value="atrasada">Atrasada</SelectItem>
              <SelectItem value="prevista">Prevista</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterProduto} onValueChange={setFilterProduto}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos produtos</SelectItem>
              {['Consórcio','Financiamento','Empréstimo Consignado','Proteção Veicular','Seguros','Microcrédito','Outros'].map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(filterType !== 'todos' || filterStatus !== 'todos' || filterProduto !== 'todos' || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterType('todos'); setFilterStatus('todos'); setFilterProduto('todos'); setSearch(''); }}>
              <X className="w-4 h-4 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-600">Tipo</th>
                <th className="text-left p-3 font-semibold text-slate-600">Data</th>
                <th className="text-left p-3 font-semibold text-slate-600">Cliente/Descrição</th>
                <th className="text-left p-3 font-semibold text-slate-600">Produto</th>
                <th className="text-left p-3 font-semibold text-slate-600">Categoria</th>
                <th className="text-left p-3 font-semibold text-slate-600">Responsável</th>
                <th className="text-right p-3 font-semibold text-slate-600">Valor</th>
                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                <th className="text-left p-3 font-semibold text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">Nenhuma transação encontrada</td></tr>
              ) : filtered.map(t => {
                const isDespesa = t._tipo === 'despesa';
                const data = t.data_vencimento || t.data;
                const st = t._status;
                const stCls = STATUS_COLORS[st] || 'bg-slate-100 text-slate-500';
                return (
                  <tr key={t.id + t._tipo} className="border-b hover:bg-slate-50">
                    <td className="p-3">
                      {isDespesa
                        ? <span className="flex items-center gap-1 text-red-600 font-semibold text-xs"><TrendingDown className="w-3.5 h-3.5"/>Despesa</span>
                        : <span className="flex items-center gap-1 text-green-600 font-semibold text-xs"><TrendingUp className="w-3.5 h-3.5"/>Receita</span>}
                    </td>
                    <td className="p-3 text-slate-600">{data ? moment(data).format('DD/MM/YY') : '-'}</td>
                    <td className="p-3">
                      <p className="font-medium text-slate-900">{t.cliente_nome || t.descricao || '-'}</p>
                      {t.cliente_nome && <p className="text-xs text-slate-400">{t.descricao}</p>}
                    </td>
                    <td className="p-3 text-slate-500">{t.produto || '-'}</td>
                    <td className="p-3 text-slate-500">{t.categoria || '-'}</td>
                    <td className="p-3 text-slate-500">{t.responsavel_nome || '-'}</td>
                    <td className="p-3 text-right">
                      <span className={`font-bold ${isDespesa ? 'text-red-600' : 'text-green-600'}`}>
                        {isDespesa ? '- ' : '+ '}{BRL(t.valor)}
                      </span>
                    </td>
                    <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stCls}`}>{st}</span></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {isDespesa && !['pago','paga'].includes(st) && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-6 text-xs px-2"
                            onClick={() => setPagandoConta({ despesa: t, dataPagamento: moment().format('YYYY-MM-DD') })}>
                            Pagar
                          </Button>
                        )}
                        {!isDespesa && st !== 'recebida' && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-6 text-xs px-2"
                            onClick={() => setRecebendoReceita({ receita: t, dataRecebimento: moment().format('YYYY-MM-DD') })}>
                            Receber
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><MoreVertical className="w-3.5 h-3.5"/></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => isDespesa ? setEditingDespesa(t) : setEditingReceita(t)}>
                              <Edit2 className="w-3.5 h-3.5 mr-2"/>Editar
                            </DropdownMenuItem>
                            {canDelete && (
                              <DropdownMenuItem className="text-red-600" onClick={() => { if(confirm('Excluir?')) isDespesa ? deleteDespesa.mutate(t.id) : deleteReceita.mutate(t.id); }}>
                                <Trash2 className="w-3.5 h-3.5 mr-2"/>Excluir
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
        <div className="p-3 border-t text-xs text-slate-500">{filtered.length} transação(ões)</div>
      </Card>

      {/* Modal Pagar */}
      <Dialog open={!!pagandoConta} onOpenChange={() => setPagandoConta(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          {pagandoConta && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="font-semibold">{pagandoConta.despesa.descricao}</p>
                <p className="text-xl font-bold text-red-600">{BRL(pagandoConta.despesa.valor)}</p>
              </div>
              <div>
                <Label>Data de Pagamento</Label>
                <Input type="date" value={pagandoConta.dataPagamento} onChange={e => setPagandoConta(p => ({...p, dataPagamento: e.target.value}))} className="mt-1"/>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagandoConta(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateDespesa.mutate({ id: pagandoConta.despesa.id, data: { status: 'pago', data_pagamento: pagandoConta.dataPagamento }})}>
              <CheckCircle className="w-4 h-4 mr-1"/>Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Receber */}
      <Dialog open={!!recebendoReceita} onOpenChange={() => setRecebendoReceita(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar Recebimento</DialogTitle></DialogHeader>
          {recebendoReceita && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="font-semibold">{recebendoReceita.receita.descricao}</p>
                <p className="text-xl font-bold text-green-600">{BRL(recebendoReceita.receita.valor)}</p>
              </div>
              <div>
                <Label>Data de Recebimento</Label>
                <Input type="date" value={recebendoReceita.dataRecebimento} onChange={e => setRecebendoReceita(p => ({...p, dataRecebimento: e.target.value}))} className="mt-1"/>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecebendoReceita(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateReceita.mutate({ id: recebendoReceita.receita.id, data: { status: 'recebida', data_recebimento: recebendoReceita.dataRecebimento }})}>
              <CheckCircle className="w-4 h-4 mr-1"/>Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
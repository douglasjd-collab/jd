import React, { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CheckCircle, Search, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const BRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function AbaContasPagar({ despesas, refetchAll }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('pendente');
  const [pagandoModal, setPagandoModal] = useState(null);
  const hoje = moment().format('YYYY-MM-DD');

  const getStatus = (d) => {
    if (['pago','paga'].includes(d.status)) return 'pago';
    if (d.status === 'cancelado') return 'cancelado';
    const v = d.data_vencimento || d.data;
    if (v && v < hoje) return 'atrasado';
    return 'pendente';
  };

  const lista = useMemo(() => despesas.map(d => ({...d, _status: getStatus(d)})).filter(d => {
    if (filterStatus !== 'todos' && d._status !== filterStatus) return false;
    if (search) return (d.descricao||'').toLowerCase().includes(search.toLowerCase()) || (d.categoria||'').toLowerCase().includes(search.toLowerCase());
    return true;
  }).sort((a,b) => {
    const va = a.data_vencimento || a.data || '';
    const vb = b.data_vencimento || b.data || '';
    return va.localeCompare(vb);
  }), [despesas, filterStatus, search, hoje]);

  const totalPagar = useMemo(() => despesas.filter(d => !['pago','paga'].includes(d.status)).reduce((s,d) => s+(d.valor||0),0), [despesas]);
  const totalAtrasado = useMemo(() => despesas.filter(d => getStatus(d) === 'atrasado').reduce((s,d) => s+(d.valor||0),0), [despesas]);
  const totalPago = useMemo(() => despesas.filter(d => ['pago','paga'].includes(d.status)).reduce((s,d) => s+(d.valor||0),0), [despesas]);

  const updateDespesa = useMutation({
    mutationFn: ({id,data}) => base44.entities.Despesa.update(id, data),
    onSuccess: () => { refetchAll(); setPagandoModal(null); toast.success('Pagamento registrado!'); },
  });

  const statusColors = { pago: 'bg-green-100 text-green-700', paga: 'bg-green-100 text-green-700', pendente: 'bg-yellow-100 text-yellow-700', atrasado: 'bg-red-100 text-red-700', cancelado: 'bg-slate-100 text-slate-500' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4 border-yellow-200 bg-yellow-50">
          <p className="text-xs text-yellow-600 font-medium mb-1">Total a Pagar</p>
          <p className="text-xl font-bold text-yellow-700">{BRL(totalPagar)}</p>
        </Card>
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-xs text-red-600 font-medium mb-1">Em Atraso</p>
          <p className="text-xl font-bold text-red-700">{BRL(totalAtrasado)}</p>
          {totalAtrasado > 0 && <AlertCircle className="w-4 h-4 text-red-500 mt-1"/>}
        </Card>
        <Card className="p-4 border-green-200 bg-green-50">
          <p className="text-xs text-green-600 font-medium mb-1">Já Pago</p>
          <p className="text-xl font-bold text-green-700">{BRL(totalPago)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10"/>
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-600">Fornecedor/Descrição</th>
                <th className="text-left p-3 font-semibold text-slate-600">Categoria</th>
                <th className="text-right p-3 font-semibold text-slate-600">Valor</th>
                <th className="text-left p-3 font-semibold text-slate-600">Vencimento</th>
                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                <th className="text-left p-3 font-semibold text-slate-600">Responsável</th>
                <th className="text-left p-3 font-semibold text-slate-600">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">Nenhum registro encontrado</td></tr>
              ) : lista.map(d => {
                const st = d._status;
                return (
                  <tr key={d.id} className={`border-b hover:bg-slate-50 ${st === 'atrasado' ? 'bg-red-50' : ''}`}>
                    <td className="p-3">
                      <p className="font-medium">{d.descricao || '-'}</p>
                    </td>
                    <td className="p-3 text-slate-500">{d.categoria || '-'}</td>
                    <td className="p-3 text-right font-bold text-red-600">{BRL(d.valor)}</td>
                    <td className="p-3 text-slate-500">
                      {(d.data_vencimento || d.data) ? moment(d.data_vencimento || d.data).format('DD/MM/YY') : '-'}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[st] || 'bg-slate-100 text-slate-500'}`}>{st}</span>
                    </td>
                    <td className="p-3 text-slate-500">{d.responsavel_nome || '-'}</td>
                    <td className="p-3">
                      {!['pago','paga'].includes(st) && st !== 'cancelado' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2"
                          onClick={() => setPagandoModal({ despesa: d, dataPagamento: moment().format('YYYY-MM-DD') })}>
                          <CheckCircle className="w-3 h-3 mr-1"/>Pagar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!pagandoModal} onOpenChange={() => setPagandoModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          {pagandoModal && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="font-semibold">{pagandoModal.despesa.descricao}</p>
                <p className="text-xl font-bold text-red-600 mt-1">{BRL(pagandoModal.despesa.valor)}</p>
              </div>
              <div>
                <Label>Data de Pagamento</Label>
                <Input type="date" value={pagandoModal.dataPagamento} onChange={e => setPagandoModal(p => ({...p, dataPagamento: e.target.value}))} className="mt-1"/>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagandoModal(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateDespesa.mutate({ id: pagandoModal.despesa.id, data: { status: 'pago', data_pagamento: pagandoModal.dataPagamento }})}>
              <CheckCircle className="w-4 h-4 mr-1"/>Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
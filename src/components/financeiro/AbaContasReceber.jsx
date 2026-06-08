import React, { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CheckCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const BRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function AbaContasReceber({ receitas, refetchAll }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('pendente');
  const [recebendoModal, setRecebendoModal] = useState(null);
  const hoje = moment().format('YYYY-MM-DD');

  const pendentes = useMemo(() => receitas.filter(r => {
    if (filterStatus !== 'todos' && r.status !== filterStatus) return false;
    if (search) return (r.descricao||'').toLowerCase().includes(search.toLowerCase()) || (r.cliente_nome||'').toLowerCase().includes(search.toLowerCase());
    return true;
  }).sort((a,b) => (a.data||'').localeCompare(b.data||'')), [receitas, filterStatus, search]);

  const totalPendente = useMemo(() => pendentes.reduce((s,r) => s + (r.valor||0), 0), [pendentes]);
  const totalAtrasado = useMemo(() => receitas.filter(r => r.status !== 'recebida' && (r.data||'') < hoje).reduce((s,r) => s + (r.valor||0), 0), [receitas, hoje]);

  const updateReceita = useMutation({
    mutationFn: ({id,data}) => base44.entities.Receita.update(id, data),
    onSuccess: () => { refetchAll(); setRecebendoModal(null); toast.success('Receita marcada como recebida!'); },
  });

  const statusColors = {
    recebida: 'bg-green-100 text-green-700',
    pendente: 'bg-yellow-100 text-yellow-700',
    prevista: 'bg-purple-100 text-purple-700',
    'aguardando pagamento': 'bg-blue-100 text-blue-700',
    cancelada: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4 border-yellow-200 bg-yellow-50">
          <p className="text-xs text-yellow-600 font-medium mb-1">Total a Receber</p>
          <p className="text-xl font-bold text-yellow-700">{BRL(totalPendente)}</p>
          <p className="text-xs text-yellow-500 mt-1">{pendentes.length} registro(s)</p>
        </Card>
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-xs text-red-600 font-medium mb-1">Em Atraso</p>
          <p className="text-xl font-bold text-red-700">{BRL(totalAtrasado)}</p>
        </Card>
        <Card className="p-4 border-green-200 bg-green-50">
          <p className="text-xs text-green-600 font-medium mb-1">Já Recebido</p>
          <p className="text-xl font-bold text-green-700">{BRL(receitas.filter(r=>r.status==='recebida').reduce((s,r)=>s+(r.valor||0),0))}</p>
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
              <SelectItem value="prevista">Prevista</SelectItem>
              <SelectItem value="aguardando pagamento">Aguardando</SelectItem>
              <SelectItem value="recebida">Recebida</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-600">Cliente</th>
                <th className="text-left p-3 font-semibold text-slate-600">Produto</th>
                <th className="text-left p-3 font-semibold text-slate-600">Descrição</th>
                <th className="text-left p-3 font-semibold text-slate-600">Banco/Origem</th>
                <th className="text-right p-3 font-semibold text-slate-600">Valor Previsto</th>
                <th className="text-left p-3 font-semibold text-slate-600">Data Prevista</th>
                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                <th className="text-left p-3 font-semibold text-slate-600">Responsável</th>
                <th className="text-left p-3 font-semibold text-slate-600">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">Nenhum registro encontrado</td></tr>
              ) : pendentes.map(r => {
                const atrasado = r.status !== 'recebida' && (r.data||'') < hoje;
                return (
                  <tr key={r.id} className={`border-b hover:bg-slate-50 ${atrasado ? 'bg-red-50' : ''}`}>
                    <td className="p-3 font-medium">{r.cliente_nome || '-'}</td>
                    <td className="p-3 text-slate-500">{r.produto || '-'}</td>
                    <td className="p-3 text-slate-500">{r.descricao || '-'}</td>
                    <td className="p-3 text-slate-500">{r.origem || '-'}</td>
                    <td className="p-3 text-right font-bold text-green-600">{BRL(r.valor)}</td>
                    <td className="p-3 text-slate-500">{r.data ? moment(r.data).format('DD/MM/YY') : '-'}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[r.status] || 'bg-slate-100 text-slate-500'}`}>
                        {atrasado && r.status !== 'recebida' ? 'Atrasada' : (r.status || 'pendente')}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{r.responsavel_nome || '-'}</td>
                    <td className="p-3">
                      {r.status !== 'recebida' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2"
                          onClick={() => setRecebendoModal({ receita: r, dataRecebimento: moment().format('YYYY-MM-DD') })}>
                          <CheckCircle className="w-3 h-3 mr-1"/>Recebido
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

      <Dialog open={!!recebendoModal} onOpenChange={() => setRecebendoModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar Recebimento</DialogTitle></DialogHeader>
          {recebendoModal && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="font-semibold">{recebendoModal.receita.descricao}</p>
                <p className="text-xl font-bold text-green-600 mt-1">{BRL(recebendoModal.receita.valor)}</p>
              </div>
              <div>
                <Label>Data de Recebimento</Label>
                <Input type="date" value={recebendoModal.dataRecebimento} onChange={e => setRecebendoModal(p => ({...p, dataRecebimento: e.target.value}))} className="mt-1"/>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecebendoModal(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateReceita.mutate({ id: recebendoModal.receita.id, data: { status: 'recebida', data_recebimento: recebendoModal.dataRecebimento }})}>
              <CheckCircle className="w-4 h-4 mr-1"/>Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
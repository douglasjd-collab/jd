import React, { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const BRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function AbaComissoes({ comissoes, refetchAll, user }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');

  const lista = useMemo(() => comissoes.filter(c => {
    if (filterStatus !== 'todos' && c.status_pagamento !== filterStatus) return false;
    if (search) return (c.vendedor_nome||'').toLowerCase().includes(search.toLowerCase()) || (c.cliente_nome||'').toLowerCase().includes(search.toLowerCase());
    return true;
  }), [comissoes, filterStatus, search]);

  const totalPrevisto = useMemo(() => comissoes.reduce((s,c) => s+(c.valor_comissao||c.valor_vendedor||0),0), [comissoes]);
  const totalPago = useMemo(() => comissoes.filter(c=>['pago','paga'].includes(c.status_pagamento)).reduce((s,c) => s+(c.valor_vendedor||0),0), [comissoes]);
  const totalPendente = useMemo(() => comissoes.filter(c=>!['pago','paga'].includes(c.status_pagamento)).reduce((s,c) => s+(c.valor_vendedor||0),0), [comissoes]);

  const updateComissao = useMutation({
    mutationFn: ({id,data}) => base44.entities.ComissaoAPagar.update(id, data),
    onSuccess: () => { refetchAll(); toast.success('Comissão atualizada!'); },
  });

  const statusColors = {
    'a_pagar': 'bg-yellow-100 text-yellow-700',
    'pendente': 'bg-yellow-100 text-yellow-700',
    'pago': 'bg-green-100 text-green-700',
    'paga': 'bg-green-100 text-green-700',
    'liberada': 'bg-blue-100 text-blue-700',
  };

  const canManage = ['master','super_admin','admin','gerente'].includes(user?.perfil);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 border-blue-200 bg-blue-50">
          <p className="text-xs text-blue-600 font-medium mb-1">Total Previsto</p>
          <p className="text-xl font-bold text-blue-700">{BRL(totalPrevisto)}</p>
        </Card>
        <Card className="p-4 border-yellow-200 bg-yellow-50">
          <p className="text-xs text-yellow-600 font-medium mb-1">Pendente</p>
          <p className="text-xl font-bold text-yellow-700">{BRL(totalPendente)}</p>
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
            <Input placeholder="Buscar vendedor, cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10"/>
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="a_pagar">A Pagar</SelectItem>
              <SelectItem value="liberada">Liberada</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-600">Vendedor</th>
                <th className="text-left p-3 font-semibold text-slate-600">Cliente</th>
                <th className="text-left p-3 font-semibold text-slate-600">Produto</th>
                <th className="text-right p-3 font-semibold text-slate-600">Comissão Prevista</th>
                <th className="text-right p-3 font-semibold text-slate-600">Valor Vendedor</th>
                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                <th className="text-left p-3 font-semibold text-slate-600">Data</th>
                {canManage && <th className="text-left p-3 font-semibold text-slate-600">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={canManage ? 8 : 7} className="p-8 text-center text-slate-400">Nenhuma comissão encontrada</td></tr>
              ) : lista.map(c => {
                const st = c.status_pagamento || 'pendente';
                return (
                  <tr key={c.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-medium">{c.vendedor_nome || '-'}</td>
                    <td className="p-3 text-slate-500">{c.cliente_nome || '-'}</td>
                    <td className="p-3 text-slate-500">{c.produto || c.tipo_produto || '-'}</td>
                    <td className="p-3 text-right font-semibold text-blue-600">{BRL(c.valor_comissao)}</td>
                    <td className="p-3 text-right font-bold text-green-600">{BRL(c.valor_vendedor)}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[st] || 'bg-slate-100 text-slate-500'}`}>{st}</span>
                    </td>
                    <td className="p-3 text-slate-500">{c.created_date ? moment(c.created_date).format('DD/MM/YY') : '-'}</td>
                    {canManage && (
                      <td className="p-3">
                        <div className="flex gap-1">
                          {st === 'pendente' && (
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-blue-300 text-blue-600"
                              onClick={() => updateComissao.mutate({ id: c.id, data: { status_pagamento: 'liberada' }})}>
                              Liberar
                            </Button>
                          )}
                          {['liberada','a_pagar'].includes(st) && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-6 text-xs px-2"
                              onClick={() => updateComissao.mutate({ id: c.id, data: { status_pagamento: 'pago', data_pagamento: moment().format('YYYY-MM-DD') }})}>
                              <CheckCircle className="w-3 h-3 mr-1"/>Pagar
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
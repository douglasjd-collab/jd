import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { PERFIS_ADIANTAMENTO, STATUS_FILTROS } from './adiantamentoHelpers';

const FILTROS_VAZIOS = { busca: '', status: 'todos', pessoaTipo: 'todos', recebedor: 'todos', dataInicio: '', dataFim: '' };

export default function FiltrosAdiantamentos({ filtros, onChange, recebedores = [] }) {
  const set = (campo, valor) => onChange({ ...filtros, [campo]: valor });
  const temFiltro = filtros.busca || filtros.pessoaTipo !== 'todos' || filtros.recebedor !== 'todos' || filtros.dataInicio || filtros.dataFim || filtros.status !== 'pendente';

  return (
    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="md:col-span-2 xl:col-span-3">
          <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar por nome ou motivo..." value={filtros.busca} onChange={e => set('busca', e.target.value)} className="pl-10" />
          </div>
        </div>

        <div>
          <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Período — de</Label>
          <Input type="date" value={filtros.dataInicio} onChange={e => set('dataInicio', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Período — até</Label>
          <Input type="date" value={filtros.dataFim} onChange={e => set('dataFim', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Status</Label>
          <Select value={filtros.status} onValueChange={v => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTROS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Recebedor</Label>
          <Select value={filtros.recebedor} onValueChange={v => set('recebedor', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os recebedores</SelectItem>
              {recebedores.map(nome => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Tipo de recebedor</Label>
          <Select value={filtros.pessoaTipo} onValueChange={v => set('pessoaTipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {PERFIS_ADIANTAMENTO.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" className="w-full" disabled={!temFiltro} onClick={() => onChange({ ...FILTROS_VAZIOS })}>
            <X className="w-4 h-4 mr-2" /> Limpar filtros
          </Button>
        </div>
      </div>
    </Card>
  );
}
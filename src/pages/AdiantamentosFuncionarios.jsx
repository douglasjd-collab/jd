import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, DollarSign, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const emptyForm = { colaborador_id: '', data: '', valor: '', descricao: '' };

export default function AdiantamentosFuncionarios() {
  const [user, setUser] = useState(null);
  const [adiantamentos, setAdiantamentos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [colabF, setColabF] = useState('todos');
  const [statusF, setStatusF] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      carregar(me);
    });
  }, []);

  const carregar = async (me) => {
    setLoading(true);
    const filtro = me?.empresa_id ? { empresa_id: me.empresa_id } : {};
    const [a, c] = await Promise.all([
      base44.entities.AdiantamentoFuncionario.filter(filtro, '-created_date', 500),
      base44.entities.FuncionarioColaborador.filter(filtro, 'nome', 200)
    ]);
    setAdiantamentos(a);
    setColaboradores(c);
    setLoading(false);
  };

  const salvar = async () => {
    if (!form.colaborador_id || !form.valor || !form.data) return toast.error('Preencha todos os campos');
    setSaving(true);
    const colab = colaboradores.find(c => c.id === form.colaborador_id);
    const payload = {
      empresa_id: user?.empresa_id,
      colaborador_id: form.colaborador_id,
      colaborador_nome: colab?.nome || '',
      data: form.data,
      valor: parseFloat(form.valor) || 0,
      descricao: form.descricao,
      status: 'Pendente'
    };
    await base44.entities.AdiantamentoFuncionario.create(payload);

    // Criar despesa automática como PAGA (saída real de caixa)
    await base44.entities.Despesa.create({
      empresa_id: user?.empresa_id,
      descricao: `Adiantamento salarial - ${colab?.nome}`,
      valor: payload.valor,
      data: payload.data,
      data_vencimento: payload.data,
      data_pagamento: payload.data,
      status: 'pago',
      categoria: 'Funcionários',
      responsavel_id: form.colaborador_id,
      responsavel_nome: colab?.nome || '',
      observacao: payload.descricao || 'Adiantamento salarial',
    }).catch(() => null);

    toast.success('Adiantamento registrado!');
    setSaving(false);
    setModalOpen(false);
    carregar(user);
  };

  const excluir = async (a) => {
    if (!confirm('Excluir adiantamento?')) return;
    await base44.entities.AdiantamentoFuncionario.delete(a.id);
    toast.success('Removido!');
    carregar(user);
  };

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const filtrados = adiantamentos.filter(a => {
    const okColab = colabF === 'todos' || a.colaborador_id === colabF;
    const okStatus = statusF === 'todos' || a.status === statusF;
    return okColab && okStatus;
  });

  const totalPendente = adiantamentos.filter(a => a.status === 'Pendente').reduce((s, a) => s + (a.valor || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Adiantamentos</h1>
          <p className="text-slate-500 text-sm">Controle de adiantamentos salariais</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }} className="bg-[#10353C] hover:bg-[#10353C]/90 gap-2">
          <Plus className="w-4 h-4" /> Novo Adiantamento
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Pendente</p>
            <p className="text-xl font-bold text-orange-600">{fmt(totalPendente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Registros</p>
            <p className="text-2xl font-bold text-slate-800">{filtrados.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Select value={colabF} onValueChange={setColabF}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Descontado">Descontado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Nenhum adiantamento encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-slate-600">Colaborador</th>
                    <th className="text-left p-3 font-medium text-slate-600">Data</th>
                    <th className="text-left p-3 font-medium text-slate-600">Valor</th>
                    <th className="text-left p-3 font-medium text-slate-600">Descrição</th>
                    <th className="text-left p-3 font-medium text-slate-600">Status</th>
                    <th className="text-left p-3 font-medium text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(a => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-medium">{a.colaborador_nome}</td>
                      <td className="p-3">{a.data ? format(new Date(a.data + 'T00:00:00'), 'dd/MM/yyyy') : '-'}</td>
                      <td className="p-3 font-bold text-orange-600">{fmt(a.valor)}</td>
                      <td className="p-3 text-slate-500">{a.descricao || '-'}</td>
                      <td className="p-3">
                        <Badge className={a.status === 'Pendente' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {a.status === 'Pendente' && (
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => excluir(a)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Adiantamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={v => setForm({...form, colaborador_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {colaboradores.filter(c => c.status === 'Ativo').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} />
            </div>
            <div>
              <Label>Valor *</Label>
              <Input type="number" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} placeholder="0,00" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} placeholder="Motivo do adiantamento" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="bg-[#10353C] hover:bg-[#10353C]/90">
              {saving ? 'Salvando...' : 'Registrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
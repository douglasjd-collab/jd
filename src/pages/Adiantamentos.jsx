import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Plus, Loader2, Search, Wallet, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';
import 'moment/locale/pt-br';
moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_COLORS = {
  pendente: 'bg-orange-100 text-orange-700',
  descontado: 'bg-green-100 text-green-700',
  cancelado: 'bg-slate-100 text-slate-500',
};

export default function Adiantamentos() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pendente');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    pessoa_tipo: 'vendedor',
    colaborador_id: '',
    colaborador_nome: '',
    parceiro_id: '',
    parceiro_nome: '',
    valor: '',
    data: moment().format('YYYY-MM-DD'),
    motivo: '',
    observacoes: '',
    status: 'pendente',
  });

  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const c = colabs[0];
        setUser({ ...me, perfil: c.perfil, empresa_id: c.empresa_id, colaborador_id: c.id });
      }
    }
  };

  const { data: adiantamentos = [], isLoading } = useQuery({
    queryKey: ['adiantamentos', user?.empresa_id],
    queryFn: () => {
      const filtro = {};
      if (user?.empresa_id) filtro.empresa_id = user.empresa_id;
      return base44.entities.Adiantamento.filter(filtro, '-data', 500);
    },
    enabled: !!user,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colab-adi', user?.empresa_id],
    queryFn: () => {
      const f = { status: 'ativo' };
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      return base44.entities.Colaborador.filter(f, 'nome', 200);
    },
    enabled: !!user,
  });

  const { data: parceiros = [] } = useQuery({
    queryKey: ['parceiros-adi', user?.empresa_id],
    queryFn: () => {
      const f = {};
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      return base44.entities.EmpresaParceira.filter(f, 'nome', 200);
    },
    enabled: !!user,
  });

  const filtered = adiantamentos.filter(a => {
    if (statusFilter !== 'todos' && a.status !== statusFilter) return false;
    if (search) {
      const t = search.toLowerCase();
      return (
        (a.colaborador_nome || a.parceiro_nome || '').toLowerCase().includes(t) ||
        (a.motivo || '').toLowerCase().includes(t)
      );
    }
    return true;
  });

  const totalPendente = adiantamentos.filter(a => a.status === 'pendente').reduce((acc, a) => acc + (a.valor || 0), 0);
  const totalDescontado = adiantamentos.filter(a => a.status === 'descontado').reduce((acc, a) => acc + (a.valor || 0), 0);

  const abrirModal = (adi = null) => {
    if (adi) {
      setEditando(adi);
      setForm({
        pessoa_tipo: adi.pessoa_tipo || 'vendedor',
        colaborador_id: adi.colaborador_id || '',
        colaborador_nome: adi.colaborador_nome || '',
        parceiro_id: adi.parceiro_id || '',
        parceiro_nome: adi.parceiro_nome || '',
        valor: String(adi.valor || ''),
        data: adi.data || moment().format('YYYY-MM-DD'),
        motivo: adi.motivo || '',
        observacoes: adi.observacoes || '',
        status: adi.status || 'pendente',
      });
    } else {
      setEditando(null);
      setForm({
        pessoa_tipo: 'vendedor',
        colaborador_id: '',
        colaborador_nome: '',
        parceiro_id: '',
        parceiro_nome: '',
        valor: '',
        data: moment().format('YYYY-MM-DD'),
        motivo: '',
        observacoes: '',
      });
    }
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!form.valor || parseFloat(form.valor) <= 0) { toast.error('Informe o valor'); return; }
    if (!form.data) { toast.error('Informe a data'); return; }
    if (form.pessoa_tipo === 'vendedor' && !form.colaborador_id) { toast.error('Selecione o vendedor'); return; }
    if (form.pessoa_tipo === 'parceiro' && !form.parceiro_id) { toast.error('Selecione o parceiro'); return; }

    setIsSaving(true);
    try {
      const data = {
        empresa_id: user.empresa_id,
        pessoa_tipo: form.pessoa_tipo,
        colaborador_id: form.pessoa_tipo === 'vendedor' ? form.colaborador_id : null,
        colaborador_nome: form.pessoa_tipo === 'vendedor' ? form.colaborador_nome : null,
        parceiro_id: form.pessoa_tipo === 'parceiro' ? form.parceiro_id : null,
        parceiro_nome: form.pessoa_tipo === 'parceiro' ? form.parceiro_nome : null,
        valor: parseFloat(form.valor),
        data: form.data,
        motivo: form.motivo || '',
        observacoes: form.observacoes || '',
        status: form.status || editando?.status || 'pendente',
        // Limpar data_desconto ao reabrir
        ...(form.status === 'pendente' ? { data_desconto: null, lote_pagamento_id: null } : {}),
      };
      if (editando) {
        await base44.entities.Adiantamento.update(editando.id, data);
        toast.success('Adiantamento atualizado!');
      } else {
        await base44.entities.Adiantamento.create(data);
        toast.success('Adiantamento registrado!');
      }
      queryClient.invalidateQueries(['adiantamentos']);
      setModalOpen(false);
    } catch (err) {
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelar = async (adi) => {
    if (!confirm('Cancelar este adiantamento?')) return;
    await base44.entities.Adiantamento.update(adi.id, { status: 'cancelado' });
    queryClient.invalidateQueries(['adiantamentos']);
    toast.success('Adiantamento cancelado');
  };

  if (!user) return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>;

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user.perfil);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Adiantamentos</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie adiantamentos de salários a vendedores e parceiros.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => abrirModal()} className="bg-[#10353C] hover:bg-[#1a5060] text-white">
            <Plus className="w-4 h-4 mr-2" /> Novo Adiantamento
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Pendente</p>
            <p className="text-lg font-bold text-orange-700">{fmt(totalPendente)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Descontado</p>
            <p className="text-lg font-bold text-green-700">{fmt(totalDescontado)}</p>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por nome ou motivo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendente">⏳ Pendentes</SelectItem>
            <SelectItem value="descontado">✅ Descontados</SelectItem>
            <SelectItem value="cancelado">❌ Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <Card className="p-8 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">
          <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum adiantamento encontrado</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <Card key={a.id} className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 flex-shrink-0">
                {(a.colaborador_nome || a.parceiro_nome || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-800">{a.colaborador_nome || a.parceiro_nome || '-'}</p>
                  <Badge className={`text-xs ${a.pessoa_tipo === 'vendedor' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {a.pessoa_tipo === 'vendedor' ? 'Vendedor' : 'Parceiro'}
                  </Badge>
                  <Badge className={`text-xs ${STATUS_COLORS[a.status]}`}>
                    {a.status === 'pendente' ? '⏳ Pendente' : a.status === 'descontado' ? '✅ Descontado' : '❌ Cancelado'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span>{moment(a.data).format('DD/MM/YYYY')}</span>
                  {a.motivo && <><span>•</span><span>{a.motivo}</span></>}
                  {a.status === 'descontado' && a.data_desconto && (
                    <><span>•</span><span className="text-green-600">Descontado em {moment(a.data_desconto).format('DD/MM/YYYY')}</span></>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-lg text-slate-800">{fmt(a.valor)}</p>
              </div>
              {isAdmin && (
                <div className="flex gap-1 flex-shrink-0">
                  {a.status === 'pendente' && <>
                    <Button size="sm" variant="outline" onClick={() => abrirModal(a)} className="h-8 px-2 text-xs">Editar</Button>
                    <Button size="sm" variant="outline" onClick={() => handleCancelar(a)} className="h-8 px-2 text-xs text-red-600 hover:text-red-700">Cancelar</Button>
                  </>}
                  {a.status === 'descontado' && (
                    <Button size="sm" variant="outline" onClick={() => abrirModal(a)} className="h-8 px-2 text-xs text-orange-600 hover:text-orange-700">Reabrir / Editar</Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Adiantamento' : 'Novo Adiantamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Tipo de Pessoa *</Label>
              <Select value={form.pessoa_tipo} onValueChange={v => setForm(f => ({ ...f, pessoa_tipo: v, colaborador_id: '', colaborador_nome: '', parceiro_id: '', parceiro_nome: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor / Colaborador</SelectItem>
                  <SelectItem value="parceiro">Empresa Parceira</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.pessoa_tipo === 'vendedor' ? (
              <div>
                <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Vendedor *</Label>
                <Select value={form.colaborador_id} onValueChange={v => {
                  const c = colaboradores.find(x => x.id === v);
                  setForm(f => ({ ...f, colaborador_id: v, colaborador_nome: c?.nome || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Parceiro *</Label>
                <Select value={form.parceiro_id} onValueChange={v => {
                  const p = parceiros.find(x => x.id === v);
                  setForm(f => ({ ...f, parceiro_id: v, parceiro_nome: p?.nome || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Valor (R$) *</Label>
                <Input type="number" min="0" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Data *</Label>
                <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Motivo</Label>
              <Input placeholder="Ex: Adiantamento de salário, auxílio..." value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Observações</Label>
              <Input placeholder="Observações adicionais..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

            {editando?.status === 'descontado' && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-700">⚠️ Este adiantamento está marcado como descontado. Para reabrir (ex: desconto parcial), altere o status abaixo:</p>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="descontado">✅ Descontado</SelectItem>
                    <SelectItem value="pendente">⏳ Pendente (reabrir)</SelectItem>
                    <SelectItem value="cancelado">❌ Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={isSaving} className="bg-[#10353C] hover:bg-[#1a5060] text-white">
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
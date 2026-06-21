import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle, Upload, X, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Helpers ───────────────────────────────────────────────
const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const hoje = () => format(new Date(), 'yyyy-MM-dd');
const inicioMes = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');
const fimMes = () => format(endOfMonth(new Date()), 'yyyy-MM-dd');

// ─── Componente Principal ──────────────────────────────────
export default function MeuFinanceiro() {
  const [user, setUser] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('dashboard');

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me) { setCarregando(false); return; }
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date');
        const colab = colabs.find(c => c.status === 'ativo') || colabs[0];
        setUser({ ...me, colaborador_id: colab?.id, empresa_id: colab?.empresa_id, nome_perfil: colab?.nome || me.full_name });
      } catch (e) { console.error(e); } finally { setCarregando(false); }
    })();
  }, []);

  if (carregando) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (!user) return <div className="text-center py-20 text-slate-500">Usuário não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meu Financeiro</h1>
          <p className="text-sm text-slate-500 mt-1">Gestão financeira independente do parceiro</p>
        </div>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="receitas">Receitas</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><DashboardTab user={user} /></TabsContent>
        <TabsContent value="receitas"><ReceitasTab user={user} /></TabsContent>
        <TabsContent value="despesas"><DespesasTab user={user} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────
function DashboardTab({ user }) {
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const filtro = { usuario_id: user.auth_id, empresa_id: user.empresa_id };
      const [r, d] = await Promise.all([
        base44.entities.MeuFinanceiroReceita.filter(filtro, '-data', 2000),
        base44.entities.MeuFinanceiroDespesa.filter(filtro, '-data', 2000),
      ]);
      setReceitas(r);
      setDespesas(d);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalReceitas = receitas.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
  const totalDespesas = despesas.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
  const receitasPendentes = receitas.filter(r => r.status === 'pendente').reduce((s, r) => s + (r.valor || 0), 0);
  const despesasPendentes = despesas.filter(d => d.status === 'pendente').reduce((s, d) => s + (d.valor || 0), 0);
  const saldo = totalReceitas - totalDespesas;

  // Por mês (últimos 6 meses)
  const mesesMap = useMemo(() => {
    const map = {};
    for (let i = 5; i >= 0; i--) {
      const mes = format(subMonths(new Date(), i), 'yyyy-MM');
      map[mes] = { receitas: 0, despesas: 0 };
    }
    receitas.forEach(r => {
      if (!r.data) return;
      const mes = r.data.substring(0, 7);
      if (map[mes] !== undefined) map[mes].receitas += r.valor || 0;
    });
    despesas.forEach(d => {
      if (!d.data) return;
      const mes = d.data.substring(0, 7);
      if (map[mes] !== undefined) map[mes].despesas += d.valor || 0;
    });
    return Object.entries(map).map(([mes, vals]) => ({ mes: format(parseISO(mes + '-01'), 'MMM/yy', { locale: ptBR }), ...vals }));
  }, [receitas, despesas]);

  // Despesas por categoria
  const categoriasMap = useMemo(() => {
    const map = {};
    despesas.filter(d => d.status === 'pago').forEach(d => {
      const cat = d.categoria || 'Sem categoria';
      map[cat] = (map[cat] || 0) + (d.valor || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [despesas]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6 mt-4">
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2"><ArrowUpCircle className="w-4 h-4" /> Entradas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-700">{fmtMoeda(totalReceitas)}</p></CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2"><ArrowDownCircle className="w-4 h-4" /> Saídas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-700">{fmtMoeda(totalDespesas)}</p></CardContent>
        </Card>
        <Card className={saldo >= 0 ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2"><Wallet className="w-4 h-4" /> Saldo</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${saldo >= 0 ? 'text-blue-700' : 'text-orange-600'}`}>{fmtMoeda(saldo)}</p></CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-700 flex items-center gap-2"><Calendar className="w-4 h-4" /> A Receber</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-700">{fmtMoeda(receitasPendentes)}</p></CardContent>
        </Card>
      </div>

      {/* Gráfico de barras mensais */}
      <Card>
        <CardHeader><CardTitle className="text-base">Resultado Mensal</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mesesMap.map(m => {
              const resultado = m.receitas - m.despesas;
              const maxVal = Math.max(...mesesMap.flatMap(x => [x.receitas, x.despesas]), 1);
              return (
                <div key={m.mes}>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span className="font-medium capitalize">{m.mes}</span>
                    <span className={resultado >= 0 ? 'text-green-600' : 'text-red-600'}>{fmtMoeda(resultado)}</span>
                  </div>
                  <div className="flex gap-1 h-5">
                    <div className="bg-green-400 rounded" style={{ width: `${(m.receitas / maxVal) * 100}%`, minWidth: m.receitas > 0 ? 4 : 0 }} title={`Receitas: ${fmtMoeda(m.receitas)}`} />
                    <div className="bg-red-400 rounded" style={{ width: `${(m.despesas / maxVal) * 100}%`, minWidth: m.despesas > 0 ? 4 : 0 }} title={`Despesas: ${fmtMoeda(m.despesas)}`} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded" /> Receitas</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded" /> Despesas</span>
          </div>
        </CardContent>
      </Card>

      {/* Despesas por categoria */}
      {categoriasMap.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categoriasMap.map(([cat, val]) => {
                const pct = totalDespesas > 0 ? (val / totalDespesas) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-0.5"><span className="text-slate-700">{cat}</span><span className="text-slate-500">{fmtMoeda(val)}</span></div>
                    <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-red-400 h-2 rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Lista de Receitas ─────────────────────────────────────
function ReceitasTab({ user }) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, item: null });

  const filtroBase = { usuario_id: user.auth_id, empresa_id: user.empresa_id };

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setItens(await base44.entities.MeuFinanceiroReceita.filter(filtroBase, '-data', 1000)); } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar]);

  const excluir = async (id) => {
    if (!confirm('Excluir esta receita?')) return;
    try { await base44.entities.MeuFinanceiroReceita.delete(id); toast.success('Receita excluída'); carregar(); } catch (e) { toast.error('Erro ao excluir'); }
  };

  const total = itens.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
  const pendente = itens.filter(r => r.status === 'pendente').reduce((s, r) => s + (r.valor || 0), 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3 text-sm">
          <span className="text-green-700 font-medium">Recebido: {fmtMoeda(total)}</span>
          <span className="text-amber-600 font-medium">Pendente: {fmtMoeda(pendente)}</span>
        </div>
        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setModal({ open: true, item: null, tipo: 'receita' })}><Plus className="w-4 h-4 mr-1" /> Nova Receita</Button>
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : itens.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Nenhuma receita cadastrada.</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Descrição</th><th className="text-left px-4 py-3">Categoria</th><th className="text-left px-4 py-3">Data</th><th className="text-right px-4 py-3">Valor</th><th className="text-center px-4 py-3">Status</th><th className="text-right px-4 py-3">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itens.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.descricao}</td>
                  <td className="px-4 py-3 text-slate-500">{item.categoria || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.data ? format(parseISO(item.data), 'dd/MM/yy') : '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-700">{fmtMoeda(item.valor)}</td>
                  <td className="px-4 py-3 text-center"><Badge className={item.status === 'recebida' ? 'bg-green-100 text-green-700' : item.status === 'pendente' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}>{item.status === 'recebida' ? 'Recebida' : item.status === 'pendente' ? 'Pendente' : 'Cancelada'}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setModal({ open: true, item, tipo: 'receita' })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => excluir(item.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && <FormModal open={modal.open} onClose={() => setModal({ open: false, item: null })} item={modal.item} tipo="receita" user={user} onSaved={carregar} />}
    </div>
  );
}

// ─── Lista de Despesas ─────────────────────────────────────
function DespesasTab({ user }) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, item: null });

  const filtroBase = { usuario_id: user.auth_id, empresa_id: user.empresa_id };

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setItens(await base44.entities.MeuFinanceiroDespesa.filter(filtroBase, '-data', 1000)); } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar]);

  const excluir = async (id) => {
    if (!confirm('Excluir esta despesa?')) return;
    try { await base44.entities.MeuFinanceiroDespesa.delete(id); toast.success('Despesa excluída'); carregar(); } catch (e) { toast.error('Erro ao excluir'); }
  };

  const total = itens.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
  const pendente = itens.filter(d => d.status === 'pendente').reduce((s, d) => s + (d.valor || 0), 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3 text-sm">
          <span className="text-red-600 font-medium">Pago: {fmtMoeda(total)}</span>
          <span className="text-amber-600 font-medium">Pendente: {fmtMoeda(pendente)}</span>
        </div>
        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setModal({ open: true, item: null, tipo: 'despesa' })}><Plus className="w-4 h-4 mr-1" /> Nova Despesa</Button>
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : itens.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Nenhuma despesa cadastrada.</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Descrição</th><th className="text-left px-4 py-3">Categoria</th><th className="text-left px-4 py-3">Data</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Valor</th><th className="text-center px-4 py-3">Status</th><th className="text-right px-4 py-3">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itens.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.descricao}</td>
                  <td className="px-4 py-3 text-slate-500">{item.categoria || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.data ? format(parseISO(item.data), 'dd/MM/yy') : '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.data_vencimento ? format(parseISO(item.data_vencimento), 'dd/MM/yy') : '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">{fmtMoeda(item.valor)}</td>
                  <td className="px-4 py-3 text-center"><Badge className={item.status === 'pago' ? 'bg-green-100 text-green-700' : item.status === 'pendente' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}>{item.status === 'pago' ? 'Pago' : item.status === 'pendente' ? 'Pendente' : 'Cancelado'}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setModal({ open: true, item, tipo: 'despesa' })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => excluir(item.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && <FormModal open={modal.open} onClose={() => setModal({ open: false, item: null })} item={modal.item} tipo="despesa" user={user} onSaved={carregar} />}
    </div>
  );
}

// ─── Modal de Formulário ──────────────────────────────────
function FormModal({ open, onClose, item, tipo, user, onSaved }) {
  const [form, setForm] = useState({
    descricao: '', categoria: '', valor: '', data: hoje(),
    status: tipo === 'receita' ? 'recebida' : 'pendente',
    data_recebimento: '', data_vencimento: '', data_pagamento: '',
    observacao: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [categoriasSugestoes, setCategoriasSugestoes] = useState([]);
  const editando = !!item;

  useEffect(() => {
    if (open) carregarCategorias();
    if (item) {
      setForm({
        descricao: item.descricao || '',
        categoria: item.categoria || '',
        valor: item.valor || '',
        data: item.data || hoje(),
        status: item.status || (tipo === 'receita' ? 'recebida' : 'pendente'),
        data_recebimento: item.data_recebimento || '',
        data_vencimento: item.data_vencimento || '',
        data_pagamento: item.data_pagamento || '',
        observacao: item.observacao || '',
      });
    } else {
      setForm({
        descricao: '', categoria: '', valor: '', data: hoje(),
        status: tipo === 'receita' ? 'recebida' : 'pendente',
        data_recebimento: '', data_vencimento: '', data_pagamento: '',
        observacao: '',
      });
    }
  }, [open, item]);

  const carregarCategorias = async () => {
    try {
      const filtro = { usuario_id: user.auth_id };
      const entidade = tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
      const dados = await base44.entities[entidade].filter(filtro, '-data', 500);
      const cats = [...new Set(dados.map(d => d.categoria).filter(Boolean))];
      setCategoriasSugestoes(cats);
    } catch (e) { /* silencioso */ }
  };

  const handleSalvar = async () => {
    if (!form.descricao.trim()) { toast.error('Informe a descrição'); return; }
    if (!form.valor || parseFloat(form.valor) <= 0) { toast.error('Informe um valor válido'); return; }
    setSalvando(true);
    try {
      const payload = {
        descricao: form.descricao.trim(),
        categoria: form.categoria.trim() || 'Geral',
        valor: parseFloat(form.valor),
        data: form.data,
        status: form.status,
        observacao: form.observacao.trim(),
        empresa_id: user.empresa_id,
        usuario_id: user.auth_id,
        usuario_nome: user.nome_perfil || user.full_name,
      };
      if (tipo === 'receita') {
        payload.data_recebimento = form.data_recebimento || null;
      } else {
        payload.data_vencimento = form.data_vencimento || null;
        payload.data_pagamento = form.data_pagamento || null;
      }
      const entidade = tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
      if (editando) await base44.entities[entidade].update(item.id, payload);
      else await base44.entities[entidade].create(payload);
      toast.success(editando ? 'Atualizado com sucesso!' : 'Criado com sucesso!');
      onSaved();
      onClose();
    } catch (e) { toast.error('Erro ao salvar'); console.error(e); } finally { setSalvando(false); }
  };

  const titulo = tipo === 'receita' ? (editando ? 'Editar Receita' : 'Nova Receita') : (editando ? 'Editar Despesa' : 'Nova Despesa');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{tipo === 'receita' ? <TrendingUp className="w-5 h-5 text-green-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}{titulo}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Descrição *</label>
            <Input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Comissão de venda" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Categoria</label>
            <div className="flex gap-2 mt-1">
              <Input value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} placeholder="Ex: Comissões" className="flex-1" list={`catlist-${tipo}`} />
              <datalist id={`catlist-${tipo}`}>
                {categoriasSugestoes.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Valor (R$) *</label>
              <Input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Data *</label>
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tipo === 'receita' ? (
                  <><SelectItem value="recebida">Recebida</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem></>
                ) : (
                  <><SelectItem value="pago">Pago</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></>
                )}
              </SelectContent>
            </Select>
          </div>
          {tipo === 'receita' && (
            <div>
              <label className="text-sm font-medium text-slate-700">Data de Recebimento</label>
              <Input type="date" value={form.data_recebimento} onChange={e => setForm(p => ({ ...p, data_recebimento: e.target.value }))} className="mt-1" />
            </div>
          )}
          {tipo === 'despesa' && (
            <>
              <div>
                <label className="text-sm font-medium text-slate-700">Data de Vencimento</label>
                <Input type="date" value={form.data_vencimento} onChange={e => setForm(p => ({ ...p, data_vencimento: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Data de Pagamento</label>
                <Input type="date" value={form.data_pagamento} onChange={e => setForm(p => ({ ...p, data_pagamento: e.target.value }))} className="mt-1" />
              </div>
            </>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700">Observação</label>
            <Input value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando} className={tipo === 'receita' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}>
            {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {editando ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
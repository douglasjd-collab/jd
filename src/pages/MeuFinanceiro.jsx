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
import { Loader2, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle, Upload, X, Calendar, Building2, CreditCard, Hash, Key, MoreVertical, Eye } from 'lucide-react';
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
          <TabsTrigger value="contas">Contas</TabsTrigger>
          </TabsList>
        <TabsContent value="dashboard"><DashboardTab user={user} /></TabsContent>
        <TabsContent value="receitas"><ReceitasTab user={user} /></TabsContent>
        <TabsContent value="despesas"><DespesasTab user={user} /></TabsContent>
        <TabsContent value="contas"><ContasTab user={user} /></TabsContent>
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

// ─── Contas Bancárias ─────────────────────────────────────
const BANCOS_CONFIG = {
  'Itaú': { bg: 'bg-orange-500', text: 'text-white', abbr: 'IT' },
  'Nubank': { bg: 'bg-purple-600', text: 'text-white', abbr: 'NU' },
  'Bradesco': { bg: 'bg-red-600', text: 'text-white', abbr: 'BD' },
  'Santander': { bg: 'bg-red-700', text: 'text-white', abbr: 'SN' },
  'Banco do Brasil': { bg: 'bg-yellow-500', text: 'text-white', abbr: 'BB' },
  'Caixa Econômica Federal': { bg: 'bg-blue-600', text: 'text-white', abbr: 'CE' },
  'Inter': { bg: 'bg-orange-600', text: 'text-white', abbr: 'IN' },
  'C6 Bank': { bg: 'bg-slate-800', text: 'text-white', abbr: 'C6' },
  'Sicoob': { bg: 'bg-green-700', text: 'text-white', abbr: 'SC' },
  'BTG Pactual': { bg: 'bg-blue-800', text: 'text-white', abbr: 'BT' },
  'PicPay': { bg: 'bg-green-500', text: 'text-white', abbr: 'PP' },
  'Mercado Pago': { bg: 'bg-blue-500', text: 'text-white', abbr: 'MP' },
  'Carteira/Dinheiro': { bg: 'bg-green-600', text: 'text-white', abbr: '💵' },
  'Outro': { bg: 'bg-slate-500', text: 'text-white', abbr: 'OT' },
};
const BANCOS_COMUNS = Object.keys(BANCOS_CONFIG);

function BancoAvatar({ banco, logoUrl = '', size = 'md' }) {
  const cfg = BANCOS_CONFIG[banco] || { bg: 'bg-slate-400', text: 'text-white', abbr: (banco || '?').substring(0, 2).toUpperCase() };
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
  if (logoUrl) {
    return <div className={`${sz} rounded-xl border border-slate-200 bg-white flex-shrink-0 overflow-hidden`}><img src={logoUrl} alt={banco} className="w-full h-full object-cover" /></div>;
  }
  return <div className={`${cfg.bg} ${cfg.text} ${sz} rounded-xl flex items-center justify-center font-bold flex-shrink-0`}>{cfg.abbr}</div>;
}

function ContasTab({ user }) {
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.MeuFinanceiroContaBancaria.filter({ usuario_id: user.auth_id, empresa_id: user.empresa_id }, 'nome_conta', 50);
      setContas(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar]);

  const contasAtivas = contas.filter(c => c.status === 'ativa');
  const saldoTotal = contasAtivas.reduce((s, c) => s + (c.saldo_atual || 0), 0);

  const toggleStatus = async (conta) => {
    const novoStatus = conta.status === 'ativa' ? 'inativa' : 'ativa';
    await base44.entities.MeuFinanceiroContaBancaria.update(conta.id, { status: novoStatus });
    toast.success(`Conta ${novoStatus === 'ativa' ? 'ativada' : 'desativada'}!`);
    carregar();
  };

  const excluir = async (id) => {
    if (!confirm('Excluir esta conta bancária?')) return;
    try { await base44.entities.MeuFinanceiroContaBancaria.delete(id); toast.success('Conta excluída'); carregar(); } catch (e) { toast.error('Erro ao excluir'); }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3 text-sm">
          <span className="text-slate-600">Saldo Total: <strong className="text-slate-800">{fmtMoeda(saldoTotal)}</strong></span>
          <span className="text-slate-400">{contasAtivas.length} conta{contasAtivas.length !== 1 ? 's' : ''} ativa{contasAtivas.length !== 1 ? 's' : ''}</span>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { setEditando(null); setModalOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Nova Conta</Button>
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : contas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>Nenhuma conta bancária cadastrada.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditando(null); setModalOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Cadastrar primeira conta</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contas.map(conta => (
            <Card key={conta.id} className={`border border-slate-200 hover:shadow-md transition-shadow ${conta.status === 'inativa' ? 'opacity-60' : ''}`}>
              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${conta.status === 'ativa' ? 'bg-green-500' : 'bg-slate-300'}`} />
              <CardContent className="p-4 pl-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BancoAvatar banco={conta.banco} logoUrl={conta.logo_url} size="md" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm leading-tight truncate">{conta.nome_conta}</p>
                      <p className="text-xs text-slate-400 truncate">{conta.banco}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge className={conta.status === 'ativa' ? 'bg-green-100 text-green-700 border-0' : 'bg-slate-100 text-slate-500 border-0'}>
                      {conta.status === 'ativa' ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <button onClick={() => { setEditando(conta); setModalOpen(true); }} className="p-1 rounded hover:bg-slate-100"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
                    <button onClick={() => excluir(conta.id)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-500 mb-3">
                  {conta.tipo_conta && <div className="flex items-center gap-1.5"><CreditCard className="w-3 h-3 shrink-0" /><span>{conta.tipo_conta}</span></div>}
                  {conta.agencia && <div className="flex items-center gap-1.5"><Hash className="w-3 h-3 shrink-0" /><span>Agência: {conta.agencia}</span></div>}
                  {conta.conta && <div className="flex items-center gap-1.5"><Hash className="w-3 h-3 shrink-0" /><span>Conta: {conta.conta}</span></div>}
                  {conta.chave_pix && <div className="flex items-center gap-1.5"><Key className="w-3 h-3 shrink-0" /><span className="truncate">PIX: {conta.chave_pix}</span></div>}
                </div>

                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Saldo Atual</p>
                  <p className={`text-2xl font-bold ${(conta.saldo_atual || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtMoeda(conta.saldo_atual)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ContaBancariaModal open={modalOpen} onClose={() => setModalOpen(false)} conta={editando} user={user} onSaved={carregar} />
    </div>
  );
}

function ContaBancariaModal({ open, onClose, conta, user, onSaved }) {
  const [form, setForm] = useState({ nome_conta: '', banco: '', tipo_conta: 'Conta Corrente', agencia: '', conta: '', chave_pix: '', saldo_inicial: '0', status: 'ativa', observacoes: '', logo_url: '' });
  const [salvando, setSalvando] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const editando = !!conta;

  useEffect(() => {
    if (conta) {
      setForm({
        nome_conta: conta.nome_conta || '', banco: conta.banco || '', tipo_conta: conta.tipo_conta || 'Conta Corrente',
        agencia: conta.agencia || '', conta: conta.conta || '', chave_pix: conta.chave_pix || '',
        saldo_inicial: String(conta.saldo_inicial ?? 0), status: conta.status || 'ativa',
        observacoes: conta.observacoes || '', logo_url: conta.logo_url || '',
      });
    } else {
      setForm({ nome_conta: '', banco: '', tipo_conta: 'Conta Corrente', agencia: '', conta: '', chave_pix: '', saldo_inicial: '0', status: 'ativa', observacoes: '', logo_url: '' });
    }
  }, [conta, open]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, logo_url: file_url }));
    setUploadingLogo(false);
    e.target.value = '';
  };

  const salvar = async () => {
    if (!form.nome_conta || !form.banco) return toast.error('Preencha nome e banco');
    setSalvando(true);
    const saldoInicial = parseFloat(form.saldo_inicial) || 0;
    const payload = {
      empresa_id: user.empresa_id, usuario_id: user.auth_id, usuario_nome: user.nome_perfil || user.full_name,
      nome_conta: form.nome_conta, banco: form.banco, tipo_conta: form.tipo_conta,
      agencia: form.agencia, conta: form.conta, chave_pix: form.chave_pix,
      saldo_inicial: saldoInicial,
      saldo_atual: editando ? conta.saldo_atual : saldoInicial,
      status: form.status, observacoes: form.observacoes, logo_url: form.logo_url || '',
    };
    if (editando) await base44.entities.MeuFinanceiroContaBancaria.update(conta.id, payload);
    else await base44.entities.MeuFinanceiroContaBancaria.create(payload);
    toast.success(editando ? 'Conta atualizada!' : 'Conta criada!');
    setSalvando(false); onClose(); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editando ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Logo do Banco (opcional)</label>
            <div className="mt-1 flex items-center gap-3">
              {form.logo_url ? <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white flex-shrink-0 overflow-hidden"><img src={form.logo_url} alt="logo" className="w-full h-full object-cover" /></div>
                : <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0"><Building2 className="w-7 h-7" /></div>}
              <div>
                <label className="cursor-pointer"><span className="inline-block text-xs px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600">{uploadingLogo ? 'Enviando...' : 'Escolher imagem'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                </label>
                {form.logo_url && <button className="ml-2 text-xs text-red-500 hover:underline" onClick={() => setForm(f => ({ ...f, logo_url: '' }))}>Remover</button>}
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Nome da Conta *</label>
            <Input className="mt-1" placeholder="Ex: Minha Conta Principal" value={form.nome_conta} onChange={e => setForm(f => ({ ...f, nome_conta: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Banco *</label>
              <Select value={form.banco} onValueChange={v => setForm(f => ({ ...f, banco: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{BANCOS_COMUNS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Tipo de Conta</label>
              <Select value={form.tipo_conta} onValueChange={v => setForm(f => ({ ...f, tipo_conta: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{['Conta Corrente', 'Conta Poupança', 'Conta Salário', 'Conta de Pagamento', 'Carteira/Dinheiro'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-slate-700">Agência</label><Input className="mt-1" placeholder="0000" value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Conta</label><Input className="mt-1" placeholder="00000-0" value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} /></div>
          </div>
          <div><label className="text-sm font-medium text-slate-700">Chave PIX</label><Input className="mt-1" placeholder="CPF, e-mail, telefone ou chave aleatória" value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} /></div>
          {!editando && (
            <div><label className="text-sm font-medium text-slate-700">Saldo Inicial (R$)</label><Input className="mt-1" type="number" step="0.01" placeholder="0,00" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} /><p className="text-xs text-slate-400 mt-1">Saldo atual da conta no momento do cadastro</p></div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ativa">Ativa</SelectItem><SelectItem value="inativa">Inativa</SelectItem></SelectContent>
            </Select>
          </div>
          <div><label className="text-sm font-medium text-slate-700">Observações</label><Input className="mt-1" placeholder="Opcional" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">{salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar Conta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
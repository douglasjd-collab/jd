import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Eye, TrendingUp, Search, LayoutGrid, List, MoreVertical, Building2, Hash, Key, CreditCard, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

// ─── Configuração de bancos ───────────────────────────────────────────────────
const BANCOS_CONFIG = {
  'Itaú':                   { bg: 'bg-orange-500', text: 'text-white', abbr: 'IT' },
  'Nubank':                 { bg: 'bg-purple-600', text: 'text-white', abbr: 'NU' },
  'Bradesco':               { bg: 'bg-red-600',    text: 'text-white', abbr: 'BD' },
  'Santander':              { bg: 'bg-red-700',    text: 'text-white', abbr: 'SN' },
  'Banco do Brasil':        { bg: 'bg-yellow-500', text: 'text-white', abbr: 'BB' },
  'Caixa Econômica Federal':{ bg: 'bg-blue-600',   text: 'text-white', abbr: 'CE' },
  'Inter':                  { bg: 'bg-orange-600', text: 'text-white', abbr: 'IN' },
  'C6 Bank':                { bg: 'bg-slate-800',  text: 'text-white', abbr: 'C6' },
  'Sicoob':                 { bg: 'bg-green-700',  text: 'text-white', abbr: 'SC' },
  'BTG Pactual':            { bg: 'bg-blue-800',   text: 'text-white', abbr: 'BT' },
  'PicPay':                 { bg: 'bg-green-500',  text: 'text-white', abbr: 'PP' },
  'Mercado Pago':           { bg: 'bg-blue-500',   text: 'text-white', abbr: 'MP' },
  'Carteira/Dinheiro':      { bg: 'bg-green-600',  text: 'text-white', abbr: '💵' },
  'Outro':                  { bg: 'bg-slate-500',  text: 'text-white', abbr: 'OT' },
};

const BANCO_TAG_COR = {
  'Itaú': 'bg-orange-100 text-orange-700',
  'Nubank': 'bg-purple-100 text-purple-700',
  'Bradesco': 'bg-red-100 text-red-700',
  'Santander': 'bg-red-100 text-red-900',
  'Banco do Brasil': 'bg-yellow-100 text-yellow-800',
  'Caixa Econômica Federal': 'bg-blue-100 text-blue-800',
  'Inter': 'bg-orange-100 text-orange-900',
  'C6 Bank': 'bg-slate-100 text-slate-800',
  'Sicoob': 'bg-green-100 text-green-800',
  'BTG Pactual': 'bg-blue-100 text-blue-900',
  'Carteira/Dinheiro': 'bg-green-100 text-green-700',
};

const BANCOS_COMUNS = Object.keys(BANCOS_CONFIG);

function BancoAvatar({ banco, logoUrl = '', size = 'md' }) {
  const cfg = BANCOS_CONFIG[banco] || { bg: 'bg-slate-400', text: 'text-white', abbr: (banco || '?').substring(0, 2).toUpperCase() };
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
  if (logoUrl) {
    return (
      <div className={`${sz} rounded-xl border border-slate-200 bg-white flex items-center justify-center flex-shrink-0 overflow-hidden p-0.5`}>
        <img src={logoUrl} alt={banco} className="w-full h-full object-contain" />
      </div>
    );
  }
  return (
    <div className={`${cfg.bg} ${cfg.text} ${sz} rounded-xl flex items-center justify-center font-bold flex-shrink-0`}>
      {cfg.abbr}
    </div>
  );
}

function SparkLine({ data, color = '#22c55e' }) {
  if (!data || data.length === 0) return <div className="h-10 flex items-center text-xs text-slate-300">Sem dados</div>;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} dot={false} strokeWidth={1.5} />
        <Tooltip
          contentStyle={{ fontSize: 10, padding: '2px 6px' }}
          formatter={(v) => [`R$ ${Number(v).toLocaleString('pt-BR')}`, '']}
          labelFormatter={() => ''}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

const emptyForm = {
  nome_conta: '', banco: '', tipo_conta: 'Conta Corrente',
  agencia: '', conta: '', chave_pix: '', saldo_inicial: '0',
  status: 'ativa', observacoes: '', logo_url: '',
};

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Gera dados de sparkline fake baseados no saldo (apenas visual, sem histórico real)
function gerarSparkline(saldo) {
  const base = Math.abs(saldo || 1000);
  return Array.from({ length: 7 }, (_, i) => ({
    d: i,
    v: Math.max(0, base * (0.7 + Math.random() * 0.6)),
  }));
}

export default function ContasBancarias() {
  const [user, setUser] = useState(null);
  const [contas, setContas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [receitas, setReceitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConta, setEditingConta] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('ativa');
  const [viewMode, setViewMode] = useState('grid');
  const [menuAberto, setMenuAberto] = useState(null);

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      let perfil = me.perfil;
      let empresa_id = me.empresa_id;
      if (!perfil) {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) { perfil = colabs[0].perfil; empresa_id = colabs[0].empresa_id; }
      }
      const u = { ...me, perfil, empresa_id };
      setUser(u);
      carregar(u);
    });
  }, []);

  const carregar = async (u) => {
    setLoading(true);
    const filtro = u?.empresa_id ? { empresa_id: u.empresa_id } : {};
    const [data, desp, rec] = await Promise.all([
      base44.entities.ContaBancaria.filter(filtro, 'nome_conta', 200),
      base44.entities.Despesa.filter(filtro, null, 2000),
      base44.entities.Receita.filter(filtro, null, 2000),
    ]);
    setContas(data);
    setDespesas(desp);
    setReceitas(rec);
    setLoading(false);
  };

  const abrirNova = () => { setEditingConta(null); setForm(emptyForm); setModalOpen(true); };

  const abrirEditar = (conta) => {
    setEditingConta(conta);
    setForm({
      nome_conta: conta.nome_conta || '', banco: conta.banco || '',
      tipo_conta: conta.tipo_conta || 'Conta Corrente', agencia: conta.agencia || '',
      conta: conta.conta || '', chave_pix: conta.chave_pix || '',
      saldo_inicial: String(conta.saldo_inicial ?? 0),
      status: conta.status || 'ativa', observacoes: conta.observacoes || '',
      logo_url: conta.logo_url || '',
    });
    setModalOpen(true);
    setMenuAberto(null);
  };

  const salvar = async () => {
    if (!form.nome_conta || !form.banco) return toast.error('Preencha nome e banco');
    setSaving(true);
    const saldoInicial = parseFloat(form.saldo_inicial) || 0;
    const payload = {
      empresa_id: user?.empresa_id,
      nome_conta: form.nome_conta, banco: form.banco, tipo_conta: form.tipo_conta,
      agencia: form.agencia, conta: form.conta, chave_pix: form.chave_pix,
      saldo_inicial: saldoInicial,
      saldo_atual: editingConta ? editingConta.saldo_atual : saldoInicial,
      status: form.status, observacoes: form.observacoes,
      logo_url: form.logo_url || '',
    };
    if (editingConta) {
      await base44.entities.ContaBancaria.update(editingConta.id, payload);
      toast.success('Conta atualizada!');
    } else {
      await base44.entities.ContaBancaria.create(payload);
      toast.success('Conta criada!');
    }
    setSaving(false); setModalOpen(false); carregar(user);
  };

  const toggleStatus = async (conta) => {
    const novoStatus = conta.status === 'ativa' ? 'inativa' : 'ativa';
    await base44.entities.ContaBancaria.update(conta.id, { status: novoStatus });
    toast.success(`Conta ${novoStatus === 'ativa' ? 'ativada' : 'desativada'}!`);
    setMenuAberto(null);
    carregar(user);
  };

  const isAdmin = ['master', 'super_admin', 'admin'].includes(user?.perfil);

  const contasAtivas = contas.filter(c => c.status === 'ativa');
  const saldoTotal = contasAtivas.reduce((s, c) => s + (c.saldo_atual || 0), 0);

  // Resumo por banco (para o topo)
  const bancoResumo = contasAtivas.reduce((acc, c) => {
    if (!acc[c.banco]) acc[c.banco] = { banco: c.banco, total: 0, qtd: 0 };
    acc[c.banco].total += c.saldo_atual || 0;
    acc[c.banco].qtd += 1;
    return acc;
  }, {});

  const contasFiltradas = contas.filter(c => {
    const matchStatus = filtroStatus === 'todas' ? true : c.status === filtroStatus;
    const matchSearch = !search || c.nome_conta?.toLowerCase().includes(search.toLowerCase()) || c.banco?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6" onClick={() => setMenuAberto(null)}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-6 h-6 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-800">Contas Bancárias</h1>
          </div>
          <p className="text-slate-500 text-sm">Gerencie todas as contas bancárias da empresa e acompanhe os saldos em tempo real.</p>
        </div>
        {isAdmin && (
          <Button onClick={abrirNova} className="bg-blue-600 hover:bg-blue-700 gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Nova Conta Bancária
          </Button>
        )}
      </div>

      {/* ── Resumo top ─────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Card saldo total */}
          <Card className="col-span-1 bg-white border border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 leading-tight">Saldo Total em Contas</p>
                <Eye className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-2xl font-bold text-slate-800">{fmt(saldoTotal)}</p>
              <p className="text-xs text-slate-400 mt-1">Soma de todas as contas ativas</p>
            </CardContent>
          </Card>

          {/* Card por banco */}
          {Object.values(bancoResumo).map(({ banco, total, qtd }) => {
            const cfg = BANCOS_CONFIG[banco] || { bg: 'bg-slate-400', text: 'text-white', abbr: banco?.substring(0, 2) };
            return (
              <Card key={banco} className="bg-white border border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BancoAvatar banco={banco} size="sm" />
                      <div>
                        <p className="text-sm font-semibold text-slate-700 leading-tight">{banco}</p>
                        <p className="text-xs text-slate-400">{qtd} conta{qtd > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-xl font-bold text-slate-800">{fmt(total)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">Todas as Contas</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-9 h-9 w-52"
              placeholder="Buscar conta..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Todas (Ativas)</SelectItem>
              <SelectItem value="inativa">Inativas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'}`}
            >
              <LayoutGrid className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'}`}
            >
              <List className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Lista de contas ────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : contasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CreditCard className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 mb-4">Nenhuma conta encontrada</p>
            {isAdmin && (
              <Button onClick={abrirNova} className="bg-blue-600 hover:bg-blue-700 gap-2">
                <Plus className="w-4 h-4" /> Cadastrar primeira conta
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {contasFiltradas.map(conta => (
            <ContaCard
              key={conta.id}
              conta={conta}
              isAdmin={isAdmin}
              menuAberto={menuAberto}
              setMenuAberto={setMenuAberto}
              onEditar={abrirEditar}
              onToggleStatus={toggleStatus}
              despesas={despesas}
              receitas={receitas}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {contasFiltradas.map(conta => (
            <ContaRow
              key={conta.id}
              conta={conta}
              isAdmin={isAdmin}
              onEditar={abrirEditar}
              onToggleStatus={toggleStatus}
            />
          ))}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────── */}
      <ContaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        setForm={setForm}
        editingConta={editingConta}
        onSalvar={salvar}
        saving={saving}
      />
    </div>
  );
}

// ─── ContaCard ────────────────────────────────────────────────────────────────
function ContaCard({ conta, isAdmin, menuAberto, setMenuAberto, onEditar, onToggleStatus, despesas = [], receitas = [] }) {
  const spark = gerarSparkline(conta.saldo_atual);
  const tagCor = BANCO_TAG_COR[conta.banco] || 'bg-slate-100 text-slate-600';
  const nomeEmpresa = conta.nome_conta?.split(' ').slice(-2).join(' ') || '';

  // Entradas e saídas do mês atual para esta conta
  const mesAtual = new Date().toISOString().slice(0, 7); // "2026-04"
  const entradasMes = receitas
    .filter(r => r.conta_bancaria_id === conta.id && r.status === 'recebida' && (r.data || '').startsWith(mesAtual))
    .reduce((s, r) => s + (r.valor || 0), 0);
  const saidasMes = despesas
    .filter(d => d.conta_bancaria_id === conta.id && ['pago','paga'].includes(d.status) && (d.data || '').startsWith(mesAtual))
    .reduce((s, d) => s + (d.valor || 0), 0);

  return (
    <Card className={`relative overflow-visible border border-slate-200 hover:shadow-md transition-shadow ${conta.status === 'inativa' ? 'opacity-60' : ''}`}>
      {/* Borda esquerda colorida */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${conta.status === 'ativa' ? 'bg-green-500' : 'bg-slate-300'}`} />

      <CardContent className="p-4 pl-5">
        {/* Topo */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <BancoAvatar banco={conta.banco} logoUrl={conta.logo_url} size="md" />
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-sm leading-tight truncate">{conta.nome_conta}</p>
              <p className="text-xs text-slate-400 truncate">{nomeEmpresa || conta.banco}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge className={conta.status === 'ativa' ? 'bg-green-100 text-green-700 border-0' : 'bg-slate-100 text-slate-500 border-0'}>
              {conta.status === 'ativa' ? 'Ativa' : 'Inativa'}
            </Badge>
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setMenuAberto(menuAberto === conta.id ? null : conta.id); }}
                  className="p-1 rounded hover:bg-slate-100"
                >
                  <MoreVertical className="w-4 h-4 text-slate-400" />
                </button>
                {menuAberto === conta.id && (
                  <div className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-36" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onEditar(conta)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button onClick={() => onToggleStatus(conta)} className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${conta.status === 'ativa' ? 'text-red-600' : 'text-green-600'}`}>
                      {conta.status === 'ativa' ? '⊘ Inativar' : '✓ Ativar'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tag banco */}
        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-3 ${tagCor}`}>{conta.banco}</span>

        {/* Dados bancários */}
        <div className="space-y-1 text-xs text-slate-500 mb-3">
          {conta.tipo_conta && (
            <div className="flex items-center gap-1.5">
              <CreditCard className="w-3 h-3 shrink-0" />
              <span>{conta.tipo_conta}</span>
            </div>
          )}
          {conta.agencia && (
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 shrink-0" />
              <span>Agência: {conta.agencia}</span>
            </div>
          )}
          {conta.conta && (
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 shrink-0" />
              <span>Conta: {conta.conta}</span>
            </div>
          )}
          {conta.chave_pix && (
            <div className="flex items-center gap-1.5">
              <Key className="w-3 h-3 shrink-0" />
              <span className="truncate">PIX: {conta.chave_pix}</span>
            </div>
          )}
        </div>

        {/* Saldo */}
        <div className="bg-slate-50 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-500">Saldo Atual</p>
            <Eye className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className={`text-2xl font-bold ${(conta.saldo_atual || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(conta.saldo_atual)}
          </p>
        </div>

        {/* Entradas / Saídas do mês */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Entradas (mês)</p>
            <p className="text-sm font-semibold text-green-600">{fmt(entradasMes)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Saídas (mês)</p>
            <p className="text-sm font-semibold text-red-500">{fmt(saidasMes)}</p>
          </div>
        </div>

        {/* Sparkline */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Últimos 7 dias</p>
          <SparkLine data={spark} color={(conta.saldo_atual || 0) >= 0 ? '#22c55e' : '#ef4444'} />
        </div>

        {/* Botões */}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm" variant="outline"
            className="flex-1 text-xs h-8 gap-1"
            onClick={() => window.location.href = `/Transacoes?conta_id=${conta.id}`}
          >
            <Eye className="w-3 h-3" /> Ver Movimentações
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1 px-3" onClick={() => onEditar(conta)}>
              <Pencil className="w-3 h-3" /> Editar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ContaRow (list view) ─────────────────────────────────────────────────────
function ContaRow({ conta, isAdmin, onEditar, onToggleStatus }) {
  return (
    <Card className="border border-slate-200">
      <CardContent className="p-3">
        <div className="flex items-center gap-4">
          <BancoAvatar banco={conta.banco} logoUrl={conta.logo_url} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-800 truncate">{conta.nome_conta}</p>
            <p className="text-xs text-slate-400">{conta.banco} · {conta.tipo_conta}</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`font-bold ${(conta.saldo_atual || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(conta.saldo_atual)}</p>
            <Badge className={`text-xs ${conta.status === 'ativa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'} border-0`}>
              {conta.status === 'ativa' ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
          {isAdmin && (
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => onEditar(conta)}>
                <Pencil className="w-3 h-3" /> Editar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ContaModal ───────────────────────────────────────────────────────────────
function ContaModal({ open, onOpenChange, form, setForm, editingConta, onSalvar, saving }) {
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, logo_url: file_url }));
    setUploadingLogo(false);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingConta ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Logo do banco */}
          <div>
            <Label>Logo do Banco (opcional)</Label>
            <div className="mt-1 flex items-center gap-3">
              {form.logo_url ? (
                <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white p-1 flex-shrink-0 overflow-hidden">
                  <img src={form.logo_url} alt="logo" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div>
                <label className="cursor-pointer">
                  <span className="inline-block text-xs px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600">
                    {uploadingLogo ? 'Enviando...' : 'Escolher imagem'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                </label>
                {form.logo_url && (
                  <button className="ml-2 text-xs text-red-500 hover:underline" onClick={() => setForm(f => ({ ...f, logo_url: '' }))}>
                    Remover
                  </button>
                )}
                <p className="text-xs text-slate-400 mt-1">Aparece no card da conta. PNG, JPG ou SVG.</p>
              </div>
            </div>
          </div>

          <div>
            <Label>Nome da Conta *</Label>
            <Input className="mt-1" placeholder="Ex: Conta Principal JD Promotora" value={form.nome_conta} onChange={e => setForm(f => ({ ...f, nome_conta: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Banco *</Label>
              <Select value={form.banco} onValueChange={v => setForm(f => ({ ...f, banco: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {BANCOS_COMUNS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Conta</Label>
              <Select value={form.tipo_conta} onValueChange={v => setForm(f => ({ ...f, tipo_conta: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Conta Corrente', 'Conta Poupança', 'Conta Salário', 'Conta de Pagamento', 'Carteira/Dinheiro'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Agência</Label>
              <Input className="mt-1" placeholder="0000" value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} />
            </div>
            <div>
              <Label>Conta</Label>
              <Input className="mt-1" placeholder="00000-0" value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Chave PIX</Label>
            <Input className="mt-1" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} />
          </div>
          {!editingConta && (
            <div>
              <Label>Saldo Inicial (R$)</Label>
              <Input className="mt-1" type="number" placeholder="0,00" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} />
              <p className="text-xs text-slate-400 mt-1">Saldo atual da conta no momento do cadastro</p>
            </div>
          )}
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <textarea className="w-full mt-1 border rounded-md p-2 text-sm min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSalvar} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? 'Salvando...' : (editingConta ? 'Salvar Alterações' : 'Criar Conta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
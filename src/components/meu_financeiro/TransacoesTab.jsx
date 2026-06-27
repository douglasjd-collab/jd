import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ArrowUpCircle, ArrowDownCircle, ChevronLeft, ChevronRight, Pencil, Trash2, Plus, Wallet, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import FormModalFinanceiro from '@/components/meu_financeiro/FormModalFinanceiro';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Ícone de categoria com cor dinâmica
function CatIcon({ tipo, categoria }) {
  const isReceita = tipo === 'receita';
  const colors = isReceita
    ? ['bg-green-500', 'bg-teal-500', 'bg-emerald-600', 'bg-cyan-600']
    : ['bg-red-500', 'bg-orange-500', 'bg-rose-600', 'bg-pink-600'];
  const idx = ((categoria || '').charCodeAt(0) || 0) % colors.length;
  const bg = colors[idx];
  const Icon = isReceita ? ArrowUpCircle : ArrowDownCircle;
  return (
    <div className={`relative flex-shrink-0`}>
      <div className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
    </div>
  );
}

// Status pill compacto
function StatusPill({ item }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const isAtrasado = item._tipo === 'despesa'
    && ['pendente', 'previsto'].includes(item.status)
    && (item.data_vencimento || item.data) < hoje;

  if (isAtrasado) return <span className="text-[10px] font-semibold text-red-400">⚠ Atrasado</span>;
  const map = {
    recebida: 'text-green-400', pago: 'text-green-400',
    pendente: 'text-amber-400', previsto: 'text-blue-400',
    cancelada: 'text-slate-400', cancelado: 'text-slate-400',
  };
  const labels = { recebida: '✓ Recebida', pago: '✓ Pago', pendente: '• Pendente', previsto: '• Previsto', cancelada: '✗ Cancelada', cancelado: '✗ Cancelado' };
  return <span className={`text-[10px] font-semibold ${map[item.status] || 'text-slate-400'}`}>{labels[item.status] || item.status}</span>;
}

function formatDayHeader(dateStr) {
  const d = parseISO(dateStr);
  const hoje = new Date();
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  if (dateStr === hoje.toISOString().slice(0, 10)) return 'Hoje';
  if (dateStr === ontem.toISOString().slice(0, 10)) return 'Ontem';
  return format(d, "EEEE, dd", { locale: ptBR });
}

export default function TransacoesTab({ user, refreshKey }) {
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos'); // todos | receita | despesa
  const [mesAtual, setMesAtual] = useState(new Date());
  const [modal, setModal] = useState({ open: false, item: null, tipo: 'receita' });
  const [novoModal, setNovoModal] = useState(false);
  const [novoTipo, setNovoTipo] = useState('despesa');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const filtro = { usuario_id: user.id, empresa_id: user.empresa_id };
      const [r, d] = await Promise.all([
        base44.entities.MeuFinanceiroReceita.filter(filtro, '-data', 2000),
        base44.entities.MeuFinanceiroDespesa.filter(filtro, '-data', 2000),
      ]);
      setReceitas(r); setDespesas(d);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const mesStr = format(mesAtual, 'yyyy-MM');
  const inicioMes = format(startOfMonth(mesAtual), 'yyyy-MM-dd');
  const fimMes = format(endOfMonth(mesAtual), 'yyyy-MM-dd');

  // Combinar e filtrar por mês
  const transacoesMes = useMemo(() => {
    const items = [
      ...receitas.map(r => ({ ...r, _tipo: 'receita' })),
      ...despesas.map(d => ({ ...d, _tipo: 'despesa' })),
    ].filter(t => {
      const data = t.data || '';
      return data >= inicioMes && data <= fimMes;
    });
    items.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    return items;
  }, [receitas, despesas, inicioMes, fimMes]);

  // Filtrar por busca e tipo
  const transacoesFiltradas = useMemo(() => {
    return transacoesMes.filter(t => {
      if (filtroTipo !== 'todos' && t._tipo !== filtroTipo) return false;
      if (search) {
        const s = search.toLowerCase();
        return (t.descricao || '').toLowerCase().includes(s) || (t.categoria || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [transacoesMes, filtroTipo, search]);

  // Agrupar por dia
  const porDia = useMemo(() => {
    const map = {};
    transacoesFiltradas.forEach(t => {
      const d = t.data || 'sem-data';
      if (!map[d]) map[d] = [];
      map[d].push(t);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [transacoesFiltradas]);

  // Saldo e balanço do mês
  const saldoTotal = useMemo(() => {
    const recRec = receitas.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
    const despPag = despesas.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
    return recRec - despPag;
  }, [receitas, despesas]);

  const balancoMes = useMemo(() => {
    const recMes = transacoesMes.filter(t => t._tipo === 'receita' && t.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
    const despMes = transacoesMes.filter(t => t._tipo === 'despesa' && t.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
    return recMes - despMes;
  }, [transacoesMes]);

  const excluir = async (item) => {
    if (!confirm(`Excluir esta ${item._tipo === 'receita' ? 'receita' : 'despesa'}?`)) return;
    try {
      await base44.entities[item._tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa'].delete(item.id);
      toast.success('Excluído!');
      carregar();
    } catch { toast.error('Erro ao excluir'); }
  };

  const alterarStatus = async (item) => {
    const entidade = item._tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
    let novoStatus;
    if (item._tipo === 'receita') {
      novoStatus = item.status === 'recebida' ? 'pendente' : 'recebida';
      await base44.entities[entidade].update(item.id, { status: novoStatus, data_recebimento: novoStatus === 'recebida' ? (item.data_recebimento || item.data) : null });
    } else {
      novoStatus = item.status === 'pago' ? 'pendente' : 'pago';
      await base44.entities[entidade].update(item.id, { status: novoStatus, data_pagamento: novoStatus === 'pago' ? (item.data_pagamento || item.data) : null });
    }
    toast.success('Status alterado!');
    carregar();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></div>;

  return (
    <div className="mt-2 space-y-0">

      {/* Navegação de mês */}
      <div className="flex items-center justify-between py-3 px-1">
        <button
          onClick={() => setMesAtual(m => subMonths(m, 1))}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold text-base text-slate-800 dark:text-slate-100 capitalize">
          {format(mesAtual, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <button
          onClick={() => setMesAtual(m => addMonths(m, 1))}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Cards de saldo */}
      <div className="grid grid-cols-2 gap-2 mb-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400">Saldo atual</span>
          </div>
          <p className={`text-sm font-bold ${saldoTotal >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmtMoeda(saldoTotal)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400">Balanço mensal</span>
          </div>
          <p className={`text-sm font-bold ${balancoMes >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmtMoeda(balancoMes)}</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative mt-3 mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <Input
          className="pl-9 h-8 text-sm rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>


      {/* Lista agrupada por dia */}
      {porDia.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <p className="font-medium">Nenhuma transação neste mês</p>
          <p className="text-xs mt-1">Use o botão + para adicionar</p>
        </div>
      ) : (
        <div className="space-y-5 pb-24">
          {porDia.map(([dia, items]) => (
            <div key={dia}>
              {/* Header do dia */}
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 capitalize mb-2 px-1">
                {dia !== 'sem-data' ? formatDayHeader(dia) : 'Sem data'}
              </p>
              {/* Itens do dia */}
              <div className="space-y-2">
                {items.map(t => (
                  <div
                    key={`${t._tipo}-${t.id}`}
                    className="bg-white dark:bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-2.5 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <CatIcon tipo={t._tipo} categoria={t.categoria} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">{t.descricao}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {[t.categoria, t.tipo_lancamento === 'recorrente' ? 'Fixa' : null].filter(Boolean).join(' | ') || 'Sem categoria'}
                      </p>
                      <StatusPill item={t} />
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <p className={`text-xs font-bold ${t._tipo === 'receita' ? 'text-green-500' : 'text-red-500'}`}>
                        {t._tipo === 'receita' ? '+' : '-'} {fmtMoeda(t.valor)}
                      </p>
                      <div className="flex items-center gap-1">
                        {((t._tipo === 'receita' && t.status !== 'recebida') || (t._tipo === 'despesa' && t.status !== 'pago')) && (
                          <button
                            onClick={() => alterarStatus(t)}
                            className="text-[10px] font-semibold text-green-500 hover:text-green-600 border border-green-300 rounded-full px-2 py-0.5"
                          >
                            {t._tipo === 'receita' ? 'Receber' : 'Pagar'}
                          </button>
                        )}
                        <button onClick={() => setModal({ open: true, item: t, tipo: t._tipo })} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => excluir(t)} className="p-1 text-slate-400 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB — botão fixo de adicionar */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 z-30">
        {novoModal && (
          <div className="flex flex-col gap-2 mb-1">
            <button
              onClick={() => { setNovoTipo('receita'); setNovoModal(false); setModal({ open: true, item: null, tipo: 'receita' }); }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-semibold"
            >
              <ArrowUpCircle className="w-4 h-4" /> Receita
            </button>
            <button
              onClick={() => { setNovoTipo('despesa'); setNovoModal(false); setModal({ open: true, item: null, tipo: 'despesa' }); }}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-semibold"
            >
              <ArrowDownCircle className="w-4 h-4" /> Despesa
            </button>
          </div>
        )}
        <button
          onClick={() => setNovoModal(v => !v)}
          className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-xl flex items-center justify-center transition-transform active:scale-95"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>

      {modal.open && (
        <FormModalFinanceiro
          open={modal.open}
          onClose={() => setModal({ open: false, item: null, tipo: 'receita' })}
          item={modal.item}
          tipo={modal.tipo}
          user={user}
          onSaved={() => { carregar(); setModal({ open: false, item: null, tipo: 'receita' }); }}
        />
      )}
    </div>
  );
}
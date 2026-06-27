import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ArrowUpCircle, ArrowDownCircle, ChevronLeft, ChevronRight, Plus, Wallet, Building2, MoreVertical, CheckCircle2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import FormModalFinanceiro from '@/components/meu_financeiro/FormModalFinanceiro';
import ReceberPagarModal from '@/components/meu_financeiro/ReceberPagarModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
    <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
      <Icon className="w-4 h-4 text-white" />
    </div>
  );
}

export default function TransacoesTab({ user, refreshKey }) {
  const isMobile = useIsMobile();
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mesAtual, setMesAtual] = useState(new Date());
  const [modal, setModal] = useState({ open: false, item: null, tipo: 'receita' });
  const [menuAberto, setMenuAberto] = useState(false);
  const [receberPagarModal, setReceberPagarModal] = useState({ open: false, item: null, tipo: 'receita' });

  // Handler para abrir modal de nova transação
  const abrirNovaTransacao = (tipo) => {
    setMenuAberto(false);
    setModal({ open: true, item: null, tipo });
  };

  // Handler para abrir modal de receber/pagar
  const abrirReceberPagar = (item) => {
    setReceberPagarModal({ open: true, item, tipo: item._tipo });
  };

  const confirmarPagamento = async () => {
    const item = receberPagarModal.item;
    if (!item) return;
    // A confirmação é feita dentro do próprio modal
  };

  const abrirConfirmacao = (item) => {
    setReceberPagarModal({ open: true, item, tipo: item._tipo });
  };

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
    items.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    return items;
  }, [receitas, despesas, inicioMes, fimMes]);

  // Filtrar por busca
  const transacoesFiltradas = useMemo(() => {
    return transacoesMes.filter(t => {
      if (search) {
        const s = search.toLowerCase();
        return (t.descricao || '').toLowerCase().includes(s) || (t.categoria || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [transacoesMes, search]);

  // KPIs do mês
  const saldoAtual = useMemo(() => {
    const recRec = receitas.filter(r => r.status === 'recebida').reduce((s, r) => s + (r.valor || 0), 0);
    const despPag = despesas.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valor || 0), 0);
    return recRec - despPag;
  }, [receitas, despesas]);

  const totalReceitas = useMemo(() => {
    return transacoesMes.filter(t => t._tipo === 'receita').reduce((s, r) => s + (r.valor || 0), 0);
  }, [transacoesMes]);

  const totalDespesas = useMemo(() => {
    return transacoesMes.filter(t => t._tipo === 'despesa').reduce((s, d) => s + (d.valor || 0), 0);
  }, [transacoesMes]);

  const balancoMensal = totalReceitas - totalDespesas;

  const excluir = async (item) => {
    if (!confirm(`Excluir esta ${item._tipo === 'receita' ? 'receita' : 'despesa'}?`)) return;
    try {
      await base44.entities[item._tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa'].delete(item.id);
      toast.success('Excluído!');
      carregar();
    } catch { toast.error('Erro ao excluir'); }
  };

  const abrirEfetivacao = (item) => {
    // Clique na linha SEMPRE abre modal de efetivação
    setReceberPagarModal({ open: true, item, tipo: item._tipo });
  };



  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></div>;

  const mesLabel = format(mesAtual, 'MMMM yyyy', { locale: ptBR });
  const mesLabelCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  // Componente de transação mobile
  const TransacaoMobile = ({ t }) => {
    const isReceita = t._tipo === 'receita';
    const statusBadge = isReceita 
      ? { bg: 'bg-green-100', text: 'text-green-700', label: 'Recebida' }
      : { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pendente' };
    
    return (
      <div 
        className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 cursor-pointer active:bg-slate-50"
        onClick={() => abrirEfetivacao(t)}
      >
        <div className="flex items-center gap-3">
          {/* Ícone */}
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
              <ArrowUpCircle className={`w-3.5 h-3.5 ${isReceita ? 'text-green-500' : 'text-red-500'}`} />
            </div>
          </div>
          
          {/* Informações */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-semibold text-slate-800 truncate">
                {t.descricao?.length > 20 ? t.descricao.substring(0, 20) + '...' : t.descricao}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {t.categoria || 'Sem categoria'} · {t.data ? format(parseISO(t.data), 'dd/MM/yy') : '-'}
            </p>
            <div className="mt-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                {statusBadge.label}
              </span>
            </div>
          </div>
          
          {/* Valor */}
          <div className="text-right flex-shrink-0">
            <p className={`font-bold text-sm ${isReceita ? 'text-green-600' : 'text-red-600'}`}>
              {isReceita ? '+' : '-'} {fmtMoeda(t.valor)}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Header - versão mobile */}
      {isMobile ? (
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMesAtual(m => subMonths(m, 1))} className="p-1 hover:bg-slate-200 rounded-full">
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <span className="font-semibold text-slate-700">{mesLabelCapitalizado}</span>
            <button onClick={() => setMesAtual(m => addMonths(m, 1))} className="p-1 hover:bg-slate-200 rounded-full">
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 bg-green-50 rounded-full px-3 py-2 text-center">
              <p className="text-xs text-green-700 font-medium">Recebido: {fmtMoeda(totalReceitas)}</p>
            </div>
            <div className="flex-1 bg-amber-50 rounded-full px-3 py-2 text-center">
              <p className="text-xs text-amber-700 font-medium">Pendente: {fmtMoeda(totalDespesas)}</p>
            </div>
          </div>
        </div>
      ) : (
        /* Header - versão desktop */
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Transações</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{mesLabelCapitalizado}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setMesAtual(m => subMonths(m, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{mesLabelCapitalizado}</span>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setMesAtual(m => addMonths(m, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Cards KPI em linha */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-white border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Saldo atual</p>
                <p className={`text-lg font-bold ${saldoAtual >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtMoeda(saldoAtual)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <ArrowUpCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receitas</p>
                <p className="text-lg font-bold text-green-600">{fmtMoeda(totalReceitas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Despesas</p>
                <p className="text-lg font-bold text-red-600">{fmtMoeda(totalDespesas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Balanço mensal</p>
                <p className={`text-lg font-bold ${balancoMensal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{fmtMoeda(balancoMensal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de busca - apenas desktop */}
      {!isMobile && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9 h-10 rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            placeholder="Buscar transações..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Lista de transações */}
      {isMobile ? (
        /* Versão mobile - cards */
        <div className="space-y-3">
          {transacoesFiltradas.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              Nenhuma transação neste mês
            </div>
          ) : (
            transacoesFiltradas.map(t => (
              <TransacaoMobile key={`${t._tipo}-${t.id}`} t={t} />
            ))
          )}
        </div>
      ) : (
        /* Versão desktop - tabela */
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-10">Situação</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Conta</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center w-16">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {transacoesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                      Nenhuma transação neste mês
                    </td>
                  </tr>
                ) : (
                  transacoesFiltradas.map(t => {
                    const hoje = new Date().toISOString().slice(0, 10);
                    const dataRef = t.data_vencimento || t.data;
                    const atrasada = t._tipo === 'despesa' && ['pendente', 'previsto'].includes(t.status) && dataRef && dataRef < hoje;
                    
                    return (
                      <tr 
                        key={`${t._tipo}-${t.id}`} 
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                        onClick={() => abrirEfetivacao(t)}
                      >
                        <td className="px-4 py-3">
                          {atrasada ? (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Atrasado</Badge>
                          ) : t.status === 'pago' || t.status === 'recebida' ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                              <ArrowUpCircle className="w-3 h-3 mr-1" />
                              {t._tipo === 'receita' ? 'Recebida' : 'Pago'}
                            </Badge>
                          ) : t.status === 'cancelado' || t.status === 'cancelada' ? (
                            <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">Cancelado</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pendente</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {dataRef ? format(parseISO(dataRef), 'dd/MM/yyyy') : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <CatIcon tipo={t._tipo} categoria={t.categoria} />
                            <span className="font-medium text-sm text-slate-800 dark:text-slate-100">{t.descricao}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {t.categoria || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {t.conta_bancaria_id ? 'Conta vinculada' : '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold text-sm ${t._tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                          {t._tipo === 'receita' ? '+' : '-'} {fmtMoeda(t.valor)}
                        </td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => { setModal({ open: true, item: t, tipo: t._tipo }); }}>Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => excluir(t)} className="text-red-600">Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Botões de Receita e Despesa (aparecem quando menuAberto está true) */}
      {menuAberto && (
        <div className="fixed bottom-24 right-6 z-50 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4">
          {/* Botão Receita (Verde) */}
          <Button
            className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 shadow-lg"
            onClick={() => abrirNovaTransacao('receita')}
          >
            <Plus className="w-7 h-7" />
          </Button>
          {/* Botão Despesa (Vermelho) */}
          <Button
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 shadow-lg"
            onClick={() => abrirNovaTransacao('despesa')}
          >
            <Plus className="w-7 h-7" />
          </Button>
        </div>
      )}

      {/* FAB Principal (Roxo) */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 shadow-xl"
          onClick={() => setMenuAberto(!menuAberto)}
        >
          <Plus className={`w-7 h-7 transition-transform ${menuAberto ? 'rotate-45' : ''}`} />
        </Button>
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

      {receberPagarModal.open && (
        <ReceberPagarModal
          open={receberPagarModal.open}
          onClose={() => setReceberPagarModal({ open: false, item: null, tipo: 'receita' })}
          item={receberPagarModal.item}
          tipo={receberPagarModal.tipo}
          user={user}
          onConfirmar={() => { carregar(); setReceberPagarModal({ open: false, item: null, tipo: 'receita' }); }}
        />
      )}
    </div>
  );
}
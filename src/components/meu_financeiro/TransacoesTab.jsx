import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, ArrowUpCircle, ArrowDownCircle, MoreVertical, Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import FormModalFinanceiro from '@/components/meu_financeiro/FormModalFinanceiro';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function TransacoesTab({ user, refreshKey }) {
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modal, setModal] = useState({ open: false, item: null, tipo: 'receita' });
  const [menuAberto, setMenuAberto] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const filtro = { usuario_id: user.auth_id, empresa_id: user.empresa_id };
      const [r, d] = await Promise.all([
        base44.entities.MeuFinanceiroReceita.filter(filtro, '-data', 2000),
        base44.entities.MeuFinanceiroDespesa.filter(filtro, '-data', 2000),
      ]);
      setReceitas(r); setDespesas(d);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  // Combinar receitas e despesas em uma lista unificada
  const transacoes = useMemo(() => {
    const items = [
      ...receitas.map(r => ({ ...r, _tipo: 'receita' })),
      ...despesas.map(d => ({ ...d, _tipo: 'despesa' })),
    ];
    // Ordenar por data decrescente
    items.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    return items;
  }, [receitas, despesas]);

  const transacoesFiltradas = useMemo(() => {
    return transacoes.filter(t => {
      if (filtroTipo !== 'todos' && t._tipo !== filtroTipo) return false;
      if (filtroStatus !== 'todos' && t.status !== filtroStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          (t.descricao || '').toLowerCase().includes(s) ||
          (t.categoria || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [transacoes, filtroTipo, filtroStatus, search]);

  const excluir = async (item) => {
    if (!confirm(`Excluir esta ${item._tipo === 'receita' ? 'receita' : 'despesa'}?`)) return;
    try {
      const entidade = item._tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
      await base44.entities[entidade].delete(item.id);
      toast.success('Excluído!');
      carregar();
    } catch (e) { toast.error('Erro ao excluir'); }
    setMenuAberto(null);
  };

  const alterarStatus = async (item) => {
    const entidade = item._tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
    let novoStatus;
    if (item._tipo === 'receita') {
      novoStatus = item.status === 'recebida' ? 'pendente' : 'recebida';
      await base44.entities[entidade].update(item.id, {
        status: novoStatus,
        data_recebimento: novoStatus === 'recebida' ? (item.data_recebimento || item.data) : null,
      });
    } else {
      novoStatus = item.status === 'pago' ? 'pendente' : 'pago';
      await base44.entities[entidade].update(item.id, {
        status: novoStatus,
        data_pagamento: novoStatus === 'pago' ? (item.data_pagamento || item.data) : null,
      });
    }
    toast.success(item._tipo === 'receita' ? 'Status da receita alterado!' : 'Status da despesa alterado!');
    setMenuAberto(null);
    carregar();
  };

  const statusBadge = (status) => {
    const map = {
      'recebida': 'bg-green-100 text-green-700 border-0',
      'pendente': 'bg-amber-100 text-amber-700 border-0',
      'cancelada': 'bg-slate-100 text-slate-500 border-0',
      'pago': 'bg-green-100 text-green-700 border-0',
      'cancelado': 'bg-slate-100 text-slate-500 border-0',
    };
    const labels = {
      'recebida': 'Recebida', 'pendente': 'Pendente', 'cancelada': 'Cancelada',
      'pago': 'Pago', 'cancelado': 'Cancelado',
    };
    return <Badge className={map[status] || 'bg-slate-100 text-slate-500 border-0'}>{labels[status] || status}</Badge>;
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4 mt-4" onClick={() => setMenuAberto(null)}>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9 h-9" placeholder="Buscar descrição..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Todos tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            <SelectItem value="receita">Receitas</SelectItem>
            <SelectItem value="despesa">Despesas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Todos status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="recebida">Recebida</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 ml-auto">
          <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setModal({ open: true, item: null, tipo: 'despesa' })}>
            <ArrowDownCircle className="w-4 h-4 mr-1" /> Nova Despesa
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setModal({ open: true, item: null, tipo: 'receita' })}>
            <ArrowUpCircle className="w-4 h-4 mr-1" /> Nova Receita
          </Button>
        </div>
      </div>

      {/* Tabela */}
      {transacoesFiltradas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p>Nenhuma transação encontrada</p>
          <p className="text-xs mt-1">Cadastre receitas e despesas para começar</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b">
                <tr>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Tipo</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Data</th>
                  <th className="text-left px-4 py-3">Descrição</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Categoria</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Valor</th>
                  <th className="text-center px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transacoesFiltradas.map(t => (
                  <tr key={`${t._tipo}-${t.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {t._tipo === 'receita' ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><ArrowUpCircle className="w-3.5 h-3.5" /> Receita</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600 text-xs font-medium"><ArrowDownCircle className="w-3.5 h-3.5" /> Despesa</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{t.data ? format(parseISO(t.data), 'dd/MM/yy') : '-'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">{t.descricao}</td>
                    <td className="px-4 py-3 text-slate-500">{t.categoria || 'Geral'}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${t._tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                      {t._tipo === 'receita' ? '+ ' : '- '}{fmtMoeda(t.valor)}
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(t.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1 relative">
                        {(t._tipo === 'receita' && t.status !== 'recebida') || (t._tipo === 'despesa' && t.status !== 'pago') ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                            onClick={(e) => { e.stopPropagation(); alterarStatus(t); }}
                          >
                            {t._tipo === 'receita' ? 'Receber' : 'Pagar'}
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setModal({ open: true, item: t, tipo: t._tipo }); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); excluir(t); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal.open && (
        <FormModalFinanceiro
          open={modal.open}
          onClose={() => setModal({ open: false, item: null, tipo: 'receita' })}
          item={modal.item}
          tipo={modal.tipo}
          user={user}
          onSaved={() => { carregar(); }}
        />
      )}
    </div>
  );
}
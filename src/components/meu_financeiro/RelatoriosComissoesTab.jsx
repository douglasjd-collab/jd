import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronDown, ChevronUp, Hash, Wallet, Clock, CheckCircle2 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/pt-br';

moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Relatório de comissões do próprio vendedor/parceiro:
// mostra apenas os protocolos (agendados e pagos) em que ele é o vendedor.
export default function RelatoriosComissoesTab({ user }) {
  const vendedorId = user?.colaborador_id || user?.id;
  const [carregando, setCarregando] = useState(true);
  const [protocolos, setProtocolos] = useState([]);
  const [filtroMes, setFiltroMes] = useState('todos');
  const [filtroProduto, setFiltroProduto] = useState('todos');
  const [abertos, setAbertos] = useState({});

  useEffect(() => {
    if (!vendedorId) return;
    carregar();
  }, [vendedorId]);

  const carregar = async () => {
    setCarregando(true);
    try {
      // O vendedor pode estar gravado pelo ID do colaborador ou pelo ID do usuário
      const filtroVendedor = { vendedor_id: { $in: [...new Set([vendedorId, user?.id].filter(Boolean))] } };
      const [lotesConsorcio, lotesEmprestimo, comissoesConsorcio, comissoesEmprestimo] = await Promise.all([
        base44.entities.PagamentoComissaoLote.filter(filtroVendedor, null, 1000),
        base44.entities.LotePagamentoComissaoEmprestimo.filter(filtroVendedor, null, 1000),
        base44.entities.ComissaoAPagar.filter(filtroVendedor, null, 3000),
        base44.entities.ComissaoEmprestimoPaga.filter(filtroVendedor, null, 3000),
      ]);

      const idsEmLotes = new Set();

      const listaConsorcio = (lotesConsorcio || []).map((lote) => {
        let ids = [];
        try { ids = JSON.parse(lote.comissoes_ids || '[]'); } catch { ids = []; }
        ids.forEach((id) => idsEmLotes.add(id));
        const itens = (comissoesConsorcio || [])
          .filter((c) => ids.includes(c.id) || c.pagamento_id === lote.id)
          .map((c) => ({
            cliente: c.cliente_nome,
            referencia: c.grupo && c.cota ? `Grupo ${c.grupo} / Cota ${c.cota}` : c.contrato,
            valor: c.valor_a_pagar,
          }));
        return {
          id: `c-${lote.id}`,
          produto: 'Consórcio',
          codigo: lote.lote_code,
          status: lote.status === 'quitado' ? 'paga' : 'agendada',
          data: lote.data_quitacao || lote.data_pagamento,
          valor: lote.valor_total ?? lote.total_pago,
          forma: lote.forma_pagamento,
          itens,
        };
      });

      const listaEmprestimo = (lotesEmprestimo || []).map((lote) => {
        const itens = (comissoesEmprestimo || [])
          .filter((c) => c.lote_pagamento_id === lote.id)
          .map((c) => ({
            cliente: c.cliente_nome,
            referencia: c.contrato || c.banco,
            valor: c.valor_vendedor_pago,
          }));
        return {
          id: `e-${lote.id}`,
          produto: 'Empréstimo',
          codigo: lote.lote_codigo,
          status: lote.status === 'quitado' ? 'paga' : 'agendada',
          data: lote.data_quitacao || lote.data_pagamento,
          valor: lote.valor_efetivamente_pago ?? lote.valor_total,
          forma: lote.forma_pagamento,
          itens,
        };
      });

      // Comissões de consórcio quitadas sem protocolo vinculado
      const avulsas = (comissoesConsorcio || [])
        .filter((c) => c.status_pagamento === 'paga' && !idsEmLotes.has(c.id) && !c.pagamento_id)
        .map((c) => ({
          id: `a-${c.id}`,
          produto: 'Consórcio',
          codigo: c.protocolo || 'Sem protocolo',
          status: 'paga',
          data: c.data_pagamento,
          valor: c.valor_a_pagar,
          forma: c.forma_pagamento,
          itens: [{
            cliente: c.cliente_nome,
            referencia: c.grupo && c.cota ? `Grupo ${c.grupo} / Cota ${c.cota}` : c.contrato,
            valor: c.valor_a_pagar,
          }],
        }));

      setProtocolos([...listaConsorcio, ...listaEmprestimo, ...avulsas]);
    } finally {
      setCarregando(false);
    }
  };

  const visiveis = useMemo(() => protocolos
    .filter((p) => (filtroProduto === 'todos' ? true : p.produto === filtroProduto))
    .filter((p) => (filtroMes === 'todos' || !p.data ? true : moment(p.data).format('YYYY-MM') === filtroMes))
    .sort((a, b) => moment(b.data).valueOf() - moment(a.data).valueOf()), [protocolos, filtroMes, filtroProduto]);

  const totalPago = visiveis.filter((p) => p.status === 'paga').reduce((acc, p) => acc + (p.valor || 0), 0);
  const totalAgendado = visiveis.filter((p) => p.status === 'agendada').reduce((acc, p) => acc + (p.valor || 0), 0);

  const meses = [...new Set(protocolos.filter((p) => p.data).map((p) => moment(p.data).format('YYYY-MM')))].sort().reverse();

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> Comissões pagas
          </div>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(totalPago)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Clock className="w-4 h-4 text-amber-600" /> Comissões agendadas
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmt(totalAgendado)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Produto</label>
            <select
              className="w-full h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
              value={filtroProduto}
              onChange={(e) => setFiltroProduto(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="Consórcio">Consórcio</option>
              <option value="Empréstimo">Empréstimo</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Mês</label>
            <select
              className="w-full h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
            >
              <option value="todos">Todos os meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>{moment(m).format('MMMM [de] YYYY')}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {visiveis.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">Nenhuma comissão encontrada</Card>
      ) : (
        <div className="space-y-3">
          {visiveis.map((p) => {
            const aberto = abertos[p.id];
            return (
              <Card key={p.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAbertos((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${p.status === 'paga' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{p.produto}</span>
                      <Badge variant="outline" className="text-[10px] gap-1"><Hash className="w-3 h-3" />{p.codigo}</Badge>
                      <Badge className={p.status === 'paga' ? 'bg-green-600 text-white text-[10px]' : 'bg-amber-500 text-white text-[10px]'}>
                        {p.status === 'paga' ? 'Paga' : 'Agendada'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {p.status === 'paga' ? 'Pago em' : 'Previsto para'} {p.data ? moment(p.data).format('DD/MM/YYYY') : '-'}
                      {p.forma ? ` • ${p.forma}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${p.status === 'paga' ? 'text-green-600' : 'text-amber-600'}`}>{fmt(p.valor)}</p>
                    <span className="text-[11px] text-slate-400">{p.itens.length} item(ns)</span>
                  </div>
                  {aberto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {aberto && (
                  <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {p.itens.length === 0 ? (
                      <p className="p-3 text-xs text-slate-400">Detalhes dos contratos ainda não disponíveis.</p>
                    ) : p.itens.map((item, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{item.cliente || '-'}</p>
                          <p className="text-slate-400 truncate">{item.referencia || '-'}</p>
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmt(item.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
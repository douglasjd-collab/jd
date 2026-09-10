import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Download, HandCoins, Loader2, TrendingUp, UserRound, Wallet, Clock3, Layers3 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/pt-br';

moment.locale('pt-br');

const moeda = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (valor) => Number(valor || 0);
const perfilLabel = (perfil) => perfil === 'parceiro' ? 'Parceiro' : 'Vendedor / Colaborador';
const idAgente = (r) => r?.vendedor_id || 'sem-vendedor';
const statusPago = (status) => ['paga', 'quitada', 'pago', 'quitado'].includes(String(status || '').toLowerCase());
const statusCancelado = (status) => ['cancelada', 'cancelado', 'transferida', 'transferido'].includes(String(status || '').toLowerCase());

function escaparCsv(valor) {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`;
}

function CardMetrica({ titulo, valor, cor = 'blue', Icon = DollarSign }) {
  const cores = {
    blue: ['border-l-blue-500', 'text-blue-700', 'text-blue-500'],
    indigo: ['border-l-indigo-500', 'text-indigo-700', 'text-indigo-500'],
    cyan: ['border-l-cyan-500', 'text-cyan-700', 'text-cyan-500'],
    orange: ['border-l-orange-500', 'text-orange-700', 'text-orange-500'],
    amber: ['border-l-amber-500', 'text-amber-700', 'text-amber-500'],
    emerald: ['border-l-emerald-500', 'text-emerald-700', 'text-emerald-500'],
    red: ['border-l-red-500', 'text-red-700', 'text-red-500'],
  };
  const c = cores[cor] || cores.blue;
  return <Card className={`p-4 border-l-4 ${c[0]}`}>
    <div className="flex justify-between gap-3">
      <div><p className="text-xs text-slate-500 uppercase">{titulo}</p><p className={`text-xl font-bold mt-1 ${c[1]}`}>{moeda(valor)}</p></div>
      <Icon className={c[2]} />
    </div>
  </Card>;
}

export default function RentabilidadeComissoes() {
  const [user, setUser] = useState(null);
  const [aba, setAba] = useState('emprestimos');
  const [inicio, setInicio] = useState(moment().startOf('month').format('YYYY-MM-DD'));
  const [fim, setFim] = useState(moment().endOf('month').format('YYYY-MM-DD'));
  const [agenteId, setAgenteId] = useState('todos');
  const [tipoAgente, setTipoAgente] = useState('todos');
  const [busca, setBusca] = useState('');
  const [detalheId, setDetalheId] = useState(null);

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me();
      if (['super_admin', 'master'].includes(me?.perfil) || me?.role === 'super_admin') {
        setUser({ ...me, perfil: me?.perfil || me?.role, empresa_id: null });
        return;
      }
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date', 20);
      const colab = colabs.find(c => c.status === 'ativo') || colabs[0];
      setUser({ ...me, perfil: colab?.perfil, empresa_id: colab?.empresa_id });
    })().catch(console.error);
  }, []);

  useEffect(() => { setDetalheId(null); }, [aba, inicio, fim]);

  const filtroEmpresa = useMemo(() => user?.empresa_id ? { empresa_id: user.empresa_id } : {}, [user?.empresa_id]);
  const query = (chave, fn) => useQuery({ queryKey: [chave, user?.empresa_id], queryFn: fn, enabled: !!user });

  const propostasQ = query('rentabilidade-propostas', () => base44.entities.Proposta.filter({ ...filtroEmpresa, produto: 'emprestimo' }, '-data_comissao_recebida', 5000));
  const itensPagosQ = query('rentabilidade-itens-pagos', () => base44.entities.ComissaoEmprestimoPaga.filter(filtroEmpresa, '-data_pagamento', 5000));
  const lotesQ = query('rentabilidade-lotes', () => base44.entities.LotePagamentoComissaoEmprestimo.filter(filtroEmpresa, '-data_pagamento', 2000));
  const colaboradoresQ = query('rentabilidade-colaboradores', () => base44.entities.Colaborador.filter(filtroEmpresa, 'nome', 2000));
  const vendasConsorcioQ = query('rentabilidade-vendas-consorcio', () => base44.entities.Venda.filter(filtroEmpresa, '-data_venda', 5000));
  const comissoesConsorcioQ = query('rentabilidade-comissoes-consorcio', () => base44.entities.ComissaoAPagar.filter(filtroEmpresa, '-data_recebimento', 5000));

  const propostas = propostasQ.data || [];
  const itensPagos = itensPagosQ.data || [];
  const lotes = lotesQ.data || [];
  const colaboradores = colaboradoresQ.data || [];
  const vendasConsorcio = vendasConsorcioQ.data || [];
  const comissoesConsorcioTodas = comissoesConsorcioQ.data || [];
  const carregando = [propostasQ, itensPagosQ, lotesQ, colaboradoresQ, vendasConsorcioQ, comissoesConsorcioQ].some(q => q.isLoading);

  const dentroPeriodo = (data) => !!data && (!inicio || data >= inicio) && (!fim || data <= fim);

  const mapaAgentes = useMemo(() => {
    const mapa = new Map();
    colaboradores.forEach(c => {
      mapa.set(c.id, c);
      if (c.user_id) mapa.set(c.user_id, c);
    });
    return mapa;
  }, [colaboradores]);

  const itensPorProposta = useMemo(() => {
    const mapa = new Map();
    itensPagos.forEach(i => mapa.set(i.proposta_id, i));
    return mapa;
  }, [itensPagos]);

  const propostasRecebidas = useMemo(() => propostas.filter(p =>
    p.comissao_banco_recebida === true &&
    dentroPeriodo(p.data_comissao_recebida || p.emprestimo_data_liberacao || p.data_venda)
  ), [propostas, inicio, fim]);

  const lotesQuitadosPeriodo = useMemo(() => lotes.filter(l =>
    l.status === 'quitado' && dentroPeriodo(l.data_quitacao || l.data_pagamento)
  ), [lotes, inicio, fim]);

  const vendasConsorcioPeriodo = useMemo(() => vendasConsorcio.filter(v =>
    dentroPeriodo(v.data_venda) && !statusCancelado(v.status)
  ), [vendasConsorcio, inicio, fim]);

  // Grupo/cota identifica com segurança os recebimentos de consórcio; empréstimos não possuem esses campos.
  const comissoesConsorcio = useMemo(() => comissoesConsorcioTodas.filter(c =>
    (c.grupo || c.cota) && dentroPeriodo(c.data_recebimento)
  ), [comissoesConsorcioTodas, inicio, fim]);

  const passaFiltros = (a) => {
    if (agenteId !== 'todos' && a.id !== agenteId) return false;
    if (tipoAgente === 'parceiro' && a.perfil !== 'parceiro') return false;
    if (tipoAgente === 'equipe' && a.perfil === 'parceiro') return false;
    if (busca && !a.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  };

  const agentesEmprestimo = useMemo(() => {
    const ids = new Set(propostasRecebidas.map(idAgente));
    return Array.from(ids).map(id => {
      const cadastro = mapaAgentes.get(id);
      const props = propostasRecebidas.filter(p => idAgente(p) === id);
      const lotesAgente = lotesQuitadosPeriodo.filter(l => idAgente(l) === id);
      const nome = cadastro?.nome || props[0]?.vendedor_nome || 'Sem responsável';
      const producao = props.reduce((s, p) => s + numero(p.valor_credito), 0);
      const gerada = props.reduce((s, p) => s + numero(p.valor_comissao || p.comissao_recebida), 0);
      const recebida = props.reduce((s, p) => s + numero(p.comissao_recebida), 0);
      const pago = props.reduce((s, p) => {
        const item = itensPorProposta.get(p.id);
        return s + numero(item?.valor_vendedor_pago ?? p.valor_comissao_vendedor_pago);
      }, 0);
      return {
        id, nome, perfil: cadastro?.perfil || 'vendedor', filial_nome: cadastro?.filial_nome || '-',
        producao, gerada, recebida, pago, pendente: 0, saldoJD: recebida - pago,
        props, lotesAgente, produto: 'Empréstimos',
      };
    }).filter(passaFiltros).sort((a, b) => b.saldoJD - a.saldoJD);
  }, [propostasRecebidas, lotesQuitadosPeriodo, mapaAgentes, itensPorProposta, agenteId, tipoAgente, busca]);

  const agentesConsorcio = useMemo(() => {
    const ids = new Set([...vendasConsorcioPeriodo.map(idAgente), ...comissoesConsorcio.map(idAgente)]);
    return Array.from(ids).map(id => {
      const cadastro = mapaAgentes.get(id);
      const vendas = vendasConsorcioPeriodo.filter(v => idAgente(v) === id);
      const parcelas = comissoesConsorcio.filter(c => idAgente(c) === id);
      const nome = cadastro?.nome || vendas[0]?.vendedor_nome || parcelas[0]?.vendedor_nome || 'Sem responsável';
      const producao = vendas.reduce((s, v) => s + numero(v.valorCredito), 0);
      const gerada = vendas.reduce((s, v) => s + numero(v.valorComissao || v.comissao_total_prevista), 0);
      const recebida = parcelas.reduce((s, c) => s + numero(c.valor_recebido), 0);
      const pago = parcelas.filter(c => statusPago(c.status_pagamento)).reduce((s, c) => s + numero(c.valor_a_pagar), 0);
      const pendente = parcelas.filter(c => !statusPago(c.status_pagamento)).reduce((s, c) => s + numero(c.valor_a_pagar), 0);
      const repasseTotal = pago + pendente;
      return {
        id, nome, perfil: cadastro?.perfil || 'vendedor', filial_nome: cadastro?.filial_nome || '-',
        producao, gerada, recebida, pago, pendente, saldoJD: recebida - repasseTotal,
        vendas, parcelas, produto: 'Consórcio',
      };
    }).filter(passaFiltros).sort((a, b) => b.saldoJD - a.saldoJD);
  }, [vendasConsorcioPeriodo, comissoesConsorcio, mapaAgentes, agenteId, tipoAgente, busca]);

  const agentesConsolidado = useMemo(() => {
    const mapa = new Map();
    [...agentesEmprestimo, ...agentesConsorcio].forEach(a => {
      const atual = mapa.get(a.id) || {
        id: a.id, nome: a.nome, perfil: a.perfil, filial_nome: a.filial_nome,
        producao: 0, gerada: 0, recebida: 0, pago: 0, pendente: 0, saldoJD: 0,
      };
      atual.producao += a.producao;
      atual.gerada += a.gerada;
      atual.recebida += a.recebida;
      atual.pago += a.pago;
      atual.pendente += a.pendente;
      atual.saldoJD += a.saldoJD;
      mapa.set(a.id, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.saldoJD - a.saldoJD);
  }, [agentesEmprestimo, agentesConsorcio]);

  const agentesAtivos = aba === 'emprestimos' ? agentesEmprestimo : aba === 'consorcio' ? agentesConsorcio : agentesConsolidado;

  const totais = useMemo(() => agentesAtivos.reduce((t, a) => ({
    producao: t.producao + a.producao,
    gerada: t.gerada + a.gerada,
    recebida: t.recebida + a.recebida,
    pago: t.pago + a.pago,
    pendente: t.pendente + a.pendente,
    saldoJD: t.saldoJD + a.saldoJD,
  }), { producao: 0, gerada: 0, recebida: 0, pago: 0, pendente: 0, saldoJD: 0 }), [agentesAtivos]);

  const listaAgentes = useMemo(() => {
    const mapa = new Map();
    [...propostas, ...lotes, ...vendasConsorcio, ...comissoesConsorcioTodas].forEach(r => {
      const id = idAgente(r);
      if (!mapa.has(id)) {
        const c = mapaAgentes.get(id);
        mapa.set(id, { id, nome: c?.nome || r.vendedor_nome || 'Sem responsável' });
      }
    });
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [propostas, lotes, vendasConsorcio, comissoesConsorcioTodas, mapaAgentes]);

  const exportarCsv = () => {
    const cabecalho = ['Produto', 'Tipo', 'Responsável', 'Unidade', 'Produção', 'Comissão gerada', 'Comissão recebida', 'Comissão paga', 'Comissão pendente', 'Saldo JD'];
    const linhas = agentesAtivos.map(a => [
      aba === 'consolidado' ? 'Consolidado' : a.produto, perfilLabel(a.perfil), a.nome, a.filial_nome,
      a.producao, a.gerada, a.recebida, a.pago, a.pendente, a.saldoJD
    ]);
    const csv = [cabecalho, ...linhas].map(l => l.map(escaparCsv).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rentabilidade_${aba}_${inicio}_a_${fim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!user || carregando) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Carregando rentabilidade...</div>;

  const corSaldo = totais.saldoJD >= 0 ? 'emerald' : 'red';

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rentabilidade de Comissões</h1>
          <p className="text-sm text-slate-500">Resultado de empréstimos e consórcios por vendedor, parceiro e unidade.</p>
        </div>
        <Button variant="outline" onClick={exportarCsv}><Download className="w-4 h-4 mr-2" />Exportar Excel (CSV)</Button>
      </div>

      <div className="inline-flex w-full md:w-auto rounded-lg border bg-white p-1 gap-1">
        {[
          ['emprestimos', 'Empréstimos'],
          ['consorcio', 'Consórcio'],
          ['consolidado', 'Consolidado'],
        ].map(([valor, label]) => (
          <Button key={valor} size="sm" variant={aba === valor ? 'default' : 'ghost'}
            className={aba === valor ? 'bg-[#10353C] hover:bg-[#174b55] flex-1 md:flex-none' : 'flex-1 md:flex-none'}
            onClick={() => setAba(valor)}>{label}</Button>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div><Label>Data inicial</Label><Input className="mt-1" type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
          <div><Label>Data final</Label><Input className="mt-1" type="date" value={fim} onChange={e => setFim(e.target.value)} /></div>
          <div><Label>Tipo</Label><Select value={tipoAgente} onValueChange={setTipoAgente}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="equipe">Vendedores / equipe</SelectItem><SelectItem value="parceiro">Parceiros</SelectItem></SelectContent></Select></div>
          <div><Label>Responsável</Label><Select value={agenteId} onValueChange={setAgenteId}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{listaAgentes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Buscar nome</Label><Input className="mt-1" placeholder="Vendedor ou parceiro" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          {aba === 'consorcio'
            ? 'Produção usa a data da venda. Recebimentos e repasses usam as parcelas de comissão recebidas no período.'
            : aba === 'emprestimos'
              ? 'Produção e comissões usam os contratos com comissão recebida do banco no período.'
              : 'O consolidado soma os resultados das duas operações no mesmo período.'}
        </p>
      </Card>

      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${aba === 'emprestimos' ? 'xl:grid-cols-5' : 'xl:grid-cols-6'} gap-4`}>
        <CardMetrica titulo="Produção" valor={totais.producao} cor="blue" Icon={TrendingUp} />
        <CardMetrica titulo={aba === 'consorcio' ? 'Comissão prevista' : 'Comissão gerada'} valor={totais.gerada} cor="indigo" />
        <CardMetrica titulo="Comissão recebida" valor={totais.recebida} cor="cyan" />
        <CardMetrica titulo="Comissão paga" valor={totais.pago} cor="orange" Icon={HandCoins} />
        {aba !== 'emprestimos' && <CardMetrica titulo="Ainda a pagar" valor={totais.pendente} cor="amber" Icon={Clock3} />}
        <CardMetrica titulo="Saldo JD" valor={totais.saldoJD} cor={corSaldo} Icon={Wallet} />
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-slate-900">Resultado por responsável</h2>
          <p className="text-xs text-slate-500">{agentesAtivos.length} responsável(is) no período</p>
        </div>
        {agentesAtivos.length === 0 ? <div className="p-10 text-center text-slate-400">Nenhum movimento encontrado no período.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>
                <th className="p-3 text-left">Responsável</th><th className="p-3 text-left">Tipo</th><th className="p-3 text-left">Unidade</th>
                <th className="p-3 text-right">Produção</th><th className="p-3 text-right">{aba === 'consorcio' ? 'Prevista' : 'Gerada'}</th>
                <th className="p-3 text-right">Recebida</th><th className="p-3 text-right">Paga</th>
                {aba !== 'emprestimos' && <th className="p-3 text-right">A pagar</th>}
                <th className="p-3 text-right">Saldo JD</th>{aba !== 'consolidado' && <th className="p-3 text-center">Detalhes</th>}
              </tr></thead>
              <tbody>{agentesAtivos.map(a => <React.Fragment key={a.id}>
                <tr className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900"><span className="inline-flex items-center gap-2"><UserRound className="w-4 h-4 text-slate-400" />{a.nome}</span></td>
                  <td className="p-3"><Badge variant="outline" className={a.perfil === 'parceiro' ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-blue-200 bg-blue-50 text-blue-700'}>{perfilLabel(a.perfil)}</Badge></td>
                  <td className="p-3 text-slate-600">{a.filial_nome}</td>
                  <td className="p-3 text-right">{moeda(a.producao)}</td>
                  <td className="p-3 text-right font-semibold text-indigo-700">{moeda(a.gerada)}</td>
                  <td className="p-3 text-right text-cyan-700">{moeda(a.recebida)}</td>
                  <td className="p-3 text-right text-orange-700">{moeda(a.pago)}</td>
                  {aba !== 'emprestimos' && <td className="p-3 text-right text-amber-700">{moeda(a.pendente)}</td>}
                  <td className={`p-3 text-right font-bold ${a.saldoJD >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{moeda(a.saldoJD)}</td>
                  {aba !== 'consolidado' && <td className="p-3 text-center"><Button size="sm" variant="outline" onClick={() => setDetalheId(detalheId === a.id ? null : a.id)}>{detalheId === a.id ? 'Fechar' : aba === 'consorcio' ? 'Ver parcelas' : 'Ver contratos'}</Button></td>}
                </tr>

                {detalheId === a.id && aba === 'emprestimos' && <tr><td colSpan={10} className="p-0 bg-slate-50"><div className="p-4 overflow-x-auto">
                  <table className="w-full bg-white border rounded text-xs"><thead><tr className="bg-slate-100"><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Contrato</th><th className="p-2 text-left">Banco</th><th className="p-2 text-left">Recebimento</th><th className="p-2 text-right">Empréstimo</th><th className="p-2 text-right">Comissão gerada</th><th className="p-2 text-right">Recebida</th><th className="p-2 text-right">Pago</th><th className="p-2 text-right">Saldo JD</th></tr></thead>
                    <tbody>{a.props.map(p => { const item = itensPorProposta.get(p.id); const pago = numero(item?.valor_vendedor_pago ?? p.valor_comissao_vendedor_pago); const gerada = numero(item?.valor_comissao_empresa_original ?? p.valor_comissao ?? p.comissao_recebida); const recebida = numero(p.comissao_recebida); return <tr key={p.id} className="border-t"><td className="p-2">{p.cliente_nome || '-'}</td><td className="p-2">{p.contrato || '-'}</td><td className="p-2">{p.administradora_nome || '-'}</td><td className="p-2">{moment(p.data_comissao_recebida || p.data_venda).format('DD/MM/YYYY')}</td><td className="p-2 text-right">{moeda(p.valor_credito)}</td><td className="p-2 text-right">{moeda(gerada)}</td><td className="p-2 text-right">{moeda(recebida)}</td><td className="p-2 text-right">{moeda(pago)}</td><td className="p-2 text-right font-semibold">{moeda(recebida - pago)}</td></tr>; })}</tbody>
                  </table>
                </div></td></tr>}

                {detalheId === a.id && aba === 'consorcio' && <tr><td colSpan={11} className="p-0 bg-slate-50"><div className="p-4 overflow-x-auto">
                  <table className="w-full bg-white border rounded text-xs"><thead><tr className="bg-slate-100"><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Contrato</th><th className="p-2 text-left">Grupo/Cota</th><th className="p-2 text-left">Administradora</th><th className="p-2 text-center">Parcela</th><th className="p-2 text-left">Recebimento</th><th className="p-2 text-right">Recebido JD</th><th className="p-2 text-right">Repasse</th><th className="p-2 text-left">Situação</th><th className="p-2 text-right">Margem JD</th></tr></thead>
                    <tbody>{a.parcelas.map(c => { const repasse = numero(c.valor_a_pagar); return <tr key={c.id} className="border-t"><td className="p-2">{c.cliente_nome || '-'}</td><td className="p-2">{String(c.contrato || '-').trim()}</td><td className="p-2">{c.grupo || '-'} / {c.cota || '-'}</td><td className="p-2">{c.administradora_nome || '-'}</td><td className="p-2 text-center">{c.parcela_numero || '-'}</td><td className="p-2">{moment(c.data_recebimento).format('DD/MM/YYYY')}</td><td className="p-2 text-right">{moeda(c.valor_recebido)}</td><td className="p-2 text-right">{moeda(repasse)}</td><td className="p-2"><Badge variant="outline" className={statusPago(c.status_pagamento) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>{statusPago(c.status_pagamento) ? 'Pago' : 'A pagar'}</Badge></td><td className="p-2 text-right font-semibold">{moeda(numero(c.valor_recebido) - repasse)}</td></tr>; })}</tbody>
                  </table>
                </div></td></tr>}
              </React.Fragment>)}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 bg-amber-50 border-amber-200">
        <div className="flex gap-3"><Layers3 className="w-5 h-5 text-amber-700 flex-shrink-0" /><div>
          <p className="text-sm font-semibold text-amber-900">Como interpretar</p>
          <p className="text-xs text-amber-800 mt-1">
            {aba === 'consorcio'
              ? 'Comissão prevista é o total estimado das vendas realizadas no período. Comissão recebida soma as parcelas efetivamente pagas pelas administradoras. Comissão paga e ainda a pagar representam o repasse do responsável. Saldo JD = recebido − repasse pago − repasse pendente.'
              : aba === 'consolidado'
                ? 'O consolidado soma empréstimos e consórcios. No consórcio, o saldo já reserva o valor que ainda será pago ao responsável.'
                : 'Saldo JD = comissão efetivamente recebida do banco − comissão paga ao vendedor ou parceiro. Custos fixos, impostos e estornos não estão descontados.'}
          </p>
        </div></div>
      </Card>
    </div>
  );
}

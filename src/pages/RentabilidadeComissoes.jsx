import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Download, HandCoins, Loader2, TrendingUp, UserRound, Wallet } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/pt-br';

moment.locale('pt-br');

const moeda = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (valor) => Number(valor || 0);
const normalizarPerfil = (perfil) => perfil === 'parceiro' ? 'Parceiro' : 'Vendedor / Colaborador';

function escaparCsv(valor) {
  const texto = String(valor ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

export default function RentabilidadeComissoes() {
  const inicioMes = moment().startOf('month').format('YYYY-MM-DD');
  const fimMes = moment().endOf('month').format('YYYY-MM-DD');
  const [user, setUser] = useState(null);
  const [inicio, setInicio] = useState(inicioMes);
  const [fim, setFim] = useState(fimMes);
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

  const filtroEmpresa = useMemo(() => user?.empresa_id ? { empresa_id: user.empresa_id } : {}, [user?.empresa_id]);

  const { data: propostas = [], isLoading: carregandoPropostas } = useQuery({
    queryKey: ['rentabilidade-propostas', user?.empresa_id],
    queryFn: () => base44.entities.Proposta.filter({ ...filtroEmpresa, produto: 'emprestimo' }, '-data_comissao_recebida', 5000),
    enabled: !!user,
  });

  const { data: itensPagos = [], isLoading: carregandoItens } = useQuery({
    queryKey: ['rentabilidade-itens-pagos', user?.empresa_id],
    queryFn: () => base44.entities.ComissaoEmprestimoPaga.filter(filtroEmpresa, '-data_pagamento', 5000),
    enabled: !!user,
  });

  const { data: lotes = [], isLoading: carregandoLotes } = useQuery({
    queryKey: ['rentabilidade-lotes', user?.empresa_id],
    queryFn: () => base44.entities.LotePagamentoComissaoEmprestimo.filter(filtroEmpresa, '-data_pagamento', 2000),
    enabled: !!user,
  });

  const { data: colaboradores = [], isLoading: carregandoColabs } = useQuery({
    queryKey: ['rentabilidade-colaboradores', user?.empresa_id],
    queryFn: () => base44.entities.Colaborador.filter(filtroEmpresa, 'nome', 2000),
    enabled: !!user,
  });

  const mapaAgentes = useMemo(() => {
    const mapa = new Map();
    colaboradores.forEach(c => {
      mapa.set(c.id, c);
      if (c.user_id) mapa.set(c.user_id, c);
    });
    return mapa;
  }, [colaboradores]);

  const dentroPeriodo = (data) => {
    if (!data) return false;
    return (!inicio || data >= inicio) && (!fim || data <= fim);
  };

  const propostasRecebidas = useMemo(() => propostas.filter(p =>
    p.comissao_banco_recebida === true &&
    dentroPeriodo(p.data_comissao_recebida || p.emprestimo_data_liberacao || p.data_venda)
  ), [propostas, inicio, fim]);

  const itensPorProposta = useMemo(() => {
    const mapa = new Map();
    itensPagos.forEach(i => mapa.set(i.proposta_id, i));
    return mapa;
  }, [itensPagos]);

  const lotesQuitadosPeriodo = useMemo(() => lotes.filter(l =>
    l.status === 'quitado' && dentroPeriodo(l.data_quitacao || l.data_pagamento)
  ), [lotes, inicio, fim]);

  // Pagamentos antigos, feitos antes da criação dos lotes/snapshots atuais.
  const pagamentosLegadoPeriodo = useMemo(() => propostas.filter(p =>
    p.comissao_vendedor_paga === true &&
    !itensPorProposta.has(p.id) &&
    dentroPeriodo(p.comissao_vendedor_data_pagamento)
  ), [propostas, itensPorProposta, inicio, fim]);

  const agentes = useMemo(() => {
    const ids = new Set();
    propostasRecebidas.forEach(p => ids.add(p.vendedor_id || 'sem-vendedor'));
    lotesQuitadosPeriodo.forEach(l => ids.add(l.vendedor_id || 'sem-vendedor'));
    pagamentosLegadoPeriodo.forEach(p => ids.add(p.vendedor_id || 'sem-vendedor'));

    return Array.from(ids).map(id => {
      const cadastro = mapaAgentes.get(id);
      const props = propostasRecebidas.filter(p => (p.vendedor_id || 'sem-vendedor') === id);
      const lotesAgente = lotesQuitadosPeriodo.filter(l => (l.vendedor_id || 'sem-vendedor') === id);
      const legadoAgente = pagamentosLegadoPeriodo.filter(p => (p.vendedor_id || 'sem-vendedor') === id);
      const nome = cadastro?.nome || props[0]?.vendedor_nome || lotesAgente[0]?.vendedor_nome || legadoAgente[0]?.vendedor_nome || 'Sem responsável';
      const perfil = cadastro?.perfil || 'vendedor';
      const producao = props.reduce((s, p) => s + numero(p.valor_credito), 0);
      const comissaoGerada = props.reduce((s, p) => s + numero(p.valor_comissao || p.comissao_recebida), 0);
      const pagoLotes = lotesAgente.reduce((s, l) => s + numero(l.valor_efetivamente_pago ?? l.valor_total), 0);
      const pagoLegado = legadoAgente.reduce((s, p) => s + numero(p.valor_comissao_vendedor_pago || p.valor_comissao), 0);
      const pago = pagoLotes + pagoLegado;
      const acrescimos = lotesAgente.reduce((s, l) => s + numero(l.acrescimos), 0);
      const descontos = lotesAgente.reduce((s, l) => s + numero(l.descontos), 0);
      const margem = comissaoGerada - pago;
      return {
        id, nome, perfil, filial_nome: cadastro?.filial_nome || '-', props, lotesAgente,
        producao, comissaoGerada, pago, acrescimos, descontos, margem,
      };
    }).filter(a => {
      if (agenteId !== 'todos' && a.id !== agenteId) return false;
      if (tipoAgente === 'parceiro' && a.perfil !== 'parceiro') return false;
      if (tipoAgente === 'equipe' && a.perfil === 'parceiro') return false;
      if (busca && !a.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.margem - a.margem);
  }, [propostasRecebidas, lotesQuitadosPeriodo, pagamentosLegadoPeriodo, mapaAgentes, agenteId, tipoAgente, busca]);

  const totais = useMemo(() => agentes.reduce((t, a) => ({
    producao: t.producao + a.producao,
    gerada: t.gerada + a.comissaoGerada,
    pago: t.pago + a.pago,
    margem: t.margem + a.margem,
  }), { producao: 0, gerada: 0, pago: 0, margem: 0 }), [agentes]);

  const listaAgentes = useMemo(() => {
    const mapa = new Map();
    [...propostas, ...lotes].forEach(r => {
      const id = r.vendedor_id || 'sem-vendedor';
      if (!mapa.has(id)) {
        const c = mapaAgentes.get(id);
        mapa.set(id, { id, nome: c?.nome || r.vendedor_nome || 'Sem responsável', perfil: c?.perfil || 'vendedor' });
      }
    });
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [propostas, lotes, mapaAgentes]);

  const exportarCsv = () => {
    const cabecalho = ['Tipo', 'Responsável', 'Unidade', 'Produção', 'Comissão gerada', 'Comissão paga', 'Margem JD'];
    const linhas = agentes.map(a => [
      normalizarPerfil(a.perfil), a.nome, a.filial_nome, a.producao, a.comissaoGerada, a.pago, a.margem
    ]);
    const csv = [cabecalho, ...linhas].map(l => l.map(escaparCsv).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rentabilidade_comissoes_${inicio}_a_${fim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const carregando = carregandoPropostas || carregandoItens || carregandoLotes || carregandoColabs;
  if (!user || carregando) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Carregando rentabilidade...</div>;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rentabilidade de Comissões</h1>
          <p className="text-sm text-slate-500">Resultado mensal de vendedores e parceiros em empréstimos.</p>
        </div>
        <Button variant="outline" onClick={exportarCsv}><Download className="w-4 h-4 mr-2" />Exportar Excel (CSV)</Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div><Label>Data inicial</Label><Input className="mt-1" type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
          <div><Label>Data final</Label><Input className="mt-1" type="date" value={fim} onChange={e => setFim(e.target.value)} /></div>
          <div><Label>Tipo</Label><Select value={tipoAgente} onValueChange={setTipoAgente}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="equipe">Vendedores / equipe</SelectItem><SelectItem value="parceiro">Parceiros</SelectItem></SelectContent></Select></div>
          <div><Label>Responsável</Label><Select value={agenteId} onValueChange={setAgenteId}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{listaAgentes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Buscar nome</Label><Input className="mt-1" placeholder="Vendedor ou parceiro" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        </div>
        <p className="text-xs text-slate-500 mt-3">Comissão gerada usa a data de recebimento do banco. Comissão paga usa a data de quitação do lote no mesmo período.</p>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500"><div className="flex justify-between"><div><p className="text-xs text-slate-500 uppercase">Produção liberada</p><p className="text-2xl font-bold text-slate-900 mt-1">{moeda(totais.producao)}</p></div><TrendingUp className="text-blue-500" /></div></Card>
        <Card className="p-4 border-l-4 border-l-indigo-500"><div className="flex justify-between"><div><p className="text-xs text-slate-500 uppercase">Comissão gerada</p><p className="text-2xl font-bold text-indigo-700 mt-1">{moeda(totais.gerada)}</p></div><DollarSign className="text-indigo-500" /></div></Card>
        <Card className="p-4 border-l-4 border-l-orange-500"><div className="flex justify-between"><div><p className="text-xs text-slate-500 uppercase">Comissão paga</p><p className="text-2xl font-bold text-orange-700 mt-1">{moeda(totais.pago)}</p></div><HandCoins className="text-orange-500" /></div></Card>
        <Card className={`p-4 border-l-4 ${totais.margem >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}><div className="flex justify-between"><div><p className="text-xs text-slate-500 uppercase">Saldo da comissão</p><p className={`text-2xl font-bold mt-1 ${totais.margem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{moeda(totais.margem)}</p></div><Wallet className={totais.margem >= 0 ? 'text-emerald-500' : 'text-red-500'} /></div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b"><h2 className="font-semibold text-slate-900">Resultado por responsável</h2><p className="text-xs text-slate-500">{agentes.length} responsável(is) no período</p></div>
        {agentes.length === 0 ? <div className="p-10 text-center text-slate-400">Nenhum movimento encontrado no período.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 text-left">Responsável</th><th className="p-3 text-left">Tipo</th><th className="p-3 text-left">Unidade</th><th className="p-3 text-right">Produção</th><th className="p-3 text-right">Comissão gerada</th><th className="p-3 text-right">Paga</th><th className="p-3 text-right">Saldo JD</th><th className="p-3 text-center">Detalhes</th></tr></thead>
              <tbody>{agentes.map(a => <React.Fragment key={a.id}>
                <tr className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900"><span className="inline-flex items-center gap-2"><UserRound className="w-4 h-4 text-slate-400" />{a.nome}</span></td>
                  <td className="p-3"><Badge variant="outline" className={a.perfil === 'parceiro' ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-blue-200 bg-blue-50 text-blue-700'}>{normalizarPerfil(a.perfil)}</Badge></td>
                  <td className="p-3 text-slate-600">{a.filial_nome}</td>
                  <td className="p-3 text-right">{moeda(a.producao)}</td>
                  <td className="p-3 text-right font-semibold text-indigo-700">{moeda(a.comissaoGerada)}</td>
                  <td className="p-3 text-right text-orange-700">{moeda(a.pago)}</td>
                  <td className={`p-3 text-right font-bold ${a.margem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{moeda(a.margem)}</td>
                  <td className="p-3 text-center"><Button size="sm" variant="outline" onClick={() => setDetalheId(detalheId === a.id ? null : a.id)}>{detalheId === a.id ? 'Fechar' : 'Ver contratos'}</Button></td>
                </tr>
                {detalheId === a.id && <tr><td colSpan={8} className="p-0 bg-slate-50"><div className="p-4 overflow-x-auto">
                  <div className="flex gap-4 text-xs mb-3 text-slate-600"><span>Acréscimos pagos: <b>{moeda(a.acrescimos)}</b></span><span>Descontos: <b>{moeda(a.descontos)}</b></span></div>
                  <table className="w-full bg-white border rounded text-xs"><thead><tr className="bg-slate-100"><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Contrato</th><th className="p-2 text-left">Banco</th><th className="p-2 text-left">Recebimento</th><th className="p-2 text-right">Crédito</th><th className="p-2 text-right">Comissão JD</th><th className="p-2 text-right">Pago ao responsável</th><th className="p-2 text-right">Margem contrato</th></tr></thead>
                    <tbody>{a.props.map(p => { const item = itensPorProposta.get(p.id); const pago = numero(item?.valor_vendedor_pago ?? p.valor_comissao_vendedor_pago); const gerada = numero(item?.valor_comissao_empresa_original ?? p.valor_comissao ?? p.comissao_recebida); return <tr key={p.id} className="border-t"><td className="p-2">{p.cliente_nome || '-'}</td><td className="p-2">{p.contrato || '-'}</td><td className="p-2">{p.administradora_nome || '-'}</td><td className="p-2">{moment(p.data_comissao_recebida || p.data_venda).format('DD/MM/YYYY')}</td><td className="p-2 text-right">{moeda(p.valor_credito)}</td><td className="p-2 text-right">{moeda(gerada)}</td><td className="p-2 text-right">{moeda(pago)}</td><td className="p-2 text-right font-semibold">{moeda(gerada - pago)}</td></tr>; })}</tbody>
                  </table>
                </div></td></tr>}
              </React.Fragment>)}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 bg-amber-50 border-amber-200">
        <p className="text-sm font-semibold text-amber-900">Como interpretar o saldo</p>
        <p className="text-xs text-amber-800 mt-1">Saldo da comissão = comissão recebida dos bancos no período − pagamentos efetivamente quitados para vendedores e parceiros no período. Custos fixos, impostos e estornos ainda não são descontados neste relatório.</p>
      </Card>
    </div>
  );
}

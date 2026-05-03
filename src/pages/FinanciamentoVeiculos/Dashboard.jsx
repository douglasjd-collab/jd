import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Car, Bike, Truck, FileText, DollarSign, TrendingUp, BarChart3 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, isWithinInterval } from 'date-fns';

const STATUS_LABELS = {
  em_analise: { label: 'Em análise', color: 'bg-blue-100 text-blue-700' },
  aguardando_documentacao: { label: 'Aguardando Doc.', color: 'bg-yellow-100 text-yellow-700' },
  aprovado: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  reprovado: { label: 'Reprovado', color: 'bg-red-100 text-red-700' },
  contrato_emitido: { label: 'Contrato Emitido', color: 'bg-purple-100 text-purple-700' },
  pago: { label: 'Pago / Finalizado', color: 'bg-emerald-100 text-emerald-700' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-600' },
};

const PERIODO_OPTIONS = [
  { value: '1', label: 'Este mês' },
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
  { value: 'all', label: 'Todo período' },
];

export default function DashboardFinanciamento() {
  const [user, setUser] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ periodo: '1', vendedor: 'all', banco: 'all', status: 'all', tipo_veiculo: 'all' });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    carregarPropostas();
    const unsub = base44.entities.FinanciamentoVeiculo.subscribe(() => carregarPropostas());
    return unsub;
  }, [user]);

  const carregarPropostas = async () => {
    const filtro = user?.empresa_id ? { empresa_id: user.empresa_id } : {};
    const data = await base44.entities.FinanciamentoVeiculo.filter(filtro, '-data_proposta', 2000);
    setPropostas(data);
    setLoading(false);
  };

  const propostasFiltradas = propostas.filter(p => {
    if (filtros.vendedor !== 'all' && p.vendedor_id !== filtros.vendedor) return false;
    if (filtros.banco !== 'all' && p.banco !== filtros.banco) return false;
    if (filtros.status !== 'all' && p.status !== filtros.status) return false;
    if (filtros.tipo_veiculo !== 'all' && p.tipo_veiculo !== filtros.tipo_veiculo) return false;
    if (filtros.periodo !== 'all') {
      const meses = parseInt(filtros.periodo);
      const inicio = startOfMonth(subMonths(new Date(), meses - 1));
      const fim = endOfMonth(new Date());
      if (!p.data_proposta) return false;
      const data = parseISO(p.data_proposta);
      if (!isWithinInterval(data, { start: inicio, end: fim })) return false;
    }
    return true;
  });

  const totalPropostas = propostasFiltradas.length;
  const valorTotalVendas = propostasFiltradas
    .filter(p => ['aprovado', 'pago', 'contrato_emitido'].includes(p.status))
    .reduce((acc, p) => acc + (p.valor_veiculo || 0), 0);
  const totalMotos = propostasFiltradas.filter(p => p.tipo_veiculo === 'moto').length;
  const totalCarros = propostasFiltradas.filter(p => p.tipo_veiculo === 'carro').length;

  const statusCount = Object.keys(STATUS_LABELS).map(s => ({
    status: s,
    count: propostasFiltradas.filter(p => p.status === s).length,
  }));

  const vendedores = [...new Set(propostas.filter(p => p.vendedor_id).map(p => JSON.stringify({ id: p.vendedor_id, nome: p.vendedor_nome })))].map(v => JSON.parse(v));
  const bancos = [...new Set(propostas.filter(p => p.banco).map(p => p.banco))];

  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard — Financiamento de Veículos</h1>
        <Link to="/FinanciamentoPropostas" className="bg-[#10353C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#10353C]/90 transition-colors">
          + Nova Proposta
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <Select value={filtros.periodo} onValueChange={v => setFiltros(f => ({ ...f, periodo: v }))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            {PERIODO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filtros.tipo_veiculo} onValueChange={v => setFiltros(f => ({ ...f, tipo_veiculo: v }))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo de Veículo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="carro">Carro</SelectItem>
            <SelectItem value="moto">Moto</SelectItem>
            <SelectItem value="caminhao">Caminhão</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtros.banco} onValueChange={v => setFiltros(f => ({ ...f, banco: v }))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Banco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os bancos</SelectItem>
            {bancos.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filtros.status} onValueChange={v => setFiltros(f => ({ ...f, status: v }))}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filtros.vendedor} onValueChange={v => setFiltros(f => ({ ...f, vendedor: v }))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total de Propostas</p>
              <p className="text-2xl font-bold text-slate-800">{totalPropostas}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Valor Total (Aprovados)</p>
              <p className="text-xl font-bold text-slate-800">{fmt(valorTotalVendas)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Bike className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Motos</p>
              <p className="text-2xl font-bold text-slate-800">{totalMotos}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Car className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Carros</p>
              <p className="text-2xl font-bold text-slate-800">{totalCarros}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status das propostas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-5 h-5 text-slate-500" />
            Propostas por Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {statusCount.map(({ status, count }) => (
              <div key={status} className="text-center p-4 rounded-xl bg-slate-50 border">
                <p className="text-2xl font-bold text-slate-800">{count}</p>
                <span className={`text-xs px-2 py-1 rounded-full font-medium mt-1 inline-block ${STATUS_LABELS[status].color}`}>
                  {STATUS_LABELS[status].label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
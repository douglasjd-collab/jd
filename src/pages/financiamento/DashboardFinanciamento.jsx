import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Car, Bike, FileText, DollarSign, TrendingUp, RefreshCw, TrendingDown, Clock, CheckCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STATUS_LABELS = {
  em_analise: { label: 'Em Análise', color: '#f59e0b' },
  aguardando_documentacao: { label: 'Aguard. Documentação', color: '#3b82f6' },
  aprovado: { label: 'Aprovado', color: '#10b981' },
  reprovado: { label: 'Reprovado', color: '#ef4444' },
  contrato_emitido: { label: 'Contrato Emitido', color: '#8b5cf6' },
  pago_pelo_banco: { label: 'Pago pelo Banco', color: '#0ea5e9' },
  comissao_recebida: { label: 'Comissão Recebida', color: '#22c55e' },
  cancelado: { label: 'Cancelado', color: '#6b7280' },
};

const PERIODOS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Este ano' },
  { value: 'all', label: 'Todos' },
];

const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function DashboardFinanciamento({ user }) {
  const [propostas, setPropostas] = useState([]);
  const [comissoes, setComissoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState('30');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroTipo, setFiltroTipo] = useState('all');

  const empresaId = user?.empresa_id;

  const carregar = async () => {
    setLoading(true);
    const filtro = empresaId ? { empresa_id: empresaId } : {};
    const [p, c] = await Promise.all([
      base44.entities.FinanciamentoVeiculo.filter(filtro, '-created_date', 2000),
      base44.entities.ComissaoFinanciamento.filter(filtro, '-created_date', 1000),
    ]);
    setPropostas(p || []);
    setComissoes(c || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  const hoje = new Date();
  const filtradas = propostas.filter(p => {
    if (filtroStatus !== 'all' && p.status !== filtroStatus) return false;
    if (filtroTipo !== 'all' && p.tipo_veiculo !== filtroTipo) return false;
    if (filtroPeriodo !== 'all') {
      const dias = parseInt(filtroPeriodo);
      const limite = new Date();
      limite.setDate(hoje.getDate() - dias);
      const dataProposta = p.data_proposta ? new Date(p.data_proposta) : new Date(p.created_date);
      if (dataProposta < limite) return false;
    }
    return true;
  });

  // KPIs
  const totalVrFinanciado = filtradas.filter(p => ['aprovado', 'pago_pelo_banco', 'contrato_emitido', 'comissao_recebida'].includes(p.status))
    .reduce((s, p) => s + (p.valor_financiado || 0), 0);

  const totalTarifas = filtradas.reduce((s, p) => s + (p.tarifa_cadastral || 0), 0);
  const tarifasRecebidas = filtradas.filter(p => p.tarifa_cadastral_status === 'recebida').reduce((s, p) => s + (p.tarifa_cadastral || 0), 0);
  const totalCustos = filtradas.reduce((s, p) => s + (p.custos_operacionais || 0), 0);

  const comissoesFiltradas = comissoes.filter(c => {
    if (filtroPeriodo === 'all') return true;
    const dias = parseInt(filtroPeriodo);
    const limite = new Date();
    limite.setDate(hoje.getDate() - dias);
    const dt = c.created_date ? new Date(c.created_date) : hoje;
    return dt >= limite;
  });

  const comissoesAReceber = comissoesFiltradas.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.valor_comissao || 0), 0);
  const comissoesRecebidas = comissoesFiltradas.filter(c => c.status === 'recebida').reduce((s, c) => s + (c.valor_comissao || 0), 0);
  const comissoesAPagar = comissoesFiltradas.filter(c => c.status === 'recebida').reduce((s, c) => s + (c.valor_comissao_vendedor || 0), 0);

  const porStatus = Object.entries(STATUS_LABELS).map(([key, cfg]) => ({
    key, label: cfg.label, color: cfg.color,
    total: filtradas.filter(p => p.status === key).length,
  })).filter(s => s.total > 0);

  const cards = [
    { title: 'Total de Propostas', value: filtradas.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Valor Financiado', value: fmt(totalVrFinanciado), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Tarifas Recebidas', value: fmt(tarifasRecebidas), sub: `Total previsto: ${fmt(totalTarifas)}`, icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50' },
    { title: 'Custos Operacionais', value: fmt(totalCustos), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
    { title: 'Comissões a Receber', value: fmt(comissoesAReceber), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { title: 'Comissões Recebidas', value: fmt(comissoesRecebidas), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Comissões a Pagar', value: fmt(comissoesAPagar), sub: 'Para vendedores', icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Carros / Motos / Caminhões', value: `${filtradas.filter(p => p.tipo_veiculo === 'carro').length} / ${filtradas.filter(p => p.tipo_veiculo === 'moto').length} / ${filtradas.filter(p => p.tipo_veiculo === 'caminhao').length}`, icon: Car, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">Dashboard — Financiamentos</h2>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl border">
        <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
          <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            {PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger><SelectValue placeholder="Tipo de veículo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="carro">Carro</SelectItem>
            <SelectItem value="moto">Moto</SelectItem>
            <SelectItem value="caminhao">Caminhão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className="text-xl font-bold text-slate-800">{c.value}</p>
              <p className="text-xs text-slate-500 mt-1">{c.title}</p>
              {c.sub && <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status das propostas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Propostas por Status</CardTitle>
        </CardHeader>
        <CardContent>
          {porStatus.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma proposta encontrada</p>
          ) : (
            <div className="space-y-3">
              {porStatus.map(s => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-48 shrink-0">{s.label}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(4, (s.total / filtradas.length) * 100)}%`, backgroundColor: s.color }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-8 text-right">{s.total}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
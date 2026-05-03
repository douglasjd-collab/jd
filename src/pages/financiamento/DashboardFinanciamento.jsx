import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Car, Bike, FileText, DollarSign, TrendingUp, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const STATUS_LABELS = {
  em_analise: 'Em análise',
  aguardando_documentacao: 'Aguard. Documentação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  contrato_emitido: 'Contrato Emitido',
  pago: 'Pago / Finalizado',
  cancelado: 'Cancelado',
};

const STATUS_COLORS = {
  em_analise: '#f59e0b',
  aguardando_documentacao: '#3b82f6',
  aprovado: '#10b981',
  reprovado: '#ef4444',
  contrato_emitido: '#8b5cf6',
  pago: '#22c55e',
  cancelado: '#6b7280',
};

const PERIODOS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Este ano' },
  { value: 'all', label: 'Todos' },
];

function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

export default function DashboardFinanciamento({ user }) {
  const [propostas, setPropostas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filtroPeriodo, setFiltroPeriodo] = useState('30');
  const [filtroVendedor, setFiltroVendedor] = useState('all');
  const [filtroBanco, setFiltroBanco] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroTipo, setFiltroTipo] = useState('all');

  const empresaId = user?.empresa_id;

  const carregar = async () => {
    setLoading(true);
    const filtro = empresaId ? { empresa_id: empresaId } : {};
    const [p, v] = await Promise.all([
      base44.entities.FinanciamentoVeiculo.filter(filtro, '-created_date', 2000),
      base44.entities.Colaborador.filter(empresaId ? { empresa_id: empresaId } : {}, 'nome', 200),
    ]);
    setPropostas(p || []);
    setVendedores(v || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  // Filtrar
  const hoje = new Date();
  const filtradas = propostas.filter(p => {
    if (filtroVendedor !== 'all' && p.vendedor_id !== filtroVendedor) return false;
    if (filtroBanco !== 'all' && p.banco !== filtroBanco) return false;
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

  const totalPropostas = filtradas.length;
  const totalVendas = filtradas.filter(p => ['aprovado', 'pago', 'contrato_emitido'].includes(p.status))
    .reduce((s, p) => s + (p.valor_financiado || 0), 0);
  const totalMotos = filtradas.filter(p => p.tipo_veiculo === 'moto').length;
  const totalCarros = filtradas.filter(p => p.tipo_veiculo === 'carro').length;
  const totalCaminhoes = filtradas.filter(p => p.tipo_veiculo === 'caminhao').length;

  const porStatus = Object.entries(STATUS_LABELS).map(([key, label]) => ({
    status: key,
    label,
    total: filtradas.filter(p => p.status === key).length,
  })).filter(s => s.total > 0);

  const bancos = [...new Set(propostas.map(p => p.banco).filter(Boolean))];

  const cards = [
    { title: 'Total de Propostas', value: totalPropostas, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Valor Total (Aprovados)', value: fmt(totalVendas), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Financiamentos de Carros', value: totalCarros, icon: Car, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Financiamentos de Motos', value: totalMotos, icon: Bike, color: 'text-orange-600', bg: 'bg-orange-50' },
    { title: 'Financiamentos de Caminhões', value: totalCaminhoes, icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">Dashboard — Financiamento de Veículos</h2>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-white p-4 rounded-xl border">
        <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
          <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            {PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
          <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroBanco} onValueChange={setFiltroBanco}>
          <SelectTrigger><SelectValue placeholder="Banco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os bancos</SelectItem>
            {bancos.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-800">{c.value}</p>
              <p className="text-xs text-slate-500 mt-1">{c.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico por status */}
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
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-44 shrink-0">{s.label}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(4, (s.total / totalPropostas) * 100)}%`,
                        backgroundColor: STATUS_COLORS[s.status],
                      }}
                    />
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
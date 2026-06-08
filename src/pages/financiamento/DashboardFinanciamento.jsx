import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Car, Bike, Truck, FileText, TrendingUp, RefreshCw, Users, Building2, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

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
const fmtNumber = val => new Intl.NumberFormat('pt-BR').format(val || 0);

export default function DashboardFinanciamento({ user }) {
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState('30');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [filtroBanco, setFiltroBanco] = useState('all');
  const [filtroVendedor, setFiltroVendedor] = useState('all');

  const empresaId = user?.empresa_id;

  const carregar = async () => {
    setLoading(true);
    const filtro = empresaId ? { empresa_id: empresaId } : {};
    const p = await base44.entities.FinanciamentoVeiculo.filter(filtro, '-created_date', 2000);
    setPropostas(p || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  const hoje = new Date();
  const filtradas = useMemo(() => propostas.filter(p => {
    if (filtroStatus !== 'all' && p.status !== filtroStatus) return false;
    if (filtroTipo !== 'all' && p.tipo_veiculo !== filtroTipo) return false;
    if (filtroBanco !== 'all' && p.banco !== filtroBanco) return false;
    if (filtroVendedor !== 'all' && p.vendedor_nome !== filtroVendedor) return false;
    if (filtroPeriodo !== 'all') {
      const dias = parseInt(filtroPeriodo);
      const limite = new Date();
      limite.setDate(hoje.getDate() - dias);
      const dataProposta = p.data_proposta ? new Date(p.data_proposta) : new Date(p.created_date);
      if (dataProposta < limite) return false;
    }
    return true;
  }), [propostas, filtroStatus, filtroTipo, filtroBanco, filtroVendedor, filtroPeriodo]);

  // KPIs principais
  const totalPropostas = filtradas.length;
  const totalFinanciado = filtradas.filter(p => ['aprovado', 'pago_pelo_banco', 'contrato_emitido', 'comissao_recebida'].includes(p.status))
    .reduce((s, p) => s + (p.valor_financiado || 0), 0);
  
  const carros = filtradas.filter(p => p.tipo_veiculo === 'carro');
  const motos = filtradas.filter(p => p.tipo_veiculo === 'moto');
  const caminhoes = filtradas.filter(p => p.tipo_veiculo === 'caminhao');

  const emAndamento = filtradas.filter(p => ['em_analise', 'aguardando_documentacao', 'aprovado', 'contrato_emitido'].includes(p.status));
  const aprovados = filtradas.filter(p => p.status === 'aprovado' || p.status === 'pago_pelo_banco');
  const pagos = filtradas.filter(p => p.status === 'pago_pelo_banco' || p.status === 'comissao_recebida');

  // Dados únicos para filtros
  const bancos = [...new Set(propostas.map(p => p.banco).filter(Boolean))];
  const vendedores = [...new Set(propostas.map(p => p.vendedor_nome).filter(Boolean))];

  // Produção por mês
  const producaoPorMes = useMemo(() => {
    const meses = {};
    filtradas.forEach(p => {
      const data = p.data_proposta ? new Date(p.data_proposta) : new Date(p.created_date);
      const chave = `${data.getMonth() + 1}/${data.getFullYear().toString().slice(-2)}`;
      if (!meses[chave]) meses[chave] = { mes: chave, quantidade: 0, valor: 0 };
      meses[chave].quantidade += 1;
      meses[chave].valor += p.valor_financiado || 0;
    });
    return Object.values(meses).sort((a, b) => {
      const [mesA, anoA] = a.mes.split('/');
      const [mesB, anoB] = b.mes.split('/');
      return new Date(`20${anoA}`, mesA - 1) - new Date(`20${anoB}`, mesB - 1);
    });
  }, [filtradas]);

  // Ranking por vendedor
  const rankingVendedores = useMemo(() => {
    const porVendedor = {};
    filtradas.forEach(p => {
      const nome = p.vendedor_nome || 'Não informado';
      if (!porVendedor[nome]) porVendedor[nome] = { nome, quantidade: 0, valor: 0 };
      porVendedor[nome].quantidade += 1;
      porVendedor[nome].valor += p.valor_financiado || 0;
    });
    return Object.values(porVendedor)
      .map(v => ({ ...v, ticketMedio: v.valor / v.quantidade, participacao: totalFinanciado > 0 ? (v.valor / totalFinanciado) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [filtradas, totalFinanciado]);

  // Ranking por banco
  const rankingBancos = useMemo(() => {
    const porBanco = {};
    filtradas.forEach(p => {
      const banco = p.banco || 'Outros';
      if (!porBanco[banco]) porBanco[banco] = { banco, quantidade: 0, valor: 0 };
      porBanco[banco].quantidade += 1;
      porBanco[banco].valor += p.valor_financiado || 0;
    });
    return Object.values(porBanco)
      .map(b => ({ ...b, ticketMedio: b.valor / b.quantidade, participacao: totalFinanciado > 0 ? (b.valor / totalFinanciado) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [filtradas, totalFinanciado]);

  // Produção por tipo de veículo
  const producaoPorTipo = [
    { tipo: 'Carros', quantidade: carros.length, valor: carros.reduce((s, p) => s + (p.valor_financiado || 0), 0), icon: Car },
    { tipo: 'Motos', quantidade: motos.length, valor: motos.reduce((s, p) => s + (p.valor_financiado || 0), 0), icon: Bike },
    { tipo: 'Caminhões', quantidade: caminhoes.length, valor: caminhoes.reduce((s, p) => s + (p.valor_financiado || 0), 0), icon: Truck },
  ];

  // Propostas por status
  const porStatus = Object.entries(STATUS_LABELS).map(([key, cfg]) => ({
    key, label: cfg.label, color: cfg.color,
    quantidade: filtradas.filter(p => p.status === key).length,
    valor: filtradas.filter(p => p.status === key).reduce((s, p) => s + (p.valor_financiado || 0), 0),
  })).filter(s => s.quantidade > 0);

  // Últimas propostas
  const ultimasPropostas = filtradas.slice(0, 10);

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 bg-white p-4 rounded-xl border">
        <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
          <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            {PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger><SelectValue placeholder="Tipo de veículo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="carro">Carro</SelectItem>
            <SelectItem value="moto">Moto</SelectItem>
            <SelectItem value="caminhao">Caminhão</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroBanco} onValueChange={setFiltroBanco}>
          <SelectTrigger><SelectValue placeholder="Banco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos bancos</SelectItem>
            {bancos.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
          <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {vendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Cards KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{fmtNumber(totalPropostas)}</p>
            <p className="text-xs text-slate-500 mt-1">Total de Propostas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{fmt(totalFinanciado)}</p>
            <p className="text-xs text-slate-500 mt-1">Total Financiado</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
              <Car className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{carros.length}</p>
            <p className="text-xs text-slate-500 mt-1">Financiamentos de Carros</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmt(carros.reduce((s, p) => s + (p.valor_financiado || 0), 0))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
              <Bike className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{motos.length}</p>
            <p className="text-xs text-slate-500 mt-1">Financiamentos de Motos</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmt(motos.reduce((s, p) => s + (p.valor_financiado || 0), 0))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mb-3">
              <Truck className="w-5 h-5 text-slate-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{caminhoes.length}</p>
            <p className="text-xs text-slate-500 mt-1">Financiamentos de Caminhões</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmt(caminhoes.reduce((s, p) => s + (p.valor_financiado || 0), 0))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{emAndamento.length}</p>
            <p className="text-xs text-slate-500 mt-1">Em Andamento</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmt(emAndamento.reduce((s, p) => s + (p.valor_financiado || 0), 0))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{aprovados.length}</p>
            <p className="text-xs text-slate-500 mt-1">Aprovados</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmt(aprovados.reduce((s, p) => s + (p.valor_financiado || 0), 0))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-3">
              <Building2 className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{pagos.length}</p>
            <p className="text-xs text-slate-500 mt-1">Pagos pelo Banco</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmt(pagos.reduce((s, p) => s + (p.valor_financiado || 0), 0))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Produção por tipo de veículo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {producaoPorTipo.map(item => (
          <Card key={item.tipo}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  item.tipo === 'Carros' ? 'bg-amber-50' : item.tipo === 'Motos' ? 'bg-purple-50' : 'bg-slate-50'
                }`}>
                  <item.icon className={`w-5 h-5 ${
                    item.tipo === 'Carros' ? 'text-amber-600' : item.tipo === 'Motos' ? 'text-purple-600' : 'text-slate-600'
                  }`} />
                </div>
                <p className="font-semibold text-slate-700">{item.tipo}</p>
              </div>
              <p className="text-2xl font-bold text-slate-800">{fmtNumber(item.quantidade)}</p>
              <p className="text-xs text-slate-500 mt-1">Veículos financiados</p>
              <p className="text-sm font-semibold text-slate-700 mt-2">{fmt(item.valor)}</p>
              <p className="text-xs text-slate-400">Valor total financiado</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico de Produção por Mês */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produção de Financiamentos por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          {producaoPorMes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nenhum dado no período</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={producaoPorMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis yAxisId="left" orientation="left" />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value, name) => 
                    name === 'Quantidade' ? fmtNumber(value) : fmt(value)
                  }
                />
                <Legend />
                <Bar yAxisId="left" dataKey="quantidade" name="Quantidade" fill="#3b82f6" />
                <Bar yAxisId="right" dataKey="valor" name="Valor Financiado" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking por Vendedor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Ranking por Vendedor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rankingVendedores.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nenhum vendedor no período</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {rankingVendedores.slice(0, 10).map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-3">
                    <span className="w-6 text-center font-bold text-slate-600">{i + 1}º</span>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700 truncate">{v.nome}</p>
                      <p className="text-xs text-slate-500">
                        {fmtNumber(v.quantidade)} financiamentos • {fmt(v.valor)} • {v.participacao.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking por Banco */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-green-600" />
              Ranking por Banco/Parceiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rankingBancos.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nenhum banco no período</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {rankingBancos.slice(0, 10).map((b, i) => (
                  <div key={b.banco} className="flex items-center gap-3">
                    <span className="w-6 text-center font-bold text-slate-600">{i + 1}º</span>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700 truncate">{b.banco}</p>
                      <p className="text-xs text-slate-500">
                        {fmtNumber(b.quantidade)} financiamentos • {fmt(b.valor)} • {b.participacao.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Propostas por Status */}
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
                      style={{ width: `${Math.max(4, (s.quantidade / filtradas.length) * 100)}%`, backgroundColor: s.color }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-8 text-right">{s.quantidade}</span>
                  <span className="text-xs text-slate-500 w-24 text-right">{fmt(s.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimas Propostas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas Propostas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Data</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Veículo</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Banco</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Vendedor</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Valor</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {ultimasPropostas.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">Nenhuma proposta encontrada</td></tr>
                ) : ultimasPropostas.map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{p.data_proposta ? new Date(p.data_proposta + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{p.cliente_nome}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.tipo_veiculo === 'carro' ? '🚗' : p.tipo_veiculo === 'moto' ? '🏍️' : '🚛'} {p.veiculo_modelo}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.banco || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.vendedor_nome || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(p.valor_financiado)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        STATUS_LABELS[p.status]?.color || 'bg-slate-100 text-slate-600'
                      }`}>
                        {STATUS_LABELS[p.status]?.label || p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
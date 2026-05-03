import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#22c55e', '#6b7280'];

const TIPO_LABELS = { carro: 'Carro', moto: 'Moto', caminhao: 'Caminhão' };
const STATUS_LABELS = {
  em_analise: 'Em análise', aguardando_documentacao: 'Aguard. Doc.', aprovado: 'Aprovado',
  reprovado: 'Reprovado', contrato_emitido: 'Contrato', pago: 'Pago', cancelado: 'Cancelado',
};

function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

export default function RelatoriosFinanciamento({ user }) {
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('30');

  const empresaId = user?.empresa_id;

  useEffect(() => {
    const f = empresaId ? { empresa_id: empresaId } : {};
    base44.entities.FinanciamentoVeiculo.filter(f, '-created_date', 2000).then(d => {
      setPropostas(d || []);
      setLoading(false);
    });
  }, [empresaId]);

  const hoje = new Date();
  const filtradas = propostas.filter(p => {
    if (periodo === 'all') return true;
    const dias = parseInt(periodo);
    const limite = new Date();
    limite.setDate(hoje.getDate() - dias);
    const d = p.data_proposta ? new Date(p.data_proposta) : new Date(p.created_date);
    return d >= limite;
  });

  // Por tipo
  const porTipo = ['carro', 'moto', 'caminhao'].map(t => ({
    name: TIPO_LABELS[t],
    total: filtradas.filter(p => p.tipo_veiculo === t).length,
    valor: filtradas.filter(p => p.tipo_veiculo === t).reduce((s, p) => s + (p.valor_financiado || 0), 0),
  }));

  // Por status
  const porStatus = Object.entries(STATUS_LABELS).map(([k, v], i) => ({
    name: v,
    value: filtradas.filter(p => p.status === k).length,
    fill: COLORS[i],
  })).filter(s => s.value > 0);

  // Por banco
  const bancos = [...new Set(filtradas.map(p => p.banco).filter(Boolean))];
  const porBanco = bancos.map(b => ({
    name: b,
    total: filtradas.filter(p => p.banco === b).length,
    valor: filtradas.filter(p => p.banco === b).reduce((s, p) => s + (p.valor_financiado || 0), 0),
  })).sort((a, b) => b.valor - a.valor).slice(0, 8);

  // Totais
  const totalComissao = filtradas.reduce((s, p) => s + (p.valor_comissao_recebida || 0), 0);
  const totalFinanciado = filtradas.filter(p => ['aprovado', 'pago', 'contrato_emitido'].includes(p.status))
    .reduce((s, p) => s + (p.valor_financiado || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">Relatórios — Financiamento de Veículos</h2>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Este ano</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Propostas', value: filtradas.length },
          { label: 'Aprovadas/Pagas', value: filtradas.filter(p => ['aprovado', 'pago'].includes(p.status)).length },
          { label: 'Valor Financiado', value: fmt(totalFinanciado) },
          { label: 'Comissão Total', value: fmt(totalComissao) },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{c.value}</p>
              <p className="text-xs text-slate-500 mt-1">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Por tipo */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Por Tipo de Veículo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porTipo}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por status */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Por Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  {porStatus.map((s, i) => <Cell key={i} fill={s.fill} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por banco */}
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm">Por Banco — Valor Financiado</CardTitle></CardHeader>
          <CardContent>
            {porBanco.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Sem dados suficientes</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porBanco}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => 'R$' + (v / 1000).toFixed(0) + 'k'} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Bar dataKey="valor" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
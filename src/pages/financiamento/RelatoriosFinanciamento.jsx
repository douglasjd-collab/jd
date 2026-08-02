import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList } from 'recharts';

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#22c55e', '#6b7280', '#06b6d4'];

const TIPO_LABELS = { carro: 'Carro', moto: 'Moto', caminhao: 'Caminhão' };
const STATUS_LABELS = {
  em_analise: 'Em análise', aguardando_documentacao: 'Aguard. Doc.', aprovado: 'Aprovado',
  reprovado: 'Reprovado', contrato_emitido: 'Contrato', pago: 'Pago',
  pago_pelo_banco: 'Pago pelo banco', cancelado: 'Cancelado',
};

function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val) || 0);
}

function fmtGrafico(val) {
  const numero = Number(val) || 0;
  if (Math.abs(numero) >= 1000000) return `R$ ${(numero / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(numero) >= 1000) return `R$ ${(numero / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return fmt(numero);
}

function chaveMesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function chaveMesProposta(proposta) {
  const valor = proposta.data_proposta || proposta.created_date;
  if (!valor) return '';
  const texto = String(valor);
  if (/^\d{4}-\d{2}/.test(texto)) return texto.slice(0, 7);
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function nomeMes(chave, atual) {
  const data = new Date(`${chave}-01T12:00:00`);
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(data);
  const formatado = nome.charAt(0).toUpperCase() + nome.slice(1);
  return chave === atual ? `Mês atual — ${formatado}` : formatado;
}

function nomeBanco(valor) {
  const informado = String(valor || 'Não informado').trim();
  const chave = informado.toLocaleLowerCase('pt-BR');
  if (['bv', 'banco bv'].includes(chave)) return 'BV';
  return informado;
}

export default function RelatoriosFinanciamento({ user }) {
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mesSelecionado, setMesSelecionado] = useState(chaveMesAtual);

  const empresaId = user?.empresa_id;
  const mesAtual = chaveMesAtual();

  useEffect(() => {
    const f = empresaId ? { empresa_id: empresaId } : {};
    base44.entities.FinanciamentoVeiculo.filter(f, '-created_date', 2000)
      .then(d => setPropostas(d || []))
      .finally(() => setLoading(false));
  }, [empresaId]);

  const opcoesMes = [...new Set([mesAtual, ...propostas.map(chaveMesProposta).filter(Boolean)])]
    .sort((a, b) => b.localeCompare(a));
  const mesSelecionadoLabel = nomeMes(mesSelecionado, mesAtual);
  const filtradas = propostas.filter(p => chaveMesProposta(p) === mesSelecionado);

  const porTipo = ['carro', 'moto', 'caminhao'].map(t => {
    const itens = filtradas.filter(p => p.tipo_veiculo === t);
    return {
      name: TIPO_LABELS[t],
      total: itens.length,
      valor: itens.reduce((s, p) => s + (Number(p.valor_financiado) || 0), 0),
    };
  });

  const porStatus = Object.entries(STATUS_LABELS).map(([status, label], index) => {
    const itens = filtradas.filter(p => p.status === status);
    return {
      name: label,
      total: itens.length,
      valor: itens.reduce((s, p) => s + (Number(p.valor_financiado) || 0), 0),
      fill: COLORS[index % COLORS.length],
    };
  }).filter(item => item.valor > 0);

  const porBanco = Object.values(filtradas.reduce((acumulado, proposta) => {
    const banco = nomeBanco(proposta.banco);
    if (!acumulado[banco]) acumulado[banco] = { name: banco, total: 0, valor: 0 };
    acumulado[banco].total += 1;
    acumulado[banco].valor += Number(proposta.valor_financiado) || 0;
    return acumulado;
  }, {})).sort((a, b) => b.valor - a.valor);

  const statusConcluidos = ['aprovado', 'pago', 'pago_pelo_banco', 'contrato_emitido'];
  const totalComissao = filtradas.reduce((s, p) => s + (Number(p.valor_comissao_recebida) || 0), 0);
  const totalFinanciado = filtradas.reduce((s, p) => s + (Number(p.valor_financiado) || 0), 0);
  const totalConcluidas = filtradas.filter(p => statusConcluidos.includes(p.status)).length;

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Carregando relatório...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Relatórios — Financiamento de Veículos</h2>
          <p className="text-sm text-slate-500 mt-1">Produção de {mesSelecionadoLabel.toLowerCase()}</p>
        </div>
        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {opcoesMes.map(mes => (
              <SelectItem key={mes} value={mes}>{nomeMes(mes, mesAtual)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Propostas no Mês', value: filtradas.length },
          { label: 'Aprovadas/Pagas', value: totalConcluidas },
          { label: 'Produção do Mês', value: fmt(totalFinanciado) },
          { label: 'Comissão do Mês', value: fmt(totalComissao) },
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
        <Card>
          <CardHeader><CardTitle className="text-sm">Produção por Tipo de Veículo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={porTipo} margin={{ top: 25, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtGrafico} width={72} />
                <Tooltip formatter={(valor, nome, item) => [fmt(valor), `${item.payload.total} proposta(s)`]} />
                <Bar dataKey="valor" name="Produção" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="valor" position="top" formatter={fmtGrafico} className="fill-slate-700 text-[11px]" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Produção por Status</CardTitle></CardHeader>
          <CardContent>
            {porStatus.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-20">Sem produção no mês selecionado</p>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={porStatus}
                    dataKey="valor"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={72}
                    label={({ value }) => fmtGrafico(value)}
                  >
                    {porStatus.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(valor, nome, item) => [fmt(valor), `${nome} — ${item.payload.total} proposta(s)`]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Produção por Bancos — {mesSelecionadoLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {porBanco.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">Sem produção no mês selecionado</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porBanco} margin={{ top: 28, right: 15, left: 10, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtGrafico} width={75} />
                  <Tooltip formatter={(valor, nome, item) => [fmt(valor), `${item.payload.total} proposta(s)`]} />
                  <Bar dataKey="valor" name="Produção" fill="#10b981" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="valor" position="top" formatter={fmtGrafico} className="fill-slate-700 text-[11px]" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

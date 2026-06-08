import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Target, Award, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumber = v => (v || 0).toLocaleString('pt-BR');

export default function GraficoProducao({ 
  dados, 
  titulo, 
  subtitle,
  tipo = 'consorcio', // 'consorcio' ou 'emprestimo'
  meta = 100, // meta de quantidade
}) {
  const [modoVisualizacao, setModoVisualizacao] = useState('mensal');

  // Processar dados baseado no modo de visualização
  const dadosProcessados = useMemo(() => {
    if (modoVisualizacao === 'mensal') return dados.slice(-6); // últimos 6 meses
    if (modoVisualizacao === 'trimestral') {
      // Agrupar por trimestre
      const trimestres = {};
      dados.forEach(d => {
        const mes = new Date(d.mesKey + '-01');
        const tri = `T${Math.floor(mes.getMonth() / 3) + 1}/${mes.getFullYear()}`;
        if (!trimestres[tri]) trimestres[tri] = { name: tri, quantidade: 0, valor: 0, mesKey: d.mesKey };
        trimestres[tri].quantidade += d.quantidade;
        trimestres[tri].valor += d.valor;
      });
      return Object.values(trimestres).slice(-4); // últimos 4 trimestres
    }
    if (modoVisualizacao === 'semestral') {
      const semestres = {};
      dados.forEach(d => {
        const mes = new Date(d.mesKey + '-01');
        const sem = `S${mes.getMonth() < 6 ? 1 : 2}/${mes.getFullYear()}`;
        if (!semestres[sem]) semestres[sem] = { name: sem, quantidade: 0, valor: 0, mesKey: d.mesKey };
        semestres[sem].quantidade += d.quantidade;
        semestres[sem].valor += d.valor;
      });
      return Object.values(semestres).slice(-2);
    }
    if (modoVisualizacao === 'anual') {
      const anos = {};
      dados.forEach(d => {
        const ano = d.mesKey.slice(0, 4);
        if (!anos[ano]) anos[ano] = { name: ano, quantidade: 0, valor: 0, mesKey: d.mesKey };
        anos[ano].quantidade += d.quantidade;
        anos[ano].valor += d.valor;
      });
      return Object.values(anos).slice(-3);
    }
    if (modoVisualizacao === 'acumulado') {
      let qtdAcum = 0, valAcum = 0;
      return dados.map(d => {
        qtdAcum += d.quantidade;
        valAcum += d.valor;
        return { ...d, quantidade: qtdAcum, valor: valAcum, name: `Acum. ${d.name}` };
      });
    }
    return dados;
  }, [dados, modoVisualizacao]);

  // Indicadores
  const indicadores = useMemo(() => {
    const qtdTotal = dadosProcessados.reduce((s, d) => s + d.quantidade, 0);
    const valTotal = dadosProcessados.reduce((s, d) => s + d.valor, 0);
    const ticketMedio = qtdTotal > 0 ? valTotal / qtdTotal : 0;
    const melhorMes = dadosProcessados.reduce((prev, curr) => curr.quantidade > prev.quantidade ? curr : prev, dadosProcessados[0] || {});
    const metaAtingida = meta > 0 ? Math.min((qtdTotal / meta) * 100, 100) : 0;

    // Crescimento
    const mesAtual = dadosProcessados[dadosProcessados.length - 1];
    const mesAnterior = dadosProcessados[dadosProcessados.length - 2];
    const crescimentoMes = mesAnterior && mesAtual?.quantidade > 0 
      ? ((mesAtual.quantidade - mesAnterior.quantidade) / mesAnterior.quantidade) * 100 
      : 0;

    return {
      qtdTotal,
      valTotal,
      ticketMedio,
      melhorMes,
      metaAtingida,
      crescimentoMes,
      mesAtual,
    };
  }, [dadosProcessados, meta]);

  const botoesModo = [
    { key: 'mensal', label: 'Mensal' },
    { key: 'trimestral', label: 'Trimestral' },
    { key: 'semestral', label: 'Semestral' },
    { key: 'anual', label: 'Anual' },
    { key: 'acumulado', label: 'Acumulado' },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{titulo}</CardTitle>
            {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          </div>
          <div className="flex gap-1 flex-wrap">
            {botoesModo.map(btn => (
              <Button
                key={btn.key}
                size="sm"
                variant={modoVisualizacao === btn.key ? 'default' : 'outline'}
                onClick={() => setModoVisualizacao(btn.key)}
                className={`h-7 text-xs px-2 ${modoVisualizacao === btn.key ? 'bg-[#23BE84] hover:bg-[#1da570]' : ''}`}
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Cards de Indicadores */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-semibold">Quantidade Total</p>
            <p className="text-lg font-bold text-blue-800">{fmtNumber(indicadores.qtdTotal)}</p>
            <p className="text-xs text-blue-600">{tipo === 'consorcio' ? 'cotas' : 'contratos'}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-3 border border-green-100">
            <p className="text-xs text-green-600 font-semibold">Valor Total Produzido</p>
            <p className="text-lg font-bold text-green-800">{fmt(indicadores.valTotal)}</p>
            <p className="text-xs text-green-600">{tipo === 'consorcio' ? 'crédito' : 'liberado'}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
            <p className="text-xs text-purple-600 font-semibold">Ticket Médio</p>
            <p className="text-lg font-bold text-purple-800">{fmt(indicadores.ticketMedio)}</p>
            <p className="text-xs text-purple-600">por {tipo === 'consorcio' ? 'cota' : 'contrato'}</p>
          </div>

          <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
            <p className="text-xs text-amber-600 font-semibold flex items-center gap-1">
              <Award className="w-3 h-3" /> Melhor Mês
            </p>
            <p className="text-lg font-bold text-amber-800">{indicadores.melhorMes?.name || '—'}</p>
            <p className="text-xs text-amber-600">{fmtNumber(indicadores.melhorMes?.quantidade)} {tipo === 'consorcio' ? 'vendas' : 'propostas'}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p className="text-xs text-slate-600 font-semibold flex items-center gap-1">
              <Target className="w-3 h-3" /> Meta Atingida
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-lg font-bold text-slate-800">{indicadores.metaAtingida.toFixed(0)}%</p>
              <Progress value={indicadores.metaAtingida} className="h-2 flex-1" />
            </div>
            <p className="text-xs text-slate-500">de {fmtNumber(meta)} {tipo === 'consorcio' ? 'cotas' : 'contratos'}</p>
          </div>
        </div>

        {/* Gráfico */}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dadosProcessados} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                fontSize={11}
                tick={{ fill: '#64748b' }}
              />
              <YAxis 
                yAxisId="left"
                orientation="left" 
                stroke="#3b82f6" 
                fontSize={11}
                label={{ value: 'Quantidade', angle: -90, position: 'insideLeft', fill: '#3b82f6' }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right" 
                stroke="#22c55e" 
                fontSize={11}
                tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px'
                }}
                formatter={(value, name) => {
                  if (name === 'quantidade') return [fmtNumber(value), 'Quantidade'];
                  if (name === 'valor') return [fmt(value), 'Valor'];
                  return [value, name];
                }}
              />
              <Legend />
              {/* Barras - Quantidade */}
              <Bar 
                yAxisId="left"
                dataKey="quantidade" 
                name="Quantidade" 
                fill="#3b82f6" 
                radius={[4, 4, 0, 0]}
                barSize={40}
                label={{ 
                  position: 'top', 
                  fill: '#3b82f6', 
                  fontSize: 11, 
                  formatter: (v) => fmtNumber(v)
                }}
              />
              {/* Linha - Valor */}
              <Line 
                yAxisId="right"
                dataKey="valor" 
                name="Valor" 
                stroke="#22c55e" 
                strokeWidth={3}
                dot={{ fill: '#22c55e', strokeWidth: 2, r: 5, stroke: '#fff' }}
                activeDot={{ r: 7, strokeWidth: 3 }}
                label={{ 
                  position: 'top', 
                  fill: '#22c55e', 
                  fontSize: 10, 
                  formatter: (v) => `R$ ${(v/1000).toFixed(0)}k`,
                  offset: 5
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Resumo por Mês */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-3 border-t">
          {dadosProcessados.map((d, i) => (
            <div key={i} className="text-center">
              <p className="text-xs font-semibold text-slate-600">{d.name}</p>
              <p className="text-sm text-blue-600 font-bold">{fmtNumber(d.quantidade)}</p>
              <p className="text-xs text-green-600">{fmt(d.valor)}</p>
            </div>
          ))}
        </div>

        {/* Indicadores Laterais de Crescimento */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${indicadores.crescimentoMes >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              {indicadores.crescimentoMes >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500">Crescimento vs Mês Anterior</p>
              <p className={`text-lg font-bold ${indicadores.crescimentoMes >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {indicadores.crescimentoMes >= 0 ? '+' : ''}{indicadores.crescimentoMes.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Mês Atual</p>
              <p className="text-lg font-bold text-blue-600">{fmtNumber(indicadores.mesAtual?.quantidade)} {tipo === 'consorcio' ? 'vendas' : 'propostas'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Valor Mês Atual</p>
              <p className="text-lg font-bold text-purple-600">{fmt(indicadores.mesAtual?.valor)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
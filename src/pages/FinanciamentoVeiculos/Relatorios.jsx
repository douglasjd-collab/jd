import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_LABELS = {
  em_analise: 'Em análise', aguardando_documentacao: 'Aguardando Doc.',
  aprovado: 'Aprovado', reprovado: 'Reprovado', contrato_emitido: 'Contrato Emitido',
  pago: 'Pago', cancelado: 'Cancelado',
};
const CORES = ['#10353C', '#23BE84', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#6b7280'];

export default function RelatoriosFinanciamento() {
  const [user, setUser] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [periodo, setPeriodo] = useState('6');

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  useEffect(() => {
    if (!user) return;
    const filtro = user?.empresa_id ? { empresa_id: user.empresa_id } : {};
    base44.entities.FinanciamentoVeiculo.filter(filtro, '-data_proposta', 2000).then(setPropostas);
  }, [user]);

  const meses = parseInt(periodo);
  const propostasPeriodo = propostas.filter(p => {
    if (!p.data_proposta) return false;
    const inicio = startOfMonth(subMonths(new Date(), meses - 1));
    const fim = endOfMonth(new Date());
    return isWithinInterval(parseISO(p.data_proposta), { start: inicio, end: fim });
  });

  // Dados por mês
  const dadosMensais = Array.from({ length: meses }, (_, i) => {
    const date = subMonths(new Date(), meses - 1 - i);
    const mesStr = format(date, 'MMM/yy', { locale: ptBR });
    const propostasMes = propostas.filter(p => {
      if (!p.data_proposta) return false;
      const d = parseISO(p.data_proposta);
      return isWithinInterval(d, { start: startOfMonth(date), end: endOfMonth(date) });
    });
    return {
      mes: mesStr,
      total: propostasMes.length,
      aprovadas: propostasMes.filter(p => ['aprovado', 'pago', 'contrato_emitido'].includes(p.status)).length,
      valor: propostasMes.reduce((acc, p) => acc + (p.valor_financiado || 0), 0) / 1000,
    };
  });

  // Por status
  const dadosStatus = Object.entries(STATUS_LABELS).map(([k, label]) => ({
    name: label,
    value: propostasPeriodo.filter(p => p.status === k).length,
  })).filter(d => d.value > 0);

  // Por tipo
  const dadosTipo = [
    { name: 'Carro', value: propostasPeriodo.filter(p => p.tipo_veiculo === 'carro').length },
    { name: 'Moto', value: propostasPeriodo.filter(p => p.tipo_veiculo === 'moto').length },
    { name: 'Caminhão', value: propostasPeriodo.filter(p => p.tipo_veiculo === 'caminhao').length },
  ].filter(d => d.value > 0);

  const fmt = (v) => `R$ ${(v || 0).toLocaleString('pt-BR')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Relatórios — Financiamento</h1>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Últimos 3 meses</SelectItem>
            <SelectItem value="6">Últimos 6 meses</SelectItem>
            <SelectItem value="12">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Propostas por Mês</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dadosMensais}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total" fill="#10353C" radius={[4, 4, 0, 0]} />
                <Bar dataKey="aprovadas" name="Aprovadas" fill="#23BE84" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Valor Financiado por Mês (R$ mil)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dadosMensais}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`R$ ${v.toFixed(0)}k`]} />
                <Bar dataKey="valor" name="Valor (R$ mil)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={dadosStatus} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {dadosStatus.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Tipo de Veículo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={dadosTipo} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {dadosTipo.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
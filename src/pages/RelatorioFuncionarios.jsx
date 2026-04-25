import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DollarSign, Users, TrendingDown, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function RelatorioFuncionarios() {
  const [user, setUser] = useState(null);
  const [folhas, setFolhas] = useState([]);
  const [adiantamentos, setAdiantamentos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [mesF, setMesF] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      carregar(me);
    });
  }, []);

  const carregar = async (me) => {
    setLoading(true);
    const filtro = me?.empresa_id ? { empresa_id: me.empresa_id } : {};
    const [f, a, c] = await Promise.all([
      base44.entities.FolhaSalarial.filter(filtro, '-created_date', 1000),
      base44.entities.AdiantamentoFuncionario.filter(filtro, '-created_date', 500),
      base44.entities.FuncionarioColaborador.filter(filtro, 'nome', 200)
    ]);
    setFolhas(f);
    setAdiantamentos(a);
    setColaboradores(c);
    setLoading(false);
  };

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const folhasFiltradas = mesF ? folhas.filter(f => f.mes_referencia?.includes(mesF)) : folhas;
  const totalSalarios = folhasFiltradas.reduce((s, f) => s + (f.valor_liquido || 0), 0);
  const totalAdiantamentos = adiantamentos.reduce((s, a) => s + (a.valor || 0), 0);
  const totalAdiantamentosPendentes = adiantamentos.filter(a => a.status === 'Pendente').reduce((s, a) => s + (a.valor || 0), 0);

  // Por colaborador
  const porColaborador = colaboradores.map(c => {
    const fs = folhasFiltradas.filter(f => f.colaborador_id === c.id);
    const total = fs.reduce((s, f) => s + (f.valor_liquido || 0), 0);
    const adi = adiantamentos.filter(a => a.colaborador_id === c.id).reduce((s, a) => s + (a.valor || 0), 0);
    return { nome: c.nome?.split(' ')[0], total, adiantamentos: adi, folhas: fs.length };
  }).filter(c => c.total > 0 || c.adiantamentos > 0).sort((a, b) => b.total - a.total);

  // Por mês
  const meses = {};
  folhas.forEach(f => {
    if (!f.mes_referencia) return;
    meses[f.mes_referencia] = (meses[f.mes_referencia] || 0) + (f.valor_liquido || 0);
  });
  const porMes = Object.entries(meses).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Relatórios - Funcionários</h1>
        <p className="text-slate-500 text-sm">Análise de custos com pessoal</p>
      </div>

      <div className="flex gap-3">
        <Input className="w-36" placeholder="Mês (04/2026)" value={mesF} onChange={e => setMesF(e.target.value)} />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-600" />
              <p className="text-xs text-slate-500">Total em Salários</p>
            </div>
            <p className="text-xl font-bold text-green-700">{fmt(totalSalarios)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-orange-500" />
              <p className="text-xs text-slate-500">Total Adiantamentos</p>
            </div>
            <p className="text-xl font-bold text-orange-600">{fmt(totalAdiantamentos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs text-slate-500">Adiant. Pendentes</p>
            </div>
            <p className="text-xl font-bold text-red-600">{fmt(totalAdiantamentosPendentes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-slate-500">Colaboradores Ativos</p>
            </div>
            <p className="text-xl font-bold text-blue-700">{colaboradores.filter(c => c.status === 'Ativo').length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico por mês */}
      {porMes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo com Pessoal por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} />
                <Bar dataKey="total" fill="#10353C" radius={[4,4,0,0]} name="Total Salários" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Por colaborador */}
      {porColaborador.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo por Colaborador</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-600">Colaborador</th>
                  <th className="text-left p-3 font-medium text-slate-600">Folhas</th>
                  <th className="text-left p-3 font-medium text-slate-600">Total Salários</th>
                  <th className="text-left p-3 font-medium text-slate-600">Adiantamentos</th>
                  <th className="text-left p-3 font-medium text-slate-600">Custo Total</th>
                </tr>
              </thead>
              <tbody>
                {porColaborador.map((c, i) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-medium">{c.nome}</td>
                    <td className="p-3 text-slate-500">{c.folhas}</td>
                    <td className="p-3 text-green-700 font-medium">{fmt(c.total)}</td>
                    <td className="p-3 text-orange-600">{fmt(c.adiantamentos)}</td>
                    <td className="p-3 font-bold">{fmt(c.total + c.adiantamentos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
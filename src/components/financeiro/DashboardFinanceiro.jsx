import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, DollarSign, AlertCircle, Clock, Wallet, Users, BarChart2, Building2, Trophy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import moment from 'moment';
import 'moment/locale/pt-br';
moment.locale('pt-br');

const BRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const CORES = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#64748b','#ec4899'];

const SERVICOS = {
  consorcio: 'Consórcio',
  emprestimo: 'Empréstimos',
  financiamento: 'Financiamentos',
  seguro: 'Seguros',
};

export default function DashboardFinanceiro({ despesas, receitas, comissoes, filiais = [] }) {
  const hoje = moment().format('YYYY-MM-DD');
  const [filterFilial, setFilterFilial] = useState('todas');
  const [filterPeriodo, setFilterPeriodo] = useState('mes_atual');

  // Filtrar por filial e período
  const filtrarItems = (items, campoData) => {
    let list = items;
    if (filterFilial !== 'todas') list = list.filter(i => i.filial_id === filterFilial);
    const periodoFiltro = getPeriodoRange();
    if (periodoFiltro) {
      list = list.filter(i => {
        const d = i[campoData] || i.data || '';
        return d >= periodoFiltro.inicio && d <= periodoFiltro.fim;
      });
    }
    return list;
  };

  const getPeriodoRange = () => {
    const m = moment();
    if (filterPeriodo === 'mes_atual') return { inicio: m.startOf('month').format('YYYY-MM-DD'), fim: m.endOf('month').format('YYYY-MM-DD') };
    if (filterPeriodo === 'trimestre') return { inicio: m.subtract(3,'months').format('YYYY-MM-DD'), fim: moment().format('YYYY-MM-DD') };
    if (filterPeriodo === 'ano_atual') return { inicio: m.startOf('year').format('YYYY-MM-DD'), fim: m.endOf('year').format('YYYY-MM-DD') };
    return null; // todos
  };

  const receitasFiltradas = useMemo(() => filtrarItems(receitas, 'data'), [receitas, filterFilial, filterPeriodo]);
  const despesasFiltradas = useMemo(() => filtrarItems(despesas, 'data'), [despesas, filterFilial, filterPeriodo]);

  const receitasRealizadas = useMemo(() => receitasFiltradas.filter(r => r.status === 'recebida').reduce((s,r)=>s+(r.valor||0),0), [receitasFiltradas]);
  const receitasPrevistas = useMemo(() => receitasFiltradas.filter(r => !['recebida','cancelada'].includes(r.status)).reduce((s,r)=>s+(r.valor||0),0), [receitasFiltradas]);
  const totalDespesas = useMemo(() => despesasFiltradas.filter(d=>['pago','paga'].includes(d.status)).reduce((s,d)=>s+(d.valor||0),0), [despesasFiltradas]);
  const comissoesPagas = useMemo(() => comissoes.filter(c=>c.status_pagamento==='pago').reduce((s,c)=>s+(c.valor_vendedor||0),0), [comissoes]);
  const lucroLiquido = receitasRealizadas - totalDespesas - comissoesPagas;
  const contasReceber = useMemo(() => receitasFiltradas.filter(r=>!['recebida','cancelada'].includes(r.status)).reduce((s,r)=>s+(r.valor||0),0), [receitasFiltradas]);
  const contasPagar = useMemo(() => despesasFiltradas.filter(d=>!['pago','paga'].includes(d.status)).reduce((s,d)=>s+(d.valor||0),0), [despesasFiltradas]);
  const atrasadas = useMemo(() => despesasFiltradas.filter(d=>!['pago','paga'].includes(d.status)&&(d.data_vencimento||d.data||'')<hoje), [despesasFiltradas, hoje]);
  const comissoesPendentes = useMemo(() => comissoes.filter(c=>!['pago','paga'].includes(c.status_pagamento)).reduce((s,c)=>s+(c.valor_vendedor||0),0), [comissoes]);

  // Gráfico mensal
  const dadosMensais = useMemo(() => Array.from({length:6},(_,i)=>{
    const m = moment().subtract(5-i,'months');
    const mes = m.format('YYYY-MM');
    const rec = receitas.filter(r=>r.status==='recebida'&&(r.data_recebimento||r.data||'').startsWith(mes)&&(filterFilial==='todas'||r.filial_id===filterFilial)).reduce((s,r)=>s+(r.valor||0),0);
    const dep = despesas.filter(d=>['pago','paga'].includes(d.status)&&(d.data_pagamento||d.data||'').startsWith(mes)&&(filterFilial==='todas'||d.filial_id===filterFilial)).reduce((s,d)=>s+(d.valor||0),0);
    return { mes: MESES[m.month()], Receitas: rec, Despesas: dep, Lucro: rec-dep };
  }), [receitas, despesas, filterFilial]);

  // Ranking de filiais
  const rankingFiliais = useMemo(() => {
    return filiais.map(f => {
      const rec = receitas.filter(r=>r.filial_id===f.id&&r.status==='recebida').reduce((s,r)=>s+(r.valor||0),0);
      const dep = despesas.filter(d=>d.filial_id===f.id&&['pago','paga'].includes(d.status)).reduce((s,d)=>s+(d.valor||0),0);
      return { ...f, receita: rec, despesa: dep, lucro: rec-dep };
    }).sort((a,b)=>b.lucro-a.lucro);
  }, [filiais, receitas, despesas]);

  // Por serviço — agrupa usando o campo "produto" da Receita mapeado para os 4 serviços
  const receitaPorProduto = useMemo(() => {
    const map = { 'Consórcio': 0, 'Empréstimos': 0, 'Financiamentos': 0, 'Seguros': 0, 'Outros': 0 };
    receitasFiltradas.forEach(r => {
      const prod = (r.produto || '').toLowerCase();
      const catNome = (r.categoria_nome || r.categoria || '').toLowerCase();
      const combinado = prod + ' ' + catNome;
      if (combinado.includes('consorcio') || combinado.includes('consórcio')) {
        map['Consórcio'] += r.valor || 0;
      } else if (combinado.includes('emprestimo') || combinado.includes('empréstimo') || combinado.includes('credito') || combinado.includes('crédito')) {
        map['Empréstimos'] += r.valor || 0;
      } else if (combinado.includes('financiamento') || combinado.includes('veiculo') || combinado.includes('veículo')) {
        map['Financiamentos'] += r.valor || 0;
      } else if (combinado.includes('seguro') || combinado.includes('protecao') || combinado.includes('proteção')) {
        map['Seguros'] += r.valor || 0;
      } else {
        map['Outros'] += r.valor || 0;
      }
    });
    return Object.entries(map)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [receitasFiltradas]);

  // Alertas
  const alertas = [];
  if (atrasadas.length>0) alertas.push({tipo:'danger',msg:`${atrasadas.length} conta(s) vencida(s) — ${BRL(atrasadas.reduce((s,d)=>s+(d.valor||0),0))}`});
  const recv7d = receitas.filter(r=>!['recebida','cancelada'].includes(r.status)&&(r.data||'')>=hoje&&(r.data||'')<=moment().add(7,'days').format('YYYY-MM-DD'));
  if (recv7d.length>0) alertas.push({tipo:'success',msg:`${recv7d.length} receita(s) prevista(s) — ${BRL(recv7d.reduce((s,r)=>s+(r.valor||0),0))}`});
  if (comissoesPendentes>0) alertas.push({tipo:'orange',msg:`Comissões pendentes: ${BRL(comissoesPendentes)}`});

  const kpis = [
    {label:'Receita Realizada',value:BRL(receitasRealizadas),icon:TrendingUp,color:'text-green-600',bg:'bg-green-50 border-green-200'},
    {label:'Receita Prevista',value:BRL(receitasPrevistas),icon:BarChart2,color:'text-blue-600',bg:'bg-blue-50 border-blue-200'},
    {label:'Total Despesas',value:BRL(totalDespesas),icon:TrendingDown,color:'text-red-600',bg:'bg-red-50 border-red-200'},
    {label:'Lucro Líquido',value:BRL(lucroLiquido),icon:DollarSign,color:lucroLiquido>=0?'text-blue-700':'text-red-700',bg:lucroLiquido>=0?'bg-blue-50 border-blue-200':'bg-red-50 border-red-200'},
    {label:'A Receber',value:BRL(contasReceber),icon:Clock,color:'text-amber-600',bg:'bg-amber-50 border-amber-200'},
    {label:'A Pagar',value:BRL(contasPagar),icon:Wallet,color:'text-orange-600',bg:'bg-orange-50 border-orange-200'},
    {label:'Contas Atrasadas',value:BRL(atrasadas.reduce((s,d)=>s+(d.valor||0),0)),icon:AlertCircle,color:'text-red-700',bg:'bg-red-100 border-red-300'},
    {label:'Comissões Pendentes',value:BRL(comissoesPendentes),icon:Users,color:'text-purple-600',bg:'bg-purple-50 border-purple-200'},
  ];

  const medalhas = ['🥇','🥈','🥉'];
  const alertCls = {danger:'bg-red-50 border-red-300 text-red-800',success:'bg-green-50 border-green-300 text-green-800',warning:'bg-yellow-50 border-yellow-300 text-yellow-800',orange:'bg-orange-50 border-orange-300 text-orange-800'};

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center p-4 bg-white rounded-xl border">
        <Building2 className="w-4 h-4 text-slate-400"/>
        <Select value={filterFilial} onValueChange={setFilterFilial}>
          <SelectTrigger className="w-48"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as Filiais</SelectItem>
            {filiais.map(f=><SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className="w-44"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="mes_atual">Mês Atual</SelectItem>
            <SelectItem value="trimestre">Último Trimestre</SelectItem>
            <SelectItem value="ano_atual">Ano Atual</SelectItem>
            <SelectItem value="todos">Todo o Período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alertas */}
      {alertas.length>0 && <div className="space-y-2">{alertas.map((a,i)=>(
        <div key={i} className={`px-4 py-2.5 rounded-lg border text-sm font-medium flex items-center gap-2 ${alertCls[a.tipo]}`}><AlertCircle className="w-4 h-4 flex-shrink-0"/>{a.msg}</div>
      ))}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k,i)=>(
          <Card key={i} className={`p-4 border ${k.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 font-medium">{k.label}</p>
              <k.icon className={`w-4 h-4 ${k.color}`}/>
            </div>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">Receitas x Despesas (6 meses)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosMensais}>
              <XAxis dataKey="mes" tick={{fontSize:11}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={v=>BRL(v)}/>
              <Legend/>
              <Bar dataKey="Receitas" fill="#10b981" radius={[4,4,0,0]}/>
              <Bar dataKey="Despesas" fill="#ef4444" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">Receita por Serviço</h3>
          {receitaPorProduto.length>0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={receitaPorProduto} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {receitaPorProduto.map((_,i)=><Cell key={i} fill={CORES[i%CORES.length]}/>)}
                </Pie>
                <Tooltip formatter={v=>BRL(v)}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-slate-400 text-sm py-16">Sem dados</p>}
        </Card>
      </div>

      {/* Ranking + Comparativo de filiais */}
      {filiais.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ranking */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-white">
              <Trophy className="w-5 h-5"/>
              <h3 className="font-bold text-sm">Ranking de Filiais por Lucro</h3>
            </div>
            <div>
              {rankingFiliais.map((f, i) => (
                <div key={f.id} className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 ${i===0?'bg-amber-50':i===1?'bg-slate-50':''}`}>
                  <span className="text-2xl w-8 flex-shrink-0">{medalhas[i] || `${i+1}°`}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{f.nome}</p>
                    <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                      <span>Rec: <span className="text-green-600 font-medium">{BRL(f.receita)}</span></span>
                      <span>Desp: <span className="text-red-600 font-medium">{BRL(f.despesa)}</span></span>
                    </div>
                  </div>
                  <span className={`font-bold text-sm ${f.lucro>=0?'text-green-600':'text-red-600'}`}>{BRL(f.lucro)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Comparativo */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 bg-slate-800 text-white">
              <h3 className="font-bold text-sm">Comparativo de Filiais</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-600">Filial</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Receita</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Despesa</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Lucro</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingFiliais.map(f=>(
                    <tr key={f.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-700">{f.nome}</td>
                      <td className="p-3 text-right text-green-600 font-semibold">{BRL(f.receita)}</td>
                      <td className="p-3 text-right text-red-600 font-semibold">{BRL(f.despesa)}</td>
                      <td className={`p-3 text-right font-bold ${f.lucro>=0?'text-blue-600':'text-red-700'}`}>{BRL(f.lucro)}</td>
                      <td className="p-3 text-right text-slate-500">{f.receita>0?`${((f.lucro/f.receita)*100).toFixed(1)}%`:'—'}</td>
                    </tr>
                  ))}
                  {rankingFiliais.length===0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Nenhuma filial cadastrada</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
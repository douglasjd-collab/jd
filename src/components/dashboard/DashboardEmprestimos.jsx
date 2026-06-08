import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ComposedChart 
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, TrendingUp, Calculator } from 'lucide-react';
import GraficoProducao from './GraficoProducao';

const COLORS = ['#1e3a5f', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function DashboardEmprestimos({ propostasEmprestimo, statusPropostaList, filtroInicio, filtroFim, isVendedor, user, formatCurrency }) {
  const normStr = s => String(s || '').toLowerCase().trim();
  const statusPagoIds = statusPropostaList
    .filter(s => s.funcao_fluxo === 'finalizado' || ['pago', 'paga'].includes(normStr(s.nome)))
    .map(s => s.id);
  const statusCanceladoIds = statusPropostaList
    .filter(s => s.funcao_fluxo === 'cancelado' || normStr(s.nome) === 'cancelado')
    .map(s => s.id);

  const isPagaProposta = (p) =>
    (p.status_id && statusPagoIds.includes(p.status_id)) ||
    ['pago', 'paga'].includes(normStr(p.status));
  const isCanceladaProposta = (p) =>
    (p.status_id && statusCanceladoIds.includes(p.status_id)) ||
    normStr(p.status) === 'cancelado';

  // Propostas pagas no período selecionado
  const propostasPagasMes = React.useMemo(() => {
    const base = propostasEmprestimo.filter(p => {
      if (isCanceladaProposta(p)) return false;
      if (!isPagaProposta(p)) return false;
      const datas = [
        p.emprestimo_data_liberacao,
        p.data_comissao_recebida,
        p.data_status_atual,
        p.data_venda,
        p.updated_date,
      ].filter(Boolean).map(d => String(d).slice(0, 10));
      return datas.some(d => d >= filtroInicio && d <= filtroFim);
    });
    if (isVendedor && user?.colaborador_id) {
      return base.filter(p => p.vendedor_id === user.colaborador_id);
    }
    return base;
  }, [propostasEmprestimo, filtroInicio, filtroFim, isVendedor, user, statusPagoIds, statusCanceladoIds]);

  // Propostas em andamento
  const propostasEmAndamento = React.useMemo(() => {
    const base = propostasEmprestimo.filter(p => {
      if (isCanceladaProposta(p)) return false;
      if (isPagaProposta(p)) return false;
      return true;
    });
    if (isVendedor && user?.colaborador_id) {
      return base.filter(p => p.vendedor_id === user.colaborador_id);
    }
    return base;
  }, [propostasEmprestimo, isVendedor, user, statusPagoIds, statusCanceladoIds]);

  const valorBrutoPagoMes = propostasPagasMes.reduce((acc, p) => acc + (p.valor_credito || 0), 0);
  // valor_liquido com fallback para valor_credito quando não preenchido
  const valorLiquidoPagoMes = propostasPagasMes.reduce((acc, p) => acc + (p.valor_liquido || p.valor_credito || 0), 0);
  const valorBrutoAndamento = propostasEmAndamento.reduce((acc, p) => acc + (p.valor_credito || 0), 0);
  const valorLiquidoAndamento = propostasEmAndamento.reduce((acc, p) => acc + (p.valor_liquido || p.valor_credito || 0), 0);

  // Base Comissão: usa comissao_banco_base_comissao se disponível, senão valor_liquido, senão valor_credito
  const baseComissaoPagoMes = propostasPagasMes.reduce((acc, p) => {
    return acc + (p.comissao_banco_base_comissao || p.valor_liquido || p.valor_credito || 0);
  }, 0);

  const rankingEmprestimos = React.useMemo(() => {
    const vendedorStats = {};
    propostasPagasMes.forEach(p => {
      const nome = p.vendedor_nome || 'Sem vendedor';
      if (!vendedorStats[nome]) {
        vendedorStats[nome] = { propostas: 0, valor: 0 };
      }
      vendedorStats[nome].propostas += 1;
      vendedorStats[nome].valor += (p.valor_credito || 0);
    });
    return Object.entries(vendedorStats)
      .map(([nome, stats]) => ({ nome, propostas: stats.propostas, valor: stats.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  }, [propostasPagasMes]);

  const propostasEmprestimosPorMes = React.useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const mesKey = format(date, 'yyyy-MM');
      const pagas = propostasEmprestimo.filter(p => {
        if (isCanceladaProposta(p) || !isPagaProposta(p)) return false;
        const datas = [
          p.emprestimo_data_liberacao,
          p.data_comissao_recebida,
          p.data_status_atual,
          p.data_venda,
          p.updated_date,
        ].filter(Boolean);
        return datas.some(d => String(d).startsWith(mesKey));
      });
      months.push({
        name: format(date, 'MMM', { locale: ptBR }),
        pagas: pagas.length,
        valor: pagas.reduce((acc, p) => acc + (p.valor_credito || 0), 0),
      });
    }
    return months;
  }, [propostasEmprestimo, statusPagoIds, statusCanceladoIds]);

  return (
    <div className="space-y-6">
      {/* Cards de Empréstimos do Mês */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-emerald-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Empréstimos Pagos no Período</p>
              <p className="text-2xl font-bold text-emerald-700">{formatCurrency(valorLiquidoPagoMes)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Valor Liberado</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{propostasPagasMes.length} proposta(s) paga(s)</p>
            <p className="text-sm text-slate-500">Bruto: <span className="font-medium text-slate-700">{formatCurrency(valorBrutoPagoMes)}</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-blue-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calculator className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Base Comissão (Período)</p>
              <p className="text-2xl font-bold text-blue-700">{formatCurrency(baseComissaoPagoMes)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Valor base p/ cálculo da comissão</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{propostasPagasMes.length} proposta(s) paga(s)</p>
            <p className="text-sm text-slate-500 text-xs italic">Líq. ou Base Banco</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-orange-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Empréstimos em Andamento</p>
              <p className="text-2xl font-bold text-orange-700">{formatCurrency(valorLiquidoAndamento)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Valor Liberado (total)</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{propostasEmAndamento.length} proposta(s) em andamento</p>
            <p className="text-sm text-slate-500">Bruto: <span className="font-medium text-slate-700">{formatCurrency(valorBrutoAndamento)}</span></p>
          </div>
        </div>
      </div>

      <GraficoProducao 
        dados={propostasEmprestimosPorMes.map(d => ({ ...d, quantidade: d.pagas }))}
        titulo="Produção de Empréstimos por Mês"
        subtitle="Acompanhe a evolução mensal da produção em quantidade e valor."
        tipo="emprestimo"
        meta={50} // Exemplo de meta
      />

      {/* Ranking Empréstimos */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Ranking do Período (Empréstimos)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {rankingEmprestimos.length > 0 ? (
              rankingEmprestimos.map((v, i) => (
                <div key={v.nome} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{v.nome}</p>
                    <p className="text-sm text-slate-500">{v.propostas} proposta(s) • {formatCurrency(v.valor)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#23BE84] mb-1">{formatCurrency(v.valor)}</p>
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#23BE84] rounded-full"
                        style={{ width: `${(v.valor / (rankingEmprestimos[0]?.valor || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-500 py-8">Nenhuma proposta paga no período</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
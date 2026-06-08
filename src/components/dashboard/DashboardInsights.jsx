import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function DashboardInsights({ vendas, oportunidades, propostas, periodo }) {
  const insights = React.useMemo(() => {
    const list = [];
    const mesAtual = format(new Date(), 'yyyy-MM');
    const mesAnterior = format(subMonths(new Date(), 1), 'yyyy-MM');

    const vendasMesAtual = vendas.filter(v => v.status !== 'cancelada' && (v.data_venda || '').startsWith(mesAtual));
    const vendasMesAnterior = vendas.filter(v => v.status !== 'cancelada' && (v.data_venda || '').startsWith(mesAnterior));

    if (vendasMesAnterior.length > 0) {
      const crescimento = ((vendasMesAtual.length - vendasMesAnterior.length) / vendasMesAnterior.length * 100).toFixed(0);
      if (crescimento > 0) list.push({ icon: '📈', text: `Vendas cresceram ${crescimento}% comparado ao mês anterior.`, type: 'success' });
      else if (crescimento < 0) list.push({ icon: '📉', text: `Vendas caíram ${Math.abs(crescimento)}% comparado ao mês anterior.`, type: 'warning' });
    }

    // Melhor filial
    const filialStats = {};
    vendas.filter(v => v.status !== 'cancelada' && (v.data_venda || '') >= periodo.inicio).forEach(v => {
      const f = v.filial_nome || 'Sem filial';
      filialStats[f] = (filialStats[f] || 0) + (v.valorCredito || 0);
    });
    const melhorFilial = Object.entries(filialStats).sort((a, b) => b[1] - a[1])[0];
    if (melhorFilial) list.push({ icon: '🏆', text: `Filial "${melhorFilial[0]}" lidera a produção com ${BRL(melhorFilial[1])}.`, type: 'info' });

    // Melhor vendedor
    const vendedorStats = {};
    vendas.filter(v => v.status !== 'cancelada' && (v.data_venda || '') >= periodo.inicio).forEach(v => {
      const n = v.vendedor_nome || 'Sem vendedor';
      if (!vendedorStats[n]) vendedorStats[n] = { vendas: 0, valor: 0 };
      vendedorStats[n].vendas++;
      vendedorStats[n].valor += v.valorCredito || 0;
    });
    const melhorVendedor = Object.entries(vendedorStats).sort((a, b) => b[1].valor - a[1].valor)[0];
    if (melhorVendedor) list.push({ icon: '⭐', text: `${melhorVendedor[0]} é o top vendedor com ${melhorVendedor[1].vendas} vendas (${BRL(melhorVendedor[1].valor)}).`, type: 'success' });

    // Oportunidades paradas
    const agora = new Date();
    const paradas7 = oportunidades.filter(o => {
      if (o.status !== 'aberta') return false;
      if (!o.data_ultima_movimentacao) return true;
      const diff = (agora - new Date(o.data_ultima_movimentacao)) / (1000 * 60 * 60 * 24);
      return diff >= 7;
    }).length;
    if (paradas7 > 0) list.push({ icon: '⚠️', text: `${paradas7} oportunidade(s) sem interação há mais de 7 dias.`, type: 'warning' });

    // Valor em aprovação
    const emAprovacao = propostas.filter(p => {
      const s = (p.status || '').toLowerCase();
      return s.includes('aprovação') || s.includes('aguardando');
    });
    if (emAprovacao.length > 0) {
      const valor = emAprovacao.reduce((a, p) => a + (p.valor_credito || 0), 0);
      list.push({ icon: '💼', text: `${emAprovacao.length} proposta(s) aguardando aprovação totalizando ${BRL(valor)}.`, type: 'info' });
    }

    // Pré-fechamento
    const preFechamento = oportunidades.filter(o => {
      if (o.status !== 'aberta') return false;
      return (o.etapa_nome || '').toLowerCase().includes('fechamento');
    }).length;
    if (preFechamento > 0) list.push({ icon: '🎯', text: `${preFechamento} lead(s) em etapa de pré-fechamento prontos para converter.`, type: 'success' });

    return list.slice(0, 6);
  }, [vendas, oportunidades, propostas, periodo]);

  const typeColors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          Inteligência Automática
        </CardTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-center text-slate-400 py-4">Carregando insights...</p>
        ) : (
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${typeColors[ins.type]}`}>
                <span className="text-base flex-shrink-0">{ins.icon}</span>
                <p>{ins.text}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
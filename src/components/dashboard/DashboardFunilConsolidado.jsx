import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Filter } from 'lucide-react';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ETAPAS_PADRAO = [
  'Lead Recebido', 'Tentativa de Contato', 'Qualificação', 'Simulação',
  'Follow-up', 'Pré-Fechamento', 'Documentação', 'Aguardando Aprovação',
  'Aguardando Assinatura', 'Aguardando Pagamento',
];

export default function DashboardFunilConsolidado({ oportunidades, etapas }) {
  const dados = React.useMemo(() => {
    const abertas = oportunidades.filter(o => o.status === 'aberta');
    const total = abertas.length || 1;

    const etapasUsadas = etapas.length > 0
      ? etapas.filter(e => e.tipo !== 'ganho' && e.tipo !== 'perdida').sort((a, b) => a.ordem - b.ordem)
      : ETAPAS_PADRAO.map((nome, i) => ({ id: nome, nome, ordem: i }));

    return etapasUsadas.map(etapa => {
      const opEtapa = abertas.filter(o => o.etapa_id === etapa.id || o.etapa_nome === etapa.nome);
      const qtd = opEtapa.length;
      const valor = opEtapa.reduce((a, o) => a + (o.valor_estimado || 0), 0);
      return { nome: etapa.nome, qtd, valor, pct: Math.round((qtd / total) * 100) };
    }).filter(e => e.qtd > 0);
  }, [oportunidades, etapas]);

  const maxQtd = Math.max(...dados.map(d => d.qtd), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Filter className="w-5 h-5 text-purple-500" />
          Funil Consolidado
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dados.length === 0 ? (
          <p className="text-center text-slate-400 py-8">Nenhuma oportunidade aberta</p>
        ) : (
          <div className="space-y-2">
            {dados.map((d, i) => (
              <div key={d.nome} className="flex items-center gap-3">
                <div className="w-36 text-xs text-slate-600 text-right truncate">{d.nome}</div>
                <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg flex items-center pl-2 transition-all"
                    style={{
                      width: `${(d.qtd / maxQtd) * 100}%`,
                      background: `hsl(${240 - i * 20}, 70%, ${55 + i * 3}%)`,
                      minWidth: d.qtd > 0 ? '32px' : '0',
                    }}
                  >
                    <span className="text-white text-xs font-bold">{d.qtd}</span>
                  </div>
                </div>
                <div className="w-28 text-right text-xs text-slate-500">{BRL(d.valor)}</div>
                <div className="w-10 text-right text-xs font-medium text-slate-600">{d.pct}%</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function diasSemMovimento(op) {
  if (!op.data_ultima_movimentacao) return 999;
  return Math.floor((new Date() - new Date(op.data_ultima_movimentacao)) / (1000 * 60 * 60 * 24));
}

const FAIXAS = [
  { label: '30+ dias', min: 30, color: 'bg-red-100 text-red-700 border-red-200' },
  { label: '15-29 dias', min: 15, color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { label: '7-14 dias', min: 7, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { label: '3-6 dias', min: 3, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
];

export default function DashboardOportunidadesParadas({ oportunidades }) {
  const navigate = useNavigate();
  const [faixaSel, setFaixaSel] = React.useState(7);

  const abertas = oportunidades.filter(o => o.status === 'aberta');

  const faixasComQtd = FAIXAS.map(f => ({
    ...f,
    qtd: abertas.filter(o => diasSemMovimento(o) >= f.min).length,
  }));

  const filtradas = abertas
    .filter(o => diasSemMovimento(o) >= faixaSel)
    .sort((a, b) => diasSemMovimento(b) - diasSemMovimento(a))
    .slice(0, 10);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-red-500" />
          Oportunidades Paradas
        </CardTitle>
        <div className="flex gap-2 flex-wrap mt-2">
          {FAIXAS.map(f => (
            <button key={f.min} onClick={() => setFaixaSel(f.min)}
              className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${faixaSel === f.min ? f.color : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              {f.label} ({faixasComQtd.find(x => x.min === f.min)?.qtd || 0})
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filtradas.length === 0 ? (
          <p className="text-center text-slate-400 py-6">Nenhuma oportunidade parada nesta faixa 👍</p>
        ) : (
          <div className="space-y-2">
            {filtradas.map(op => {
              const dias = diasSemMovimento(op);
              return (
                <div key={op.id}
                  onClick={() => navigate(`/FunilVendas`)}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">{op.cliente_nome || op.titulo}</p>
                    <p className="text-xs text-slate-500">{op.etapa_nome} • {op.vendedor_nome}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-xs font-bold text-red-600">{dias === 999 ? 'Sem mov.' : `${dias} dias`}</p>
                    <p className="text-xs text-slate-500">{BRL(op.valor_estimado)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
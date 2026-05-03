import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Building2 } from 'lucide-react';

export default function BancosTabelas() {
  const [user, setUser] = useState(null);
  const [propostas, setPropostas] = useState([]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const filtro = user?.empresa_id ? { empresa_id: user.empresa_id } : {};
    base44.entities.FinanciamentoVeiculo.filter(filtro, '-created_date', 2000).then(setPropostas);
  }, [user]);

  const bancos = [...new Set(propostas.filter(p => p.banco).map(p => p.banco))].map(banco => {
    const propostasBanco = propostas.filter(p => p.banco === banco);
    const aprovadas = propostasBanco.filter(p => ['aprovado', 'pago', 'contrato_emitido'].includes(p.status)).length;
    const total = propostasBanco.length;
    const valorTotal = propostasBanco.reduce((acc, p) => acc + (p.valor_financiado || 0), 0);
    const taxaMedia = propostasBanco.filter(p => p.taxa_juros).reduce((acc, p, _, arr) => acc + p.taxa_juros / arr.length, 0);
    return { banco, total, aprovadas, valorTotal, taxaMedia, conversao: total > 0 ? Math.round((aprovadas / total) * 100) : 0 };
  });

  const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Bancos / Tabelas</h1>
      <p className="text-slate-500 text-sm">Resumo de desempenho por banco com base nas propostas cadastradas.</p>

      {bancos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum banco encontrado. Cadastre propostas para visualizar os dados.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bancos.map(b => (
            <Card key={b.banco}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#10353C]" />
                  {b.banco}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-500">Total propostas</p>
                    <p className="text-xl font-bold text-slate-800">{b.total}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-green-600">Aprovadas</p>
                    <p className="text-xl font-bold text-green-700">{b.aprovadas}</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <p className="text-slate-500">Valor total financiado</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(b.valorTotal)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-blue-600">Taxa média</p>
                    <p className="text-lg font-bold text-blue-700">{b.taxaMedia.toFixed(2)}%</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-purple-600">Conversão</p>
                    <p className="text-lg font-bold text-purple-700">{b.conversao}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
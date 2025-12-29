import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ImprimirSimulacao() {
  const [simulacao, setSimulacao] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSimulacao();
  }, []);

  const loadSimulacao = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      
      if (!id) {
        throw new Error('ID da simulação não encontrado');
      }

      const result = await base44.entities.Simulacao.filter({ id });
      if (result.length === 0) {
        throw new Error('Simulação não encontrada');
      }

      setSimulacao(result[0]);
    } catch (error) {
      console.error('Erro ao carregar simulação:', error);
      alert('Erro ao carregar simulação');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const handleImprimir = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!simulacao) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-500">Simulação não encontrada</p>
      </div>
    );
  }

  const cartas = JSON.parse(simulacao.cartas || '[]');
  const modelo = simulacao.opcao_pos_contemplacao === 'prazo' ? 'Canopus (Recomendado)' : 'Simples';

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="min-h-screen bg-white">
        {/* Botão Imprimir - não aparece na impressão */}
        <div className="no-print fixed top-4 right-4 z-50">
          <Button onClick={handleImprimir} className="gap-2 shadow-lg">
            <Printer className="w-4 h-4" />
            Imprimir Simulação
          </Button>
        </div>

        {/* Conteúdo para impressão */}
        <div className="max-w-4xl mx-auto p-8">
          {/* Cabeçalho */}
          <div className="text-center mb-8 pb-6 border-b-2 border-slate-800">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Simulação de Consórcio
            </h1>
            <p className="text-sm text-slate-600">
              Gerado em: {new Date(simulacao.created_date).toLocaleDateString('pt-BR')} às{' '}
              {new Date(simulacao.created_date).toLocaleTimeString('pt-BR')}
            </p>
          </div>

          {/* Dados do Cliente */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3 pb-2 border-b border-slate-300">
              📋 Dados do Cliente
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">Nome:</span> {simulacao.cliente_nome}
              </div>
              <div>
                <span className="font-semibold">Telefone:</span> {simulacao.telefone}
              </div>
            </div>
          </div>

          {/* Cartas de Crédito */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3 pb-2 border-b border-slate-300">
              💳 Cartas de Crédito
            </h2>
            <div className="space-y-2 mb-4">
              {cartas.map((carta, i) => (
                <div key={i} className="text-sm bg-slate-50 p-3 rounded">
                  <strong>Carta {i + 1}:</strong> {formatCurrency(parseFloat(carta.credito))} •{' '}
                  {formatCurrency(parseFloat(carta.parcela))}/mês • {carta.prazo} meses
                </div>
              ))}
            </div>
            <div className="bg-blue-50 p-4 rounded text-sm space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold">💰 Crédito Total:</span>
                <span className="text-lg font-bold text-blue-900">
                  {formatCurrency(simulacao.credito_total)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">📅 Parcela Total:</span>
                <span className="text-lg font-bold text-blue-900">
                  {formatCurrency(simulacao.parcela_total)}/mês
                </span>
              </div>
            </div>
          </div>

          {/* Lances */}
          {simulacao.lance_total > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 mb-3 pb-2 border-b border-slate-300">
                🎯 Lances
              </h2>
              <div className="space-y-2 text-sm">
                {simulacao.lance_embutido_ativo && (
                  <div className="flex justify-between">
                    <span>Lance Embutido ({simulacao.lance_embutido_percentual}%):</span>
                    <span className="font-semibold">
                      {formatCurrency(simulacao.lance_embutido_valor)}
                    </span>
                  </div>
                )}
                {simulacao.lance_proprio_ativo && (
                  <div className="flex justify-between">
                    <span>Lance Próprio:</span>
                    <span className="font-semibold">
                      {formatCurrency(simulacao.lance_proprio_valor)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-emerald-200 bg-emerald-50 p-3 rounded">
                  <span className="font-bold">🏆 Lance Total:</span>
                  <span className="text-lg font-bold text-emerald-900">
                    {formatCurrency(simulacao.lance_total)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Cálculos */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3 pb-2 border-b border-slate-300">
              🧮 Cálculos
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total do Plano:</span>
                <span className="font-semibold">
                  {formatCurrency(simulacao.prazo_original * simulacao.parcela_total)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>(-) Lance:</span>
                <span className="font-semibold">
                  {formatCurrency(simulacao.lance_total)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Saldo Base:</span>
                <span className="font-semibold">
                  {formatCurrency(
                    simulacao.prazo_original * simulacao.parcela_total - simulacao.lance_total
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span>(-) 1ª Parcela (no ato):</span>
                <span className="font-semibold">{formatCurrency(simulacao.parcela_total)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200 bg-blue-50 p-3 rounded">
                <span className="font-bold">Saldo Devedor:</span>
                <span className="text-lg font-bold text-blue-900">
                  {formatCurrency(simulacao.saldo_apos_contemplacao)}
                </span>
              </div>
              {simulacao.opcao_pos_contemplacao === 'prazo' && (
                <p className="text-xs text-slate-600 italic mt-2">
                  ⏱️ Carência de 3 meses reduz apenas o prazo (não altera saldo)
                </p>
              )}
            </div>
          </div>

          {/* Resultado Final */}
          <div className="bg-gradient-to-r from-purple-100 to-purple-50 border-2 border-purple-300 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-purple-900 mb-4 text-center">
              ✨ Resultado Final
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-purple-800">Novo Prazo:</span>
                <span className="text-2xl font-bold text-purple-900">
                  {simulacao.novo_prazo} meses
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-purple-800">Nova Parcela:</span>
                <span className="text-2xl font-bold text-purple-900">
                  {formatCurrency(simulacao.nova_parcela)}
                </span>
              </div>
              {simulacao.opcao_pos_contemplacao === 'prazo' && (
                <div className="pt-3 border-t border-purple-200 text-sm text-purple-700">
                  ✓ 1 parcela paga no ato<br />
                  ✓ 3 parcelas de carência descontadas
                </div>
              )}
            </div>
          </div>

          {/* Rodapé */}
          <div className="mt-8 pt-4 border-t border-slate-300 text-center text-xs text-slate-500">
            <p>Modelo de Cálculo: {modelo}</p>
            <p className="mt-2">Vendedor: {simulacao.usuario_nome}</p>
            <p className="mt-4">
              Esta simulação é apenas uma projeção e pode sofrer alterações conforme as condições
              da administradora.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
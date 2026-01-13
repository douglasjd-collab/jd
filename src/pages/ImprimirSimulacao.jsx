import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Printer, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ImprimirSimulacao() {
  const [simulacao, setSimulacao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSimulacao();
  }, []);

  const loadSimulacao = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      
      if (!id) {
        throw new Error('ID da simulação não encontrado');
      }

      // Buscar a simulação específica
      const result = await base44.entities.Simulacao.filter({ id });
      
      if (!result || result.length === 0) {
        throw new Error('Simulação não encontrada');
      }

      setSimulacao(result[0]);
    } catch (err) {
      console.error('Erro ao carregar simulação:', err);
      setError(err.message || 'Erro ao carregar simulação');
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
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23BE84]"></div>
        <p className="text-slate-600 font-medium">Carregando simulação...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="text-red-500 text-6xl">⚠️</div>
        <p className="text-slate-900 font-semibold text-xl">Erro ao carregar simulação</p>
        <p className="text-slate-600">{error}</p>
        <button 
          onClick={() => window.close()} 
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
        >
          Fechar
        </button>
      </div>
    );
  }

  if (!simulacao) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-slate-400 text-6xl">📄</div>
        <p className="text-slate-900 font-semibold text-xl">Simulação não encontrada</p>
        <p className="text-slate-600">Verifique se o link está correto</p>
        <button 
          onClick={() => window.close()} 
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
        >
          Fechar
        </button>
      </div>
    );
  }

  let cartas = [];
  try {
    cartas = JSON.parse(simulacao.cartas || '[]');
  } catch (e) {
    cartas = [];
  }
  const modelo = simulacao.opcao_pos_contemplacao === 'prazo' ? 'Canopus (Recomendado)' : 'Simples';

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { 
            margin: 0.3cm;
            size: A4;
          }
          html, body {
            height: auto !important;
            overflow: hidden !important;
          }
          .compact-print { 
            font-size: 11px !important; 
            line-height: 1.3 !important;
          }
          .compact-print h1 { font-size: 20px !important; margin-bottom: 4px !important; }
          .compact-print h2 { font-size: 14px !important; margin-bottom: 6px !important; padding-bottom: 2px !important; }
          .compact-print .section { margin-bottom: 8px !important; }
          .compact-print .card-section { padding: 6px !important; }
        }
      `}</style>

      <div className="bg-white print:h-auto">
        {/* Botões - não aparecem na impressão */}
        <div className="no-print fixed top-4 left-4 right-4 z-50 flex justify-between">
          <Link to={createPageUrl('SimuladorConsorcio')}>
            <Button variant="outline" className="gap-2 shadow-lg">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Simulador
            </Button>
          </Link>
          <Button onClick={handleImprimir} className="gap-2 shadow-lg bg-[#23BE84] hover:bg-[#1da570]">
            <Printer className="w-4 h-4" />
            Imprimir
          </Button>
        </div>

        {/* Conteúdo para impressão */}
        <div className="max-w-4xl mx-auto p-4 print:p-1 compact-print">
          {/* Cabeçalho */}
          <div className="text-center mb-2 pb-2 border-b-2 border-slate-800">
            <div className="flex justify-center mb-1">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" 
                alt="JD Promotora" 
                className="h-8 w-auto object-contain print:h-7"
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-0">
              Simulação de Consórcio
            </h1>
            <p className="text-xs text-slate-600">
              {new Date(simulacao.created_date).toLocaleDateString('pt-BR')} às {new Date(simulacao.created_date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
            </p>
          </div>

          {/* Dados do Cliente */}
          <div className="section mb-2">
            <h2 className="text-lg font-bold text-slate-900 mb-1 pb-1 border-b border-slate-300">
              📋 Dados do Cliente
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-semibold">Nome:</span> {simulacao.cliente_nome}
              </div>
              <div>
                <span className="font-semibold">Telefone:</span> {simulacao.telefone}
              </div>
            </div>
          </div>

          {/* Cartas de Crédito */}
          <div className="section mb-2">
            <h2 className="text-lg font-bold text-slate-900 mb-1 pb-1 border-b border-slate-300">
              💳 Cartas de Crédito
            </h2>
            <div className="space-y-0.5 mb-1">
              {cartas.map((carta, i) => (
                <div key={i} className="text-xs bg-slate-50 p-1.5 rounded">
                  <strong>Carta {i + 1}:</strong> {formatCurrency(parseFloat(carta.credito))} • Parcela {formatCurrency(parseFloat(carta.parcela))} • {carta.prazo} Meses
                </div>
              ))}
            </div>
            <div className="card-section bg-blue-50 p-2 rounded text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="font-semibold">💰 Crédito Total:</span>
                <span className="text-base font-bold text-blue-900">
                  {formatCurrency(simulacao.credito_total)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">📅 Parcela Total:</span>
                <span className="text-base font-bold text-blue-900">
                  {formatCurrency(simulacao.parcela_total)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">⏱️ Prazo:</span>
                <span className="text-base font-bold text-blue-900">
                  {simulacao.prazo_original} Meses
                </span>
              </div>
            </div>
          </div>

          {/* Lances */}
          {simulacao.lance_total > 0 && (
            <div className="section mb-2">
              <h2 className="text-lg font-bold text-slate-900 mb-1 pb-1 border-b border-slate-300">
                🎯 Lances
              </h2>
              <div className="space-y-1 text-xs">
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
                <div className="card-section flex justify-between pt-1 border-t border-emerald-200 bg-emerald-50 p-1.5 rounded">
                  <span className="font-bold">🏆 Lance Total:</span>
                  <span className="text-base font-bold text-emerald-900">
                    {formatCurrency(simulacao.lance_total)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Valor a Receber */}
          <div className="section card-section mb-2 p-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg text-white">
            <h2 className="text-sm font-bold mb-1">💰 Valor que o Cliente Recebe</h2>
            <p className="text-2xl font-bold mb-0.5">
              {formatCurrency(simulacao.credito_total - (simulacao.lance_embutido_valor || 0))}
            </p>
            <p className="text-xs opacity-90">
              (Crédito {formatCurrency(simulacao.credito_total)}
              {simulacao.lance_embutido_valor > 0 && ` - Lance Emb. ${formatCurrency(simulacao.lance_embutido_valor)}`})
            </p>
          </div>

          {/* Cálculos */}
          <div className="section mb-2">
            <h2 className="text-lg font-bold text-slate-900 mb-1 pb-1 border-b border-slate-300">
              🧮 Cálculos
            </h2>
            <div className="space-y-0.5 text-xs">
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
              <div className="card-section flex justify-between pt-1 border-t border-blue-200 bg-blue-50 p-1.5 rounded">
                <span className="font-bold">Saldo Devedor:</span>
                <span className="text-base font-bold text-blue-900">
                  {formatCurrency(simulacao.saldo_apos_contemplacao)}
                </span>
              </div>
              {simulacao.opcao_pos_contemplacao === 'prazo' && (
                <p className="text-xs text-slate-600 italic mt-1">
                  ⏱️ Carência 3 meses reduz prazo
                </p>
              )}
            </div>
          </div>

          {/* Resultado Final */}
          <div className="card-section bg-gradient-to-r from-purple-100 to-purple-50 border-2 border-purple-300 rounded-lg p-2">
            <h2 className="text-base font-bold text-purple-900 mb-1 text-center">
              ✨ Resultado Final
            </h2>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-purple-800">Novo Prazo:</span>
                <span className="text-lg font-bold text-purple-900">
                  {simulacao.novo_prazo} meses
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-purple-800">Nova Parcela:</span>
                <span className="text-lg font-bold text-purple-900">
                  {formatCurrency(simulacao.nova_parcela)}
                </span>
              </div>
              {simulacao.opcao_pos_contemplacao === 'prazo' && (
                <div className="pt-1 border-t border-purple-200 text-xs text-purple-700">
                  ✓ 3 meses de carência após contemplação
                </div>
              )}
            </div>
          </div>

          {/* Rodapé */}
          <div className="mt-2 pt-1.5 border-t border-slate-300 text-center text-xs text-slate-500">
            <p>Modelo: {modelo} • Vendedor: {simulacao.usuario_nome}</p>
            <p className="mt-1">
              Simulação sujeita a alterações conforme condições da administradora.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
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

  const toNumberBR = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;

    // remove R$, espaços, etc.
    const s = String(v)
      .replace(/[^\d.,-]/g, "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  // ✅ Se vier em centavos (ex.: 39315), converte para reais (393.15)
  const normalizeMoney = (v) => {
    const n = toNumberBR(v);

    // Se o valor original era string com vírgula/ponto, já está em reais.
    if (typeof v === "string" && (v.includes(",") || v.includes("."))) return n;

    // Se for inteiro "grande", é muito provável que seja centavos.
    // Ex.: 39315 -> 393.15 | 78630 -> 786.30
    if (Number.isInteger(n) && n >= 1000) return n / 100;

    return n;
  };

  const formatMoney = (value) => {
    const n = Number(value ?? 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const calcularPrimeiraParcelaNoAto = () => {
    // Prioriza o campo primeira_parcela_no_ato salvo na simulação (snake_case)
    const primeiraParcelaNoAto = Number(simulacao?.primeira_parcela_no_ato ?? 0);
    const isParcelaReduzida = simulacao?.parcela_reduzida === true;

    console.log('🔍 Debug Impressão:', {
      primeira_parcela_no_ato: simulacao?.primeira_parcela_no_ato,
      primeira_parcela_reduzida_total: simulacao?.primeira_parcela_reduzida_total,
      parcela_reduzida: simulacao?.parcela_reduzida,
      primeiraParcelaNoAto,
      isParcelaReduzida
    });

    return { primeiraParcelaNoAto, isParcelaReduzida };
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

  // Calcular percentual do lance próprio em relação ao crédito
  const lanceProprioPercentual = simulacao.lance_proprio_ativo && simulacao.credito_total > 0
    ? ((simulacao.lance_proprio_valor / simulacao.credito_total) * 100).toFixed(2)
    : '0';
  
  // Calcular percentual total ofertado (lance embutido + lance próprio)
  const percentualTotalOfertado = simulacao.credito_total > 0
    ? (((simulacao.lance_embutido_valor || 0) + (simulacao.lance_proprio_valor || 0)) / simulacao.credito_total * 100).toFixed(2)
    : '0';

  // Calcula a primeira parcela no ato usando lógica robusta
  const { primeiraParcelaNoAto, isParcelaReduzida } = calcularPrimeiraParcelaNoAto();

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
          
          /* Ocultar sidebar/menu lateral */
          aside { display: none !important; }
          nav { display: none !important; }
          header { display: none !important; }
          
          /* Garantir que o conteúdo use largura total */
          main { margin: 0 !important; padding: 0 !important; width: 100% !important; }
          
          .compact-print { 
            font-size: 11px !important; 
            line-height: 1.3 !important;
            margin: 0 !important;
            padding: 0 !important;
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
          <Button
            variant="outline"
            className="gap-2 shadow-lg"
            onClick={() => {
              if (simulacao) {
                localStorage.setItem('simulacao_ultima_nome', simulacao.cliente_nome || '');
                localStorage.setItem('simulacao_ultimo_telefone', simulacao.telefone || '');
              }
              window.location.href = '/SimuladorNormal';
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Simulador
          </Button>
          <Button onClick={handleImprimir} className="gap-2 shadow-lg bg-[#23BE84] hover:bg-[#1da570] px-6">
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
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
              <div>
                <span className="font-semibold">Tipo:</span> <span className="capitalize">{simulacao.tipo_grupo || 'Automóvel'}</span>
              </div>
              <div>
                <span className="font-semibold">Administradora:</span> {simulacao.administradora || 'Canopus'}
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
                    <span>Lance Próprio ({lanceProprioPercentual}%):</span>
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
                {(simulacao.lance_embutido_ativo || simulacao.lance_proprio_ativo) && (
                  <div className="card-section flex justify-between pt-1 mt-1 bg-orange-50 p-1.5 rounded border border-orange-200">
                    <span className="font-bold text-orange-900">🎯 Percentual Total Ofertado:</span>
                    <span className="text-base font-bold text-orange-900">
                      {percentualTotalOfertado}%
                    </span>
                  </div>
                )}
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
              {simulacao.lance_embutido_ativo && simulacao.lance_embutido_valor > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>✨ Lance Embutido incluso na parcela reduzida (não desconta do saldo):</span>
                  <span className="font-semibold">
                    {formatCurrency(simulacao.lance_embutido_valor)}
                  </span>
                </div>
              )}
              {simulacao.lance_proprio_ativo && simulacao.lance_proprio_valor > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>(-) Lance Próprio:</span>
                  <span className="font-semibold">
                    -{formatCurrency(simulacao.lance_proprio_valor)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-red-600">
                <span>(-) 1ª Parcela (no ato):</span>
                <span className="font-semibold">
                  -{formatCurrency(primeiraParcelaNoAto)}
                </span>
              </div>
              <div className="card-section flex justify-between pt-1 border-t border-blue-200 bg-blue-50 p-1.5 rounded">
                <span className="font-bold">Saldo Restante:</span>
                <span className="text-base font-bold text-blue-900">
                  {formatCurrency(simulacao.saldo_apos_contemplacao)}
                </span>
              </div>
              {simulacao.novo_prazo && simulacao.prazo_original && simulacao.novo_prazo < simulacao.prazo_original && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>Carência:</span>
                    <span className="font-semibold">{simulacao.prazo_original - simulacao.novo_prazo - 1} meses</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Parcelas Restantes:</span>
                    <span className="font-semibold">{simulacao.novo_prazo} meses</span>
                  </div>
                </>
              )}
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
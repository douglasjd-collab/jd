import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Printer, ArrowLeft, Calendar, User, ShieldCheck, DollarSign, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calcularChanceContemplacao } from '@/components/simulador/AnaliseContemplacao';

export default function ImprimirSimulacao() {
  const [simulacao, setSimulacao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSimulacao();
  }, []);

  // Auto-impressão (2ª via): quando a URL contém ?autoPrint=1, dispara o
  // diálogo de impressão automaticamente após carregar e renderizar a
  // simulação — produz PDF idêntico ao gerado durante a simulação.
  useEffect(() => {
    if (!simulacao) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoPrint') === '1') {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [simulacao]);

  const loadSimulacao = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');

      // Buscar a simulação: por id (fluxo normal) ou a mais recente (preview sem id)
      const result = id
        ? await base44.entities.Simulacao.filter({ id })
        : await base44.entities.Simulacao.list('-created_date', 1);
      
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
  try { cartas = JSON.parse(simulacao.cartas || '[]'); } catch { cartas = []; }

  const primeiraParcelaNoAto = Number(simulacao?.primeira_parcela_no_ato ?? 0);

  const lanceProprioPercentual = simulacao.lance_proprio_ativo && simulacao.credito_total > 0
    ? ((simulacao.lance_proprio_valor / simulacao.credito_total) * 100).toFixed(2) : '0';
  const percentualTotalOfertado = simulacao.credito_total > 0
    ? (((simulacao.lance_embutido_valor || 0) + (simulacao.lance_proprio_valor || 0)) / simulacao.credito_total * 100).toFixed(2) : '0';

  // Análise de contemplação
  let analise = null;
  try { analise = simulacao.analise_contemplacao_json ? JSON.parse(simulacao.analise_contemplacao_json) : null; } catch { analise = null; }

  const CHANCE_LABELS = ['Baixa chance', 'Média chance', 'Boa chance', 'Forte chance'];
  const CHANCE_COLORS = ['text-red-600', 'text-yellow-600', 'text-blue-600', 'text-green-700'];
  const CHANCE_BG = ['bg-red-50 border-red-200', 'bg-yellow-50 border-yellow-200', 'bg-blue-50 border-blue-200', 'bg-green-50 border-green-200'];

  const renderAnalise = () => {
    if (!analise) return null;
    const modalidadeLabel = analise.modalidade === 'livre' ? 'Lance Livre' : 'Lance Limitado';
    if (analise.sem_historico) {
      return (
        <div className="section mb-3">
          <h2 className="text-base font-bold text-slate-900 mb-2 pb-1 border-b-2 border-[#083942] flex items-center gap-2">
            <span className="w-2 h-5 bg-[#083942] rounded inline-block" /> Análise de Contemplação
          </h2>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-sm text-slate-500">
            Análise de contemplação indisponível por falta de histórico da última assembleia.
          </div>
        </div>
      );
    }
    const diff = analise.lanceOfertadoPct - analise.menorLancePct;
    let nivel = 0;
    if (diff > 10) nivel = 3; else if (diff >= 0) nivel = 2; else if (diff >= -10) nivel = 1;
    const diffSinal = diff >= 0 ? '+' : '';
    return (
      <div className="section mb-3">
        <h2 className="text-base font-bold text-slate-900 mb-2 pb-1 border-b-2 border-[#083942] flex items-center gap-2">
          <span className="w-2 h-5 bg-[#083942] rounded inline-block" /> Análise de Contemplação — {modalidadeLabel}
        </h2>
        <div className="grid grid-cols-3 gap-2 mb-3 text-center text-sm">
          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <p className="text-xs text-slate-500">Menor lance histórico</p>
            <p className="text-xl font-bold">{analise.menorLancePct?.toFixed(2)}%</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <p className="text-xs text-slate-500">Lance ofertado</p>
            <p className="text-xl font-bold">{analise.lanceOfertadoPct?.toFixed(2)}%</p>
          </div>
          <div className={`rounded p-2 border ${CHANCE_BG[nivel]}`}>
            <p className={`text-xs ${CHANCE_COLORS[nivel]}`}>Diferença</p>
            <p className={`text-xl font-bold ${CHANCE_COLORS[nivel]}`}>{diffSinal}{diff.toFixed(2)}%</p>
          </div>
        </div>
        {/* Medidor */}
        <div className="grid grid-cols-4 gap-1 mb-2">
          {CHANCE_LABELS.map((l, i) => (
            <div key={i} className={`py-1.5 px-1 rounded text-center text-xs font-semibold ${i === nivel ? (i === 0 ? 'bg-red-500 text-white' : i === 1 ? 'bg-yellow-400 text-white' : i === 2 ? 'bg-blue-500 text-white' : 'bg-green-600 text-white') : 'bg-slate-100 text-slate-400'}`}>{l}</div>
          ))}
        </div>
        <div className={`rounded p-2 text-center border ${CHANCE_BG[nivel]}`}>
          <p className={`text-base font-bold ${CHANCE_COLORS[nivel]}`}>{CHANCE_LABELS[nivel]} de contemplação</p>
          <p className={`text-xs ${CHANCE_COLORS[nivel]}`}>Lance {diffSinal}{diff.toFixed(2)}% em relação ao menor lance da última assembleia</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.5cm; size: A4; }
          aside, nav, header { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
      `}</style>

      <div className="bg-white">
        {/* Botões */}
        <div className="no-print fixed top-4 left-4 right-4 z-50 flex justify-between">
          <Button variant="outline" className="gap-2 shadow-lg"
            onClick={() => {
              localStorage.setItem('simulacao_ultima_nome', simulacao.cliente_nome || '');
              localStorage.setItem('simulacao_ultimo_telefone', simulacao.telefone || '');
              window.location.href = '/SimuladorNormal';
            }}>
            <ArrowLeft className="w-4 h-4" /> Voltar ao Simulador
          </Button>
          <Button onClick={handleImprimir} className="gap-2 shadow-lg bg-[#083942] hover:bg-[#10353C] px-6">
            <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
          </Button>
        </div>

        <div className="max-w-3xl mx-auto p-6 pt-16 print:pt-0 print:p-3">

          {/* Cabeçalho */}
          <div className="relative bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
            <div className="flex items-stretch px-5 py-4 gap-4">
              {/* Marca */}
              <div className="flex items-center gap-3">
                <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" alt="JD Promotora" className="h-10 w-10 object-contain" />
                <div>
                  <h1 className="text-lg font-bold tracking-wide text-[#001529] leading-tight">JD PROMOTORA</h1>
                  <p className="text-xs text-slate-500">Simulação de Consórcio</p>
                </div>
              </div>

              <div className="w-px bg-slate-200 my-1" />

              {/* Data */}
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-[#0047bb] shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#001529] leading-tight">{new Date(simulacao.created_date || Date.now()).toLocaleDateString('pt-BR')}</p>
                  <p className="text-xs text-slate-500">Data</p>
                </div>
              </div>

              <div className="w-px bg-slate-200 my-1" />

              {/* Vendedor */}
              <div className="flex items-center gap-2.5">
                <User className="w-5 h-5 text-[#0047bb] shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 leading-tight">Vendedor</p>
                  <p className="text-sm font-bold text-[#001529] leading-tight">{simulacao.usuario_nome || '-'}</p>
                </div>
              </div>

              <div className="w-px bg-slate-200 my-1" />

              {/* Validade */}
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#0047bb] shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 leading-tight">Validade</p>
                  <p className="text-sm font-bold text-[#001529] leading-tight">30 dias</p>
                </div>
              </div>
            </div>

            {/* Linha de acento inferior */}
            <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
          </div>

          {/* Bloco 1: Cliente */}
          <div className="section mb-3">
            <h2 className="text-sm font-bold text-slate-700 mb-2 pb-1 border-b-2 border-[#083942] uppercase tracking-wide flex items-center gap-2">
              <span className="w-2 h-4 bg-[#083942] rounded inline-block" /> Dados do Cliente
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div><span className="text-slate-500">Nome:</span> <span className="font-semibold">{simulacao.cliente_nome}</span></div>
              <div><span className="text-slate-500">Telefone:</span> <span className="font-semibold">{simulacao.telefone}</span></div>
              <div><span className="text-slate-500">Tipo de Bem:</span> <span className="font-semibold capitalize">{simulacao.tipo_grupo || 'Automóvel'}</span></div>
              <div><span className="text-slate-500">Administradora:</span> <span className="font-semibold">{simulacao.administradora || 'Canopus'}</span></div>
            </div>
          </div>

          {/* Bloco 2: Resumo */}
          <div className="section mb-3">
            <h2 className="text-sm font-bold text-slate-700 mb-2 pb-1 border-b-2 border-[#083942] uppercase tracking-wide flex items-center gap-2">
              <span className="w-2 h-4 bg-[#083942] rounded inline-block" /> Resumo da Simulação
            </h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[#083942] text-white rounded-lg p-2">
                <p className="text-xs opacity-75">Crédito Total</p>
                <p className="text-lg font-bold">{formatCurrency(simulacao.credito_total)}</p>
              </div>
              <div className="bg-slate-700 text-white rounded-lg p-2">
                <p className="text-xs opacity-75">Parcela Total</p>
                <p className="text-lg font-bold">{formatCurrency(simulacao.parcela_total)}</p>
              </div>
              <div className="bg-slate-600 text-white rounded-lg p-2">
                <p className="text-xs opacity-75">Prazo</p>
                <p className="text-lg font-bold">{simulacao.prazo_original} meses</p>
              </div>
            </div>
          </div>

          {/* Bloco 3: Cartas */}
          <div className="section mb-3">
            <h2 className="text-sm font-bold text-slate-700 mb-2 pb-1 border-b-2 border-[#083942] uppercase tracking-wide flex items-center gap-2">
              <span className="w-2 h-4 bg-[#083942] rounded inline-block" /> Cartas de Crédito
            </h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#083942] text-white">
                  <th className="p-2 text-left text-xs font-semibold">Carta</th>
                  <th className="p-2 text-right text-xs font-semibold">Crédito</th>
                  <th className="p-2 text-right text-xs font-semibold">Parcela</th>
                  <th className="p-2 text-right text-xs font-semibold">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {cartas.map((carta, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 text-xs">Carta {i + 1}</td>
                    <td className="p-2 text-xs text-right font-semibold">{formatCurrency(parseFloat(carta.credito))}</td>
                    <td className="p-2 text-xs text-right">{formatCurrency(parseFloat(carta.parcela))}</td>
                    <td className="p-2 text-xs text-right">{carta.prazo} meses</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>



          {/* Bloco 5: Análise de Contemplação */}
          {renderAnalise()}

          {/* Bloco 6+7: Valor que o Cliente Recebe + Resultado Final (lado a lado, 2:3) */}
          <div className="mb-4 grid grid-cols-1 md:grid-cols-[2fr_3fr] print:grid-cols-[2fr_3fr] gap-3">
            {/* Valor que o Cliente Recebe — modelo moderno */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex">
              <div className="bg-[#083D3E] w-1/4 flex items-center justify-center p-3">
                <div className="w-12 h-12 rounded-full bg-[#0e6b6e] flex items-center justify-center border-2 border-white/80">
                  <DollarSign className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="flex-1 p-4 flex flex-col justify-center">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Valor que o Cliente Recebe</p>
                <p className="text-2xl font-bold text-[#08292D]">{formatCurrency(simulacao.credito_total - (simulacao.lance_embutido_valor || 0))}</p>
                <div className="flex items-center gap-1 mt-2">
                  <div className="h-1.5 rounded-full bg-[#10B981]" style={{ width: '40%' }} />
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="mt-2">
                  <p className="text-[11px] text-slate-500">Crédito</p>
                  <p className="text-sm font-bold text-slate-700">{formatCurrency(simulacao.credito_total)}{simulacao.lance_embutido_valor > 0 ? ` − embutido ${formatCurrency(simulacao.lance_embutido_valor)}` : ''}</p>
                </div>
              </div>
            </div>

            {/* Resultado Final */}
            <div className="bg-[#fdfaff] border border-purple-200 rounded-xl p-4">
              <h2 className="text-sm font-bold text-purple-800 uppercase tracking-wide mb-3 text-center">Resultado Final</h2>
              <div className="divide-y divide-slate-200 text-sm">
                <div className="flex justify-between py-1.5"><span className="text-slate-700">Total do Plano</span><span className="font-semibold text-slate-900">{formatCurrency(simulacao.prazo_original * simulacao.parcela_total)}</span></div>
                {simulacao.lance_embutido_ativo && simulacao.lance_embutido_valor > 0 && (
                  <div className="flex justify-between py-1.5"><span className="text-purple-800">(-) Lance Embutido ({simulacao.lance_embutido_percentual}%)</span><span className="font-semibold text-purple-700">- {formatCurrency(simulacao.lance_embutido_valor)}</span></div>
                )}
                {simulacao.lance_proprio_ativo && simulacao.lance_proprio_valor > 0 && (
                  <div className="flex justify-between py-1.5"><span className="text-purple-800">(-) Lance Próprio ({lanceProprioPercentual}%)</span><span className="font-semibold text-purple-700">- {formatCurrency(simulacao.lance_proprio_valor)}</span></div>
                )}
                <div className="flex justify-between py-1.5"><span className="text-orange-700">(-) 1ª Parcela (no ato)</span><span className="font-semibold text-orange-700">- {formatCurrency(primeiraParcelaNoAto)}</span></div>
                <div className="flex justify-between py-1.5"><span className="font-semibold text-slate-900">Saldo Restante</span><span className="font-bold text-slate-900">{formatCurrency(simulacao.saldo_apos_contemplacao)}</span></div>
                {simulacao.novo_prazo && simulacao.prazo_original && simulacao.novo_prazo < simulacao.prazo_original && (
                  <div className="flex justify-between py-1.5"><span className="text-slate-400">Carência</span><span className="text-slate-400">{simulacao.prazo_original - simulacao.novo_prazo - 1} meses</span></div>
                )}
                <div className="flex justify-between py-2"><span className="font-bold text-purple-800 text-base">Novo Prazo</span><span className="font-bold text-purple-900 text-lg">{simulacao.novo_prazo} meses</span></div>
                <div className="flex justify-between py-1.5"><span className="font-bold text-purple-800 text-base">Nova Parcela</span><span className="font-bold text-purple-900 text-lg">{formatCurrency(simulacao.nova_parcela)}</span></div>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="border-t border-slate-300 pt-3 text-center">
            <p className="text-xs text-slate-600 font-semibold">JD Promotora — Vendedor: {simulacao.usuario_nome} — Emissão: {new Date(simulacao.created_date || Date.now()).toLocaleDateString('pt-BR')}</p>
            <p className="text-xs text-slate-400 mt-1 italic">Simulação sujeita à alteração conforme regras da administradora, disponibilidade do grupo e resultado da assembleia. A análise de contemplação é baseada no histórico da última assembleia e não garante contemplação.</p>
          </div>
        </div>
      </div>
    </>
  );
}
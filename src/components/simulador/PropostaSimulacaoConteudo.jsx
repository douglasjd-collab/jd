import React from 'react';
import { Calendar, User, ShieldCheck, DollarSign } from 'lucide-react';

// Componente compartilhado de renderização da proposta de simulação de consórcio.
// Usado tanto pela tela de impressão (ImprimirSimulacao) quanto pelo link público
// (/proposta/:token) — garante que o link mostra exatamente o mesmo conteúdo do PDF.

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const CHANCE_LABELS = ['Baixa chance', 'Média chance', 'Boa chance', 'Forte chance'];
const CHANCE_COLORS = ['text-red-600', 'text-yellow-600', 'text-blue-600', 'text-green-700'];
const CHANCE_BG = ['bg-red-50 border-red-200', 'bg-yellow-50 border-yellow-200', 'bg-blue-50 border-blue-200', 'bg-green-50 border-green-200'];

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png';

export default function PropostaSimulacaoConteudo({ simulacao }) {
  if (!simulacao) return null;

  let cartas = [];
  try { cartas = JSON.parse(simulacao.cartas || '[]'); } catch { cartas = []; }

  const primeiraParcelaNoAto = Number(simulacao?.primeira_parcela_no_ato ?? 0);

  const lanceProprioPercentual = simulacao.lance_proprio_ativo && simulacao.credito_total > 0
    ? ((simulacao.lance_proprio_valor / simulacao.credito_total) * 100).toFixed(2) : '0';

  let analise = null;
  try { analise = simulacao.analise_contemplacao_json ? JSON.parse(simulacao.analise_contemplacao_json) : null; } catch { analise = null; }

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
    <div className="max-w-3xl mx-auto p-6 pt-16 print:pt-0 print:p-3">
      {/* Cabeçalho */}
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
        <div className="flex items-stretch px-5 py-4 gap-4">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="JD Promotora" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-lg font-bold tracking-wide text-[#001529] leading-tight">JD PROMOTORA</h1>
              <p className="text-xs text-slate-500">Simulação de Consórcio</p>
            </div>
          </div>
          <div className="w-px bg-slate-200 my-1" />
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-[#0047bb] shrink-0" />
            <div>
              <p className="text-sm font-bold text-[#001529] leading-tight">{new Date(simulacao.created_date || Date.now()).toLocaleDateString('pt-BR')}</p>
              <p className="text-xs text-slate-500">Data</p>
            </div>
          </div>
          <div className="w-px bg-slate-200 my-1" />
          <div className="flex items-center gap-2.5">
            <User className="w-5 h-5 text-[#0047bb] shrink-0" />
            <div>
              <p className="text-xs text-slate-500 leading-tight">Vendedor</p>
              <p className="text-sm font-bold text-[#001529] leading-tight">{simulacao.usuario_nome || '-'}</p>
            </div>
          </div>
          <div className="w-px bg-slate-200 my-1" />
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#0047bb] shrink-0" />
            <div>
              <p className="text-xs text-slate-500 leading-tight">Validade</p>
              <p className="text-sm font-bold text-[#001529] leading-tight">30 dias</p>
            </div>
          </div>
        </div>
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
      </div>

      {/* Dados do Cliente */}
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

      {/* Resumo */}
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

      {/* Cartas */}
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

      {/* Análise de Contemplação */}
      {renderAnalise()}

      {/* Valor que o Cliente Recebe + Resultado Final */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-[2fr_3fr] print:grid-cols-[2fr_3fr] gap-3">
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
  );
}
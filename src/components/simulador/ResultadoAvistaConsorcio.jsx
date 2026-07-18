import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, FileDown, Save, MessageCircle, Pencil, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtPct = (v) => `${(v || 0).toFixed(2)}%`;

// Exporta um pré-prompt pronto para colar no console-prompt
export default function ResultadoAvistaConsorcio({ simulacao, onEditarPremissas, onSalvar, onWhatsapp, onExportarPDF, salvando }) {
  const [verMemoria, setVerMemoria] = useState(false);
  const r = simulacao;

  const diffEqPositiva = r.diferencaEquivalente >= 0; // Consórcio superior

  return (
    <div className="space-y-5">
      {/* Banner primário: Resultado financeiro equivalente */}
      <div className={`rounded-2xl p-5 text-white ${diffEqPositiva ? 'bg-orange-500' : 'bg-[#083942]'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80 font-medium">Resultado Financeiro Equivalente (principal)</p>
            <p className="text-xl font-bold mt-1">
              {diffEqPositiva
                ? `Consórcio com patrimônio estimado R$ ${Math.abs(r.diferencaEquivalente).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} superior`
                : `Compra à vista com patrimônio estimado R$ ${Math.abs(r.diferencaEquivalente).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} superior`}
            </p>
            <p className="text-xs opacity-70 mt-1">Considerando o mesmo esforço financeiro mensal (aporte = parcela do consórcio)</p>
          </div>
          <MessageCircle className="w-9 h-9 opacity-80" />
        </div>
      </div>

      {/* Comparação simplificada (estratégia) — aviso */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
        <p className="font-semibold text-slate-700">Comparação simplificada da estratégia</p>
        <p className="text-slate-500 mt-1">
          Desembolso à vista: <strong>{fmt(r.desembolsoAvista)}</strong> · Custo líquido consórcio: <strong>{fmt(r.custoLiquidoConsorcio)}</strong> ·
          {'  '}Diferença a favor do {r.diferencaSimplificada > 0 ? 'consórcio' : 'à vista'}: <strong>{fmt(Math.abs(r.diferencaSimplificada))}</strong>
        </p>
        <p className="text-amber-700 mt-2">
          ⚠️ Este resultado não considera que o comprador à vista poderia investir mensalmente o valor das parcelas do consórcio.
        </p>
      </div>

      {/* Os 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* CARD 1 — À VISTA */}
        <Card className="border-0 shadow-sm border-l-4 border-l-[#10353C]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-[#10353C]">
              🛒 Compra à Vista
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Linha1 label="Valor pago pelo veículo" v={fmt(r.desembolsoAvista)} />
            <Linha1 label="Valor estimado do veículo ao final" v={fmt(r.valorFinalVeiculo)} t="blue" />
            <Linha1 label="Desvalorização acumulada" v={`−${fmt(r.perdaDesvalorizacao)}`} t="red" />
            <Linha1 label="Saldo inicial não utilizado" v={fmt(r.saldoInicialNaoUtilizadoAvista)} />
            <Linha1 label="Aportes mensais equivalentes (total)" v={fmt(r.invAportesTotalAportado)} />
            <Linha1 label="Saldo dos aportes ao final" v={fmt(r.invAportesSaldoFinal)} t="green" />
            <hr className="my-1.5" />
            <Linha1 label="Patrimônio final à vista" v={fmt(r.patrimonioAvista)} strong />
          </CardContent>
        </Card>

        {/* CARD 2 — CONSÓRCIO */}
        <Card className="border-0 shadow-sm border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
              🏦 Consórcio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Linha1 label="Carta de crédito" v={fmt(r.consorcio?.credito || 0)} />
            <Linha1 label={`Lance próprio (${r.percentualLance.toFixed(0)}%)`} v={fmt(r.valorLance)} />
            <Linha1 label="Investimento inicial" v={fmt(r.valorInvestimentoInicial)} />
            <Linha1 label="Parcelas pagas (total)" v={fmt(r.totalParcelasPagas)} />
            <Linha1 label="Total pago ao consórcio (lance + parcelas)" v={fmt(r.totalPagoConsorcio)} t="red" />
            <Linha1 label="Rendimento bruto estimado" v={fmt(r.invRendimentoBruto)} t="green" />
            <Linha1 label="Saldo final bruto do investimento" v={fmt(r.invValorFuturoBruto)} />
            <Linha1 label="Saldo final líquido (− impostos/taxas)" v={fmt(r.saldoFinalLiquidoConsorcio)} t="green" />
            <Linha1 label="Valor estimado do veículo ao final" v={fmt(r.valorFinalVeiculo)} />
            <hr className="my-1.5" />
            <Linha1 label="Patrimônio final no consórcio" v={fmt(r.patrimonioConsorcio)} strong />
          </CardContent>
        </Card>

        {/* CARD 3 — RESULTADO */}
        <Card className="border-0 shadow-sm border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
              📊 Resultado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Linha1 label="Resultado simplificado da estratégia" v={`${r.diferencaSimplificada > 0 ? 'Consórcio' : 'À vista'} ${fmt(Math.abs(r.diferencaSimplificada))}`} />
            <Linha1 label="Resultado financeiro equivalente" v={`${diffEqPositiva ? 'Consórcio' : 'À vista'} ${fmt(Math.abs(r.diferencaEquivalente))}`} strong t="blue" />
            <Linha1 label="Diferença patrimonial" v={fmt(Math.abs(r.diferencaEquivalente))} />
            <hr className="my-1.5" />
            <p className="text-xs font-semibold text-slate-600 mt-1">Premissas</p>
            <ul className="text-xs text-slate-500 list-disc pl-4 space-y-0.5">
              <li>Veículo: {r.consorcio?.administradora || '—'}</li>
              <li>Prazo análise: {r.prazoAnalise} meses</li>
              <li>Reajuste anual: {(parseFloat(r.consorcio?.reajusteAnual) || 0).toFixed(1)}% a.a.</li>
              <li>Rentabilidade: {fmtPct(parseFloat(r.investimento?.rentabilidadeMensal) || 0)} a.m.</li>
              <li>Origem do cronograma pós-lance: {r.origemCronograma === 'oficial' ? 'Cálculo oficial do plano' : 'Estimativa sujeita a recálculo'}</li>
            </ul>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-700 mt-1">
              <AlertTriangle className="w-3 h-3 inline mr-1" /> Simulação informativa. Contemplação depende de assembleia. Rentabilidade de fundos não é garantida.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Memória de cálculo */}
      <Card className="border-0 shadow-sm">
        <button onClick={() => setVerMemoria(!verMemoria)} className="w-full text-left px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Ver memória de cálculo</span>
          {verMemoria ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {verMemoria && (
          <CardContent className="pt-0 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              <Mem label="Custo nominal original (parcela × prazo)" v={fmt(r.memoria.custoNominalOriginal)} />
              <Mem label="Lance próprio" v={fmt(r.memoria.lance)} />
              <Mem label="Saldo nominal projetado" v={fmt(r.memoria.saldoNominalProjetado)} />
              <Mem label="Parcela-base projetada (após lance)" v={fmt(r.memoria.parcelaBaseProjetada)} />
              <Mem label="Parcelas pagas antes da contemplação" v={fmt(r.memoria.parcelasAntesContemplacao)} />
              <Mem label="Total parcelas pagas (todas as restantes)" v={fmt(r.memoria.totalParcelasPagas)} />
              <Mem label="Total pago ao consórcio (lance + parcelas)" v={fmt(r.memoria.totalPagoConsorcio)} />
              <Mem label="Investimento inicial" v={fmt(r.memoria.investimentoInicial)} />
              <Mem label="Valor futuro bruto do investimento" v={fmt(r.memoria.valorFuturoBrutoInvest)} />
              <Mem label="Rendimento bruto do investimento" v={fmt(r.memoria.rendimentoBruto)} />
              <Mem label="Impostos/taxas informados" v={fmt(r.memoria.taxasImpostos)} />
              <Mem label="Saldo final líquido (consórcio)" v={fmt(r.memoria.saldoFinalLiquidoConsorcio)} />
              <Mem label="Total aportado mensalmente (à vista)" v={fmt(r.memoria.aportesEquivalentesTotal)} />
              <Mem label="Saldo final dos aportes mensais (à vista)" v={fmt(r.memoria.aportesSaldoFinal)} />
              <Mem label="Valor final do veículo" v={fmt(r.memoria.valorFinalVeiculo)} />
              <Mem label="Perda por desvalorização" v={`−${fmt(r.memoria.perdaDesvalorizacao)}`} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Botões */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onEditarPremissas} variant="outline" className="gap-1.5 flex-1 min-w-[160px]">
          <Pencil className="w-4 h-4" /> Editar premissas
        </Button>
        <Button onClick={onSalvar} disabled={salvando} variant="outline" className="gap-1.5 flex-1 min-w-[160px]">
          <Save className="w-4 h-4" /> {salvando ? 'Salvando...' : 'Salvar simulação'}
        </Button>
        <Button onClick={onExportarPDF} className="gap-1.5 flex-1 min-w-[160px]">
          <FileDown className="w-4 h-4" /> Gerar PDF
        </Button>
        <Button onClick={onWhatsapp} variant="outline" className="gap-1.5 flex-1 min-w-[160px]">
          <MessageCircle className="w-4 h-4" /> Enviar pelo WhatsApp
        </Button>
      </div>

      <p className="text-xs text-slate-400 text-center italic">
        Simulação informativa baseada nas premissas selecionadas. A contemplação por lance depende da assembleia.
        Rentabilidade estimada. Fundos imobiliários possuem oscilação nas cotas e nos rendimentos.
      </p>
    </div>
  );
}

function Linha1({ label, v, t, strong }) {
  const cor = t === 'red' ? 'text-red-600' : t === 'green' ? 'text-emerald-600' : t === 'blue' ? 'text-blue-600' : 'text-slate-700';
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`${cor} ${strong ? 'font-bold' : 'font-medium'}`}>{v}</span>
    </div>
  );
}

function Mem({ label, v }) {
  return (
    <div className="flex justify-between border-b border-dashed border-slate-100 pb-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{v}</span>
    </div>
  );
}
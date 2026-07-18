import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, Trophy, Calculator, FileDown, Loader2, ChevronRight,
  Building2, Car, Truck, Cpu, Package, DollarSign, BarChart3, Info
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ChatFlutuante from '@/components/chat/ChatFlutuante';
import { simularAvistaConsorcio, TAXAS_DESVAL_PADRAO } from '@/components/simulador/avistaConsorcioCalc';
import ResultadoAvistaConsorcio from '@/components/simulador/ResultadoAvistaConsorcio';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtPct = (v) => `${(v || 0).toFixed(2)}%`;

const TIPO_BEM_OPTIONS = [
  { value: 'imovel', label: 'Imóvel', icon: Building2 },
  { value: 'automovel', label: 'Automóvel', icon: Car },
  { value: 'caminhao', label: 'Caminhão', icon: Truck },
  { value: 'maquinas', label: 'Máquinas', icon: Cpu },
  { value: 'outros', label: 'Outros', icon: Package },
];

const COMPARACAO_OPTIONS = [
  { value: 'avista_consorcio', label: 'À Vista × Consórcio' },
  { value: 'financiamento_consorcio', label: 'Financiamento × Consórcio' },
  { value: 'completo', label: 'Comparativo Completo' },
];

// Cálculo VF de aportes mensais: PMT × ((1+i)^n - 1) / i
function vfAportesMensais(pmt, i, n) {
  if (i === 0) return pmt * n;
  return pmt * (Math.pow(1 + i, n) - 1) / i;
}

// Cálculo VF de capital único: C × (1+i)^n
function vfCapital(c, i, n) {
  return c * Math.pow(1 + i, n);
}

// Parcela PRICE
function parcelaPRICE(pv, i, n) {
  if (i === 0) return pv / n;
  return pv * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

export default function SimuladorInteligente() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Formulário
  const [tipoBem, setTipoBem] = useState('imovel');
  const [tipoComparacao, setTipoComparacao] = useState('completo');
  const [valorBem, setValorBem] = useState('');
  const [valorDisponivel, setValorDisponivel] = useState('');
  const [percentualLance, setPercentualLance] = useState('50');

  // Consórcio
  const [parcelaConsorcio, setParcelaConsorcio] = useState('');
  const [prazoConsorcio, setPrazoConsorcio] = useState('');
  const [reajusteAnual, setReajusteAnual] = useState('3');

  // Desvalorização
  const [desvalorizacaoAnual, setDesvalorizacaoAnual] = useState('10');

  // Investimento
  const [rentabilidadeMensal, setRentabilidadeMensal] = useState('1.00');
  const [prazoAnalise, setPrazoAnalise] = useState('');

  // Financiamento
  const [taxaJurosAnual, setTaxaJurosAnual] = useState('12');
  const [sistemaFinanciamento, setSistemaFinanciamento] = useState('PRICE');
  const [prazoFinanciamento, setPrazoFinanciamento] = useState('');

  // ===== À Vista × Consórcio =====
  const [condicaoVeiculo, setCondicaoVeiculo] = useState('zero'); // 'zero' | 'seminovo'
  const [idadeVeiculo, setIdadeVeiculo] = useState('3');
  const [valorAtualSeminovo, setValorAtualSeminovo] = useState('');
  const [anoModelo, setAnoModelo] = useState('');
  const [periodoPosseMeses, setPeriodoPosseMeses] = useState('');
  const [dataPrevistaCompra, setDataPrevistaCompra] = useState('');
  const [taxasDesvalorCustom, setTaxasDesvalorCustom] = useState(TAXAS_DESVAL_PADRAO);
  const [taxasDesvalorEditorOpen, setTaxasDesvalorEditorOpen] = useState(false);
  // Consórcio detalhado
  const [consAdmin, setConsAdmin] = useState('');
  const [consPlano, setConsPlano] = useState('');
  const [consGrupo, setConsGrupo] = useState('');
  const [consCredito, setConsCredito] = useState('');
  const [consPrazo, setConsPrazo] = useState('');
  const [consParcelaInicial, setConsParcelaInicial] = useState('');
  const [consTaxaAdm, setConsTaxaAdm] = useState('');
  const [consFundoReserva, setConsFundoReserva] = useState('');
  const [consSeguro, setConsSeguro] = useState('');
  const [consOutros, setConsOutros] = useState('');
  const [consReajusteAnual, setConsReajusteAnual] = useState('4.5');
  const [consMesContemplacao, setConsMesContemplacao] = useState('1');
  const [consFormaAbatimento, setConsFormaAbatimento] = useState('reduzir_parcelas'); // 'reduzir_parcelas' | 'reduzir_prazo' | 'regra_administradora'
  const [consParcelaOficial, setConsParcelaOficial] = useState(''); // string com cronograma oficial separado por vírgula (opcional)
  // Investimento detalhado
  const [invRentabilidadeMensal, setInvRentabilidadeMensal] = useState('1.20');
  const [invPrazo, setInvPrazo] = useState('');
  const [invReinvestir, setInvReinvestir] = useState(true);
  const [invTaxasImpostos, setInvTaxasImpostos] = useState('');
  const [resultadoAvista, setResultadoAvista] = useState(null);

  const [resultado, setResultado] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const simulacaoRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      if (me) {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 1);
        setUser({ ...me, empresa_id: colabs?.[0]?.empresa_id, colaborador_id: colabs?.[0]?.id, nome: colabs?.[0]?.nome || me.full_name });
      }
      setLoadingUser(false);
    }).catch(() => setLoadingUser(false));
  }, []);

  const handleMoedaInput = (v) => {
    const n = v.replace(/\D/g, '');
    return n ? (parseFloat(n) / 100).toString() : '';
  };

  const fmtInput = (v) => {
    if (!v) return '';
    const n = parseFloat(v);
    if (isNaN(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const calcular = () => {
    const vBem = parseFloat(valorBem) || 0;
    const vDisp = parseFloat(valorDisponivel) || 0;
    const parcCons = parseFloat(parcelaConsorcio) || 0;
    const prazoCons = parseInt(prazoConsorcio) || 0;
    const reaj = parseFloat(reajusteAnual) / 100;
    const rentMes = parseFloat(rentabilidadeMensal) / 100;
    const prazo = parseInt(prazoAnalise) || prazoCons;
    const taxaAnual = parseFloat(taxaJurosAnual) / 100;
    const taxaMes = Math.pow(1 + taxaAnual, 1 / 12) - 1;
    const prazoFin = parseInt(prazoFinanciamento) || prazo;

    if (vBem <= 0) { toast.error('Informe o valor do bem'); return; }
    if (prazo <= 0) { toast.error('Informe o prazo de análise'); return; }

    setCalculando(true);

    // Desvalorização mensal do bem
    const desvalAnual = parseFloat(desvalorizacaoAnual) / 100;
    const desvalMes = Math.pow(1 - desvalAnual, 1 / 12) - 1; // negativo
    // Valor do bem ao final do prazo após desvalorização
    const valorBemFinal = vBem * Math.pow(1 - desvalAnual, prazo / 12);

    // ===== CENÁRIO 1: À VISTA =====
    // Cliente usa 100% do capital para comprar à vista. Capital investido restante = R$0.
    // O que investe mensalmente é o equivalente à parcela do consórcio (oportunidade).
    const pmtInvestimento = parcCons > 0 ? parcCons : (vBem / prazo);
    const vfInvestAVista = vfAportesMensais(pmtInvestimento, rentMes, prazo);
    // Patrimônio: valor residual do bem + investimento mensal acumulado
    const patrimonioAVista = valorBemFinal + vfInvestAVista;

    // Série mensal cenário 1
    const serieAVista = [];
    for (let m = 1; m <= prazo; m++) {
      const acum = vfAportesMensais(pmtInvestimento, rentMes, m);
      const bemResidual = vBem * Math.pow(1 - desvalAnual, m / 12);
      serieAVista.push({ mes: m, patrimonio: bemResidual + acum, investimento: acum, bemResidual });
    }

    // ===== CENÁRIO 2: CONSÓRCIO + LANCE + INVESTIMENTO DO RESTANTE =====
    // Lance próprio = Capital disponível × percentual de lance
    // Capital investido = Capital disponível - lance próprio
    const pctLance = parseFloat(percentualLance) / 100;
    const valorLance = vDisp * pctLance;
    const capitalInvestidoConsorcio = vDisp - valorLance; // restante fica investido

    // Total parcelas reajustadas
    let totalParcelasPagas = 0;
    let serieParcelas = [];
    for (let m = 1; m <= prazoCons; m++) {
      const anoAtual = Math.floor((m - 1) / 12);
      const parcelaReajustada = parcCons * Math.pow(1 + reaj, anoAtual);
      totalParcelasPagas += parcelaReajustada;
      serieParcelas.push({ mes: m, parcela: parcelaReajustada });
    }

    // VF do capital restante investido por prazo de análise
    const vfInvestConsorcio = capitalInvestidoConsorcio > 0
      ? vfCapital(capitalInvestidoConsorcio, rentMes, prazo)
      : 0;

    // Série mensal consórcio
    const serieConsorcio = [];
    for (let m = 1; m <= prazo; m++) {
      const vfInv = capitalInvestidoConsorcio > 0 ? vfCapital(capitalInvestidoConsorcio, rentMes, m) : 0;
      const parcelasAteM = Math.min(m, prazoCons);
      let totParcM = 0;
      for (let k = 1; k <= parcelasAteM; k++) {
        const ano = Math.floor((k - 1) / 12);
        totParcM += parcCons * Math.pow(1 + reaj, ano);
      }
      const bemResidual = vBem * Math.pow(1 - desvalAnual, m / 12);
      serieConsorcio.push({ mes: m, patrimonio: bemResidual + vfInv - totParcM, investimento: vfInv, bemResidual });
    }

    // Patrimônio consórcio: valor residual + investimento - parcelas pagas
    const patrimonioConsorcio = valorBemFinal + vfInvestConsorcio - totalParcelasPagas;

    // ===== CENÁRIO 3: FINANCIAMENTO =====
    // Cliente usa o capital disponível como entrada, financia o restante.
    // Capital investido = R$0 (usou tudo como entrada)
    const entrada = vDisp;
    const valorFinanciado = Math.max(0, vBem - entrada);
    let parcelaFin = 0;
    let totalJurosFin = 0;

    if (valorFinanciado > 0 && prazoFin > 0) {
      if (sistemaFinanciamento === 'PRICE') {
        parcelaFin = parcelaPRICE(valorFinanciado, taxaMes, prazoFin);
        totalJurosFin = parcelaFin * prazoFin - valorFinanciado;
      } else {
        // SAC: amortização constante
        const amort = valorFinanciado / prazoFin;
        let saldoSAC = valorFinanciado;
        for (let m = 1; m <= prazoFin; m++) {
          const juros = saldoSAC * taxaMes;
          totalJurosFin += juros;
          saldoSAC -= amort;
        }
        parcelaFin = (valorFinanciado / prazoFin) + (valorFinanciado * taxaMes); // 1ª parcela SAC
      }
    }

    // No financiamento, capital foi usado como entrada → capital investido = 0
    const capitalInvestidoFin = 0;
    const vfInvestFin = 0;
    const totalPagoFin = parcelaFin * prazoFin;
    const patrimonioFinanciamento = valorBemFinal + vfInvestFin - totalJurosFin;

    // Série mensal financiamento (bem também desvaloriza)
    const serieFinanciamento = [];
    for (let m = 1; m <= prazo; m++) {
      const vfInv = capitalInvestidoFin > 0 ? vfCapital(capitalInvestidoFin, rentMes, m) : 0;
      const mesesPagosFin = Math.min(m, prazoFin);
      let jurosPagosM = 0;
      if (sistemaFinanciamento === 'PRICE') {
        jurosPagosM = Math.max(0, parcelaFin * mesesPagosFin - (valorFinanciado - valorFinanciado * Math.pow(1 + taxaMes, mesesPagosFin) / Math.pow(1 + taxaMes, prazoFin)));
      } else {
        const amort = valorFinanciado / prazoFin;
        let saldo = valorFinanciado;
        for (let k = 1; k <= mesesPagosFin; k++) {
          jurosPagosM += saldo * taxaMes;
          saldo -= amort;
        }
      }
      const bemResidual = vBem * Math.pow(1 - desvalAnual, m / 12);
      serieFinanciamento.push({ mes: m, patrimonio: bemResidual + vfInv - jurosPagosM, investimento: vfInv, bemResidual });
    }

    // Combinar séries para gráficos — amostrar a cada 12 meses
    const dadosGrafico = [];
    for (let m = 12; m <= prazo; m += 12) {
      const idx = m - 1;
      dadosGrafico.push({
        mes: `${m}m`,
        avista: Math.round(serieAVista[idx]?.patrimonio || 0),
        consorcio: Math.round(serieConsorcio[idx]?.patrimonio || 0),
        financiamento: Math.round(serieFinanciamento[idx]?.patrimonio || 0),
        invAvista: Math.round(serieAVista[idx]?.investimento || 0),
        invConsorcio: Math.round(serieConsorcio[idx]?.investimento || 0),
        invFin: Math.round(serieFinanciamento[idx]?.investimento || 0),
        parcela: Math.round(serieParcelas[idx]?.parcela || 0),
        bemResidual: Math.round(serieAVista[idx]?.bemResidual || 0),
      });
    }

    // Diferença patrimonial acumulada entre melhor e pior
    const valores = [
      { nome: 'À Vista', valor: patrimonioAVista },
      { nome: 'Consórcio', valor: patrimonioConsorcio },
      { nome: 'Financiamento', valor: patrimonioFinanciamento },
    ];
    const melhor = valores.reduce((a, b) => a.valor > b.valor ? a : b);
    const pior = valores.reduce((a, b) => a.valor < b.valor ? a : b);
    const diferenca = melhor.valor - pior.valor;
    const diferencaPct = pior.valor > 0 ? (diferenca / Math.abs(pior.valor)) * 100 : 0;

    const dadosDiferenca = dadosGrafico.map(d => ({
      mes: d.mes,
      diferenca: Math.round(Math.max(d.avista, d.consorcio, d.financiamento) - Math.min(d.avista, d.consorcio, d.financiamento)),
    }));

    setResultado({
      patrimonioAVista,
      patrimonioConsorcio,
      patrimonioFinanciamento,
      valorBemFinal,
      desvalorizacaoAnual: desvalAnual * 100,
      desvalorizacaoTotal: ((1 - valorBemFinal / vBem) * 100),
      melhor,
      pior,
      diferenca,
      diferencaPct,
      dadosGrafico,
      dadosDiferenca,
      serieParcelas,
      pmtInvestimento,
      vfInvestAVista,
      vfInvestConsorcio,
      vfInvestFin,
      totalParcelasPagas,
      capitalInvestidoConsorcio,
      capitalInvestidoFin,
      parcelaFin,
      totalJurosFin,
      totalPagoFin,
      entrada,
      valorFinanciado,
      valorLance,
      valorDisponivel: vDisp,
      percentualLance: pctLance * 100,
    });

    setCalculando(false);
    toast.success('Simulação calculada com sucesso!');
  };

  // ===== Cálculo do modo À Vista × Consórcio =====
  const calcularAvistaConsorcio = () => {
    const vBem = parseFloat(valorBem) || 0;
    const vDisp = parseFloat(valorDisponivel) || 0;
    const pct = parseFloat(percentualLance) || 0;
    const prazo = parseInt(periodoPosseMeses) || 0;
    // Se capital = valor do veículo, à vista usa 100% do capital
    const credit = parseFloat(consCredito) || vBem;

    const consorcio = {
      administradora: consAdmin || consPlano || '—',
      plano: consPlano,
      grupo: consGrupo,
      credito: credit,
      prazo: parseInt(consPrazo) || prazo,
      parcelaInicial: parseFloat(consParcelaInicial) || 0,
      taxaAdm: parseFloat(consTaxaAdm) || 0,
      fundoReserva: parseFloat(consFundoReserva) || 0,
      seguro: parseFloat(consSeguro) || 0,
      outros: parseFloat(consOutros) || 0,
      reajusteAnual: parseFloat(consReajusteAnual) || 0,
      mesContemplacao: parseInt(consMesContemplacao) || 1,
      formaAbatimento: consFormaAbatimento,
      parcelaOficialPosLance: consParcelaOficial
        ? consParcelaOficial.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n))
        : null,
    };
    const investimento = {
      rentabilidadeMensal: parseFloat(invRentabilidadeMensal) || 0,
      prazo: parseInt(invPrazo) || prazo,
      reinvestir: invReinvestir,
      taxasImpostos: parseFloat(invTaxasImpostos) || 0,
    };

    const sim = simularAvistaConsorcio({
      valorVeiculo: vBem,
      condicaoVeiculo,
      idadeVeiculoAnos: parseInt(idadeVeiculo) || 0,
      capitalDisponivel: vDisp,
      percentualLance: pct,
      prazoAnalise: prazo,
      dataPrevistaCompra,
      consorcio,
      investimento,
      taxasCustomDesvalor: taxasDesvalorCustom,
    });

    if (!sim.ok) {
      toast.error(sim.erros[0] || 'Erro no cálculo');
      setResultadoAvista(null);
      return;
    }

    setResultadoAvista({
      ...sim,
      awakeForm: {
        valorBem, valorDisponivel, percentualLance, periodoPosseMeses, condicaoVeiculo,
        idadeVeiculo, consCredito, consPlano, consPrazo, consParcelaInicial,
        consReajusteAnual, consMesContemplacao, consFormaAbatimento,
        rentabilidadeMensal: invRentabilidadeMensal,
      },
    });
    toast.success('Simulação À Vista × Consórcio calculada');
  };

  const salvarHistoricoAvista = async () => {
    if (!resultadoAvista || !user) return;
    setSalvando(true);
    try {
      await base44.entities.Simulacao.create({
        empresa_id: user.empresa_id,
        cliente_nome: 'Simulador À Vista × Consórcio',
        tipo_grupo: tipoBem,
        credito_total: parseFloat(consCredito) || parseFloat(valorBem) || 0,
        usuario_id: user.id,
        usuario_nome: user.nome,
        status: 'ativa',
        observacoes: JSON.stringify({
          tipo: 'avista_consorcio',
          patrimonioAvista: resultadoAvista.patrimonioAvista,
          patrimonioConsorcio: resultadoAvista.patrimonioConsorcio,
          diferencaEquivalente: resultadoAvista.diferencaEquivalente,
        }),
      });
      toast.success('Simulação salva!');
    } catch {
      toast.error('Erro ao salvar simulação');
    } finally {
      setSalvando(false);
    }
  };

  const gerarPDFAvista = () => {
    if (!resultadoAvista) return;
    const r = resultadoAvista;
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(8, 57, 66); doc.rect(0, 0, pw, 28, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('JD PROMOTORA — À Vista × Consórcio', 14, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleString('pt-BR'), pw - 14, 12, { align: 'right' });

    doc.setFontSize(9); doc.setTextColor(8, 57, 66); doc.setFont('helvetica', 'bold');
    doc.text('Comparação financeira equivalente', 14, 38);
    doc.setFontSize(10);
    doc.text(r.diferencaEquivalente >= 0 ? 'Consórcio superior' : 'À vista superior', 14, 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    doc.text(`Diferença: ${fmt(Math.abs(r.diferencaEquivalente))}`, 14, 50);
    doc.text(`Comparação simplificada: ${fmt(Math.abs(r.diferencaSimplificada))} a favor do ${r.diferencaSimplificada > 0 ? 'consórcio' : 'à vista'}`, 14, 55);

    doc.autoTable({
      startY: 62,
      head: [['Indicador', 'Compra à Vista', 'Consórcio']],
      body: [
        ['Patrimônio final', fmt(r.patrimonioAvista), fmt(r.patrimonioConsorcio)],
        ['Valor final do veículo', fmt(r.valorFinalVeiculo), fmt(r.valorFinalVeiculo)],
        ['Investimento / Aportes', fmt(r.invAportesSaldoFinal), fmt(r.saldoFinalLiquidoConsorcio)],
        ['Total pago ao consórcio (lance + parcelas)', '—', fmt(r.totalPagoConsorcio)],
        ['Perda por desvalorização', `−${fmt(r.perdaDesvalorizacao)}`, `−${fmt(r.perdaDesvalorizacao)}`],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [8, 57, 66], textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });

    const parmsY = doc.lastAutoTable.finalY + 8;
    doc.autoTable({
      startY: parmsY,
      head: [['Premissas', 'Valor']],
      body: [
        ['Valor do veículo', fmt(parseFloat(valorBem))],
        ['Capital disponível', fmt(parseFloat(valorDisponivel))],
        ['Lance próprio', `${(parseFloat(percentualLance) || 0).toFixed(0)}%   (${fmt(r.valorLance)})`],
        ['Investimento inicial', fmt(r.valorInvestimentoInicial)],
        ['Prazo de análise (meses)', r.prazoAnalise],
        ['Rentabilidade mensal (%)', fmtPct(parseFloat(invRentabilidadeMensal) || 0)],
        ['Reajuste anual (%)', (parseFloat(consReajusteAnual) || 0).toFixed(1) + '%'],
        ['Forma de abatimento',
          r.formaAbatimento === 'reduzir_parcelas' ? 'Reduzir parcelas'
          : r.formaAbatimento === 'reduzir_prazo' ? 'Reduzir prazo'
          : 'Regra administradora'],
        ['Origem do cronograma pós-lance',
          r.origemCronograma === 'oficial' ? 'Cálculo oficial' : 'Estimativa proporcional'],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [8, 57, 66], textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
      tableWidth: (pw - 28) / 1.5,
    });

    const footY = doc.internal.pageSize.getHeight() - 18;
    doc.setFillColor(8, 57, 66); doc.rect(0, footY, pw, 18, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('Simulação informativa baseada nas premissas selecionadas. A contemplação por lance depende da assembleia.', pw / 2, footY + 6, { align: 'center' });
    doc.text('Rentabilidade estimada. Fundos imobiliários possuem oscilação nas cotas e nos rendimentos.', pw / 2, footY + 11, { align: 'center' });

    doc.save(`avista_consorcio_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('PDF gerado!');
  };

  const salvarHistorico = async () => {
    if (!resultado || !user) return;
    setSalvando(true);
    try {
      await base44.entities.Simulacao.create({
        empresa_id: user.empresa_id,
        cliente_nome: 'Simulador Inteligente',
        tipo_grupo: tipoBem,
        credito_total: parseFloat(valorBem) || 0,
        usuario_id: user.id,
        usuario_nome: user.nome,
        status: 'ativa',
        observacoes: JSON.stringify({
          tipo: 'simulador_inteligente',
          melhorEstrategia: resultado.melhor.nome,
          patrimonioFinal: resultado.melhor.valor,
          diferenca: resultado.diferenca,
        }),
      });
      toast.success('Histórico salvo!');
    } catch {
      toast.error('Erro ao salvar histórico');
    } finally {
      setSalvando(false);
    }
  };

  const gerarPDF = () => {
    if (!resultado) return;
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(8, 57, 66);
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('JD PROMOTORA', 14, 12);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text('Simulador Patrimonial Inteligente', 14, 20);
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), pageWidth - 14, 12, { align: 'right' });
    doc.text(`Bem: ${TIPO_BEM_OPTIONS.find(t => t.value === tipoBem)?.label || tipoBem}  |  Valor: ${fmt(parseFloat(valorBem))}`, pageWidth - 14, 20, { align: 'right' });

    // Badge melhor estratégia
    doc.setFillColor(35, 190, 132);
    doc.roundedRect(14, 38, pageWidth - 28, 14, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`🏆  Melhor Estratégia: ${resultado.melhor.nome}  —  ${fmt(resultado.melhor.valor)}`, pageWidth / 2, 47, { align: 'center' });

    // Cards resumo
    const cards = [
      { label: 'Compra À Vista', valor: resultado.patrimonioAVista, cor: [8, 57, 66] },
      { label: 'Consórcio + Investimento', valor: resultado.patrimonioConsorcio, cor: [245, 137, 65] },
      { label: 'Financiamento + Investimento', valor: resultado.patrimonioFinanciamento, cor: [59, 130, 246] },
    ];
    const cardW = (pageWidth - 28 - 8) / 3;
    cards.forEach((c, i) => {
      const x = 14 + i * (cardW + 4);
      doc.setFillColor(...c.cor);
      doc.roundedRect(x, 58, cardW, 20, 0.8, 0.8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      doc.text(c.label, x + 2, 63);
      doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
      doc.text(fmt(c.valor), x + 2, 73);
    });

    // Diferença
    doc.setFillColor(245, 250, 245);
    doc.roundedRect(14, 84, pageWidth - 28, 10, 0.8, 0.8, 'F');
    doc.setTextColor(35, 190, 132);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(`Diferença Patrimonial: ${fmt(resultado.diferenca)}  (+${resultado.diferencaPct.toFixed(2)}%)`, pageWidth / 2, 91, { align: 'center' });

    // Tabela comparativa
    doc.autoTable({
      startY: 100,
      head: [['Estratégia', 'Patrimônio Final', 'Investimento Acum.', 'Custo Total', 'Resultado']],
      body: [
        ['Compra À Vista', fmt(resultado.patrimonioAVista), fmt(resultado.vfInvestAVista), fmt(parseFloat(valorBem)), resultado.melhor.nome === 'À Vista' ? '🏆 Melhor' : '-'],
        ['Consórcio + Investimento', fmt(resultado.patrimonioConsorcio), fmt(resultado.vfInvestConsorcio), fmt(resultado.totalParcelasPagas), resultado.melhor.nome === 'Consórcio' ? '🏆 Melhor' : '-'],
        ['Financiamento + Investimento', fmt(resultado.patrimonioFinanciamento), fmt(resultado.vfInvestFin), fmt(resultado.totalJurosFin), resultado.melhor.nome === 'Financiamento' ? '🏆 Melhor' : '-'],
      ],
      styles: { fontSize: 7, cellPadding: 2.5 },
      headStyles: { fillColor: [8, 57, 66], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 250, 248] },
      columnStyles: { 4: { halign: 'center' } },
      margin: { left: 14, right: 14 },
    });

    // Parâmetros
    const parY = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(8, 57, 66);
    doc.text('Parâmetros da Simulação', 14, parY);
    doc.autoTable({
      startY: parY + 3,
      body: [
        ['Valor do Bem', fmt(parseFloat(valorBem))],
        ['Capital Disponível', fmt(parseFloat(valorDisponivel))],
        ['Rentabilidade Mensal', fmtPct(parseFloat(rentabilidadeMensal))],
        ['Prazo de Análise', `${prazoAnalise} meses`],
        ['Parcela Consórcio', fmt(parseFloat(parcelaConsorcio))],
        ['Reajuste Anual', `${reajusteAnual}% a.a.`],
        ['Taxa Financiamento', `${taxaJurosAnual}% a.a.`],
      ],
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [245, 247, 248] }, 1: { halign: 'right' } },
      margin: { left: 14, right: 14 },
      tableWidth: (pageWidth - 28) / 2,
    });

    // Rodapé
    const footY = doc.internal.pageSize.getHeight() - 14;
    doc.setFillColor(8, 57, 66);
    doc.rect(0, footY - 2, pageWidth, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.text('Simulação estimativa sujeita às condições vigentes, reajustes contratuais, contemplação e regras da administradora.', pageWidth / 2, footY + 4, { align: 'center' });
    doc.text('JD PROMOTORA  —  www.jdpromotora.com.br', pageWidth / 2, footY + 8, { align: 'center' });

    doc.save(`simulador_inteligente_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('PDF gerado!');
  };

  if (loadingUser) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-[#23BE84]" />
    </div>
  );

  const melhorNome = resultado?.melhor?.nome;
  const corMelhor = melhorNome === 'Consórcio' ? 'bg-orange-500' : melhorNome === 'À Vista' ? 'bg-[#10353C]' : 'bg-blue-500';

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#083942] to-[#10353C] rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-[#23BE84]/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#23BE84]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Simulador Patrimonial Inteligente</h1>
            <p className="text-white/60 text-sm">Compare estratégias e descubra qual gera mais patrimônio para seu cliente</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Formulário */}
        <div className="xl:col-span-1 space-y-4">
          {/* Dados Principais */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#23BE84]" /> Dados Principais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase">Tipo do Bem</Label>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {TIPO_BEM_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setTipoBem(opt.value)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs transition-all ${tipoBem === opt.value ? 'border-[#23BE84] bg-emerald-50 text-[#10353C] font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      >
                        <Icon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase">Tipo de Comparação</Label>
                <Select value={tipoComparacao} onValueChange={setTipoComparacao}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPARACAO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Valor do Bem (R$)</Label>
                <Input value={fmtInput(valorBem)} onChange={e => setValorBem(handleMoedaInput(e.target.value))} placeholder="0,00" className="h-9 mt-1" />
              </div>

              {/* Painel Capital Disponível */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <Label className="text-xs font-semibold text-slate-600 uppercase">Capital Disponível do Cliente</Label>
                <Input value={fmtInput(valorDisponivel)} onChange={e => setValorDisponivel(handleMoedaInput(e.target.value))} placeholder="0,00" className="h-9" />
                <p className="text-xs text-slate-500">Valor total que o cliente possui hoje para comprar à vista.</p>

                {/* Como o capital é usado em cada cenário */}
                <div className="pt-1 space-y-1 text-xs border-t border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>🏠 <strong>À Vista:</strong> usa 100% para comprar</span>
                    <span className="font-semibold text-[#10353C]">{valorDisponivel ? fmt(parseFloat(valorDisponivel)) : '—'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>🏦 <strong>Financiamento:</strong> usa 100% como entrada</span>
                    <span className="font-semibold text-blue-600">{valorDisponivel ? fmt(parseFloat(valorDisponivel)) : '—'}</span>
                  </div>
                </div>

                {/* Percentual de lance — só para consórcio */}
                <div className="pt-2 border-t border-slate-200">
                  <Label className="text-xs font-semibold text-orange-700">🔶 Consórcio — Lance Próprio (%)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number" min="0" max="100" step="1"
                      value={percentualLance}
                      onChange={e => setPercentualLance(e.target.value)}
                      className="h-9 w-24"
                    />
                    <span className="text-xs text-slate-500">% do capital disponível</span>
                  </div>
                  {valorDisponivel && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                        <p className="text-xs text-orange-600">Lance próprio</p>
                        <p className="font-bold text-orange-700 text-sm">{fmt(parseFloat(valorDisponivel) * parseFloat(percentualLance) / 100)}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                        <p className="text-xs text-emerald-600">Fica investido</p>
                        <p className="font-bold text-emerald-700 text-sm">{fmt(parseFloat(valorDisponivel) * (1 - parseFloat(percentualLance) / 100))}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Rentabilidade Mensal (%)</Label>
                  <Input type="number" step="0.01" value={rentabilidadeMensal} onChange={e => setRentabilidadeMensal(e.target.value)} placeholder="1.00" className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Prazo de Análise (meses)</Label>
                  <Input type="number" value={prazoAnalise} onChange={e => setPrazoAnalise(e.target.value)} placeholder="218" className="h-9 mt-1" />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase">Desvalorização Anual do Bem (%)</Label>
                <Input type="number" step="0.5" value={desvalorizacaoAnual} onChange={e => setDesvalorizacaoAnual(e.target.value)} placeholder="10" className="h-9 mt-1" />
                {valorBem && prazoAnalise && (
                  <p className="text-xs text-orange-600 mt-1">
                    Valor residual após {prazoAnalise}m: <strong>{fmt(parseFloat(valorBem) * Math.pow(1 - parseFloat(desvalorizacaoAnual) / 100, parseInt(prazoAnalise) / 12))}</strong>
                    {' '}(−{((1 - Math.pow(1 - parseFloat(desvalorizacaoAnual) / 100, parseInt(prazoAnalise) / 12)) * 100).toFixed(1)}%)
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Consórcio */}
          {(tipoComparacao === 'avista_consorcio' || tipoComparacao === 'completo') && (
            <Card className="border-0 shadow-sm border-l-4 border-l-orange-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Dados do Consórcio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Parcela Mensal (R$)</Label>
                    <Input value={fmtInput(parcelaConsorcio)} onChange={e => setParcelaConsorcio(handleMoedaInput(e.target.value))} placeholder="0,00" className="h-9 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Prazo (meses)</Label>
                    <Input type="number" value={prazoConsorcio} onChange={e => setPrazoConsorcio(e.target.value)} placeholder="180" className="h-9 mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Reajuste Anual da Parcela (%)</Label>
                  <Input type="number" step="0.1" value={reajusteAnual} onChange={e => setReajusteAnual(e.target.value)} placeholder="3" className="h-9 mt-1" />
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs text-orange-700">
                  <Info className="w-3 h-3 inline mr-1" />O reajuste aumenta somente a parcela. Os custos administrativos já estão embutidos.
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financiamento */}
          {(tipoComparacao === 'financiamento_consorcio' || tipoComparacao === 'completo') && (
            <Card className="border-0 shadow-sm border-l-4 border-l-blue-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> Dados do Financiamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Taxa Juros Anual (%)</Label>
                    <Input type="number" step="0.1" value={taxaJurosAnual} onChange={e => setTaxaJurosAnual(e.target.value)} placeholder="12" className="h-9 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Sistema</Label>
                    <Select value={sistemaFinanciamento} onValueChange={setSistemaFinanciamento}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRICE">PRICE</SelectItem>
                        <SelectItem value="SAC">SAC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Prazo Financiamento (meses)</Label>
                  <Input type="number" value={prazoFinanciamento} onChange={e => setPrazoFinanciamento(e.target.value)} placeholder="240" className="h-9 mt-1" />
                </div>
              </CardContent>
            </Card>
          )}

          <Button onClick={calcular} disabled={calculando} className="w-full bg-[#10353C] hover:bg-[#083942] text-white h-11 text-base font-semibold">
            {calculando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Calculando...</> : <><Calculator className="w-4 h-4 mr-2" />Calcular Comparativo</>}
          </Button>
        </div>

        {/* Resultados */}
        <div className="xl:col-span-2 space-y-5" ref={simulacaoRef}>
          {tipoComparacao === 'avista_consorcio' ? (
            resultadoAvista ? (
              <ResultadoAvistaConsorcio
                salvando={salvando}
                simulacao={resultadoAvista}
                onEditarPremissas={() => {}}
                onWhatsapp={() => { toast.info('Use o chat flutuante abaixo para anexar o print da simulação.'); }}
                onSalvar={salvarHistoricoAvista}
                onExportarPDF={gerarPDFAvista}
              />
            ) : (
              <Card className="border-0 shadow-sm h-96 flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <BarChart3 className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">Preencha os dados e calcule</p>
                  <p className="text-sm mt-1">Comparativo À Vista × Consórcio aparecerá aqui</p>
                </div>
              </Card>
            )
          ) : !resultado ? (
            <Card className="border-0 shadow-sm h-96 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <BarChart3 className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">Preencha os dados e calcule</p>
                <p className="text-sm mt-1">O comparativo patrimonial inteligente aparecerá aqui</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Banner Melhor Estratégia */}
              <div className={`rounded-2xl p-5 text-white flex items-center justify-between ${corMelhor}`}>
                <div className="flex items-center gap-3">
                  <Trophy className="w-10 h-10 text-yellow-300" />
                  <div>
                    <p className="text-sm font-medium opacity-80">🏆 Melhor Estratégia Identificada</p>
                    <p className="text-2xl font-bold">{resultado.melhor.nome}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm opacity-80">Diferença Patrimonial</p>
                  <p className="text-2xl font-bold">{fmt(resultado.diferenca)}</p>
                  <p className="text-sm font-semibold text-yellow-300">+{resultado.diferencaPct.toFixed(2)}%</p>
                </div>
              </div>

              {/* Info desvalorização */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="text-orange-700 font-semibold">Desvalorização do Bem ({resultado.desvalorizacaoAnual.toFixed(0)}% a.a.)</span>
                  <span className="text-orange-600 text-xs ml-2">−{resultado.desvalorizacaoTotal.toFixed(1)}% no período</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Valor residual</p>
                  <p className="font-bold text-orange-700">{fmt(resultado.valorBemFinal)}</p>
                </div>
              </div>

              {/* Cards Patrimônio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Compra À Vista', valor: resultado.patrimonioAVista, subLabel: `Bem: ${fmt(resultado.valorBemFinal)} + Invest. mensal: ${fmt(resultado.vfInvestAVista)}`, cor: 'bg-[#10353C]', nome: 'À Vista' },
                  { label: 'Consórcio + Investimento', valor: resultado.patrimonioConsorcio, subLabel: `Lance: ${fmt(resultado.valorLance)} (${resultado.percentualLance.toFixed(0)}%) | Invest.: ${fmt(resultado.vfInvestConsorcio)} | Parcelas: −${fmt(resultado.totalParcelasPagas)}`, cor: 'bg-orange-500', nome: 'Consórcio' },
                  { label: 'Financiamento', valor: resultado.patrimonioFinanciamento, subLabel: `Entrada: ${fmt(resultado.entrada)} | Fin.: ${fmt(resultado.valorFinanciado)} | Juros: −${fmt(resultado.totalJurosFin)}`, cor: 'bg-blue-600', nome: 'Financiamento' },
                ].map(c => (
                  <Card key={c.nome} className={`border-0 shadow-sm overflow-hidden ${c.nome === melhorNome ? 'ring-2 ring-[#23BE84]' : ''}`}>
                    <div className={`${c.cor} px-4 py-3 flex items-center justify-between`}>
                      <span className="text-white text-xs font-semibold">{c.label}</span>
                      {c.nome === melhorNome && <Trophy className="w-4 h-4 text-yellow-300" />}
                    </div>
                    <div className="p-4">
                      <p className="text-2xl font-bold text-slate-900">{fmt(c.valor)}</p>
                      <p className="text-xs text-slate-500 mt-1">{c.subLabel}</p>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Gráfico: Evolução Patrimônio */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Evolução do Patrimônio Líquido</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={resultado.dadosGrafico}>
                      <defs>
                        <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#083942" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#083942" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f58941" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f58941" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="avista" name="À Vista" stroke="#083942" fill="url(#ga)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="consorcio" name="Consórcio" stroke="#f58941" fill="url(#gc)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="financiamento" name="Financiamento" stroke="#3b82f6" fill="url(#gf)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="bemResidual" name="Valor Residual Bem" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Gráficos menores */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Evolução Investimento */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700">Evolução do Investimento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={resultado.dadosGrafico}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v) => fmt(v)} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="invAvista" name="À Vista" stroke="#083942" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="invConsorcio" name="Consórcio" stroke="#f58941" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="invFin" name="Financiamento" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Parcela Reajustada Consórcio */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700">Evolução Parcela Consórcio (Reajustada)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={resultado.dadosGrafico}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                        <YAxis tickFormatter={v => `${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v) => fmt(v)} />
                        <Line type="monotone" dataKey="parcela" name="Parcela" stroke="#f58941" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Comparativo Final */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700">Comparativo Final Patrimônio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={[{ name: 'Patrimônio Final', avista: Math.round(resultado.patrimonioAVista), consorcio: Math.round(resultado.patrimonioConsorcio), financiamento: Math.round(resultado.patrimonioFinanciamento) }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v) => fmt(v)} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="avista" name="À Vista" fill="#083942" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="consorcio" name="Consórcio" fill="#f58941" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="financiamento" name="Financiamento" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Diferença Patrimonial Acumulada */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700">Diferença Patrimonial Acumulada</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={170}>
                      <AreaChart data={resultado.dadosDiferenca}>
                        <defs>
                          <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#23BE84" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#23BE84" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v) => fmt(v)} />
                        <Area type="monotone" dataKey="diferenca" name="Diferença" stroke="#23BE84" fill="url(#gd)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Botões ação */}
              <div className="flex gap-3 flex-wrap">
                <Button onClick={gerarPDF} className="bg-[#10353C] hover:bg-[#083942] text-white gap-2 flex-1 min-w-[180px]">
                  <FileDown className="w-4 h-4" /> Gerar PDF Comparativo
                </Button>
                <Button onClick={salvarHistorico} disabled={salvando} variant="outline" className="gap-2 flex-1 min-w-[180px]">
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  {salvando ? 'Salvando...' : 'Salvar Histórico'}
                </Button>
              </div>

              {/* Observação */}
              <p className="text-xs text-slate-400 text-center italic">
                Simulação estimativa sujeita às condições vigentes, reajustes contratuais, contemplação e regras da administradora.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Chat flutuante do WhatsApp — envia print da simulação sem sair da tela */}
      {!loadingUser && user?.empresa_id && (
        <ChatFlutuante
          empresaId={user.empresa_id}
          user={user}
          captureTargetRef={simulacaoRef}
          captureLabel="simulacao"
          defaultMinimized={true}
        />
      )}
    </div>
  );
}
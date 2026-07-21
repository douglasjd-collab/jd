// Cálculo dedicado do modo "À Vista × Consórcio".
// Tudo feito com pelo menos 8 casas significativas; só arredonda na apresentação.

// Predefinição de taxas de desvalorização por ano do veículo.
// Ano 1 = primeiro ano desde zero km.
export const TAXAS_DESVAL_PADRAO = {
  1: 0.15,
  2: 0.10,
  3: 0.08,
  4: 0.07,
  5: 0.07,
  6: 0.05,
  7: 0.05,
  8: 0.05,
  9: 0.05,
  10: 0.05,
  11: 0.05,
  12: 0.05,
  13: 0.05,
  14: 0.05,
  15: 0.05,
};

// Monta a sequência anual (de 1..N) que será aplicada sobre o veículo,
// começando a partir do anoAtual (para seminovo).
export function montarSequenciaDesvalorizacao(taxasCustom, anoInicio, totalAnos) {
  const taxas = taxasCustom && typeof taxasCustom === 'object' ? taxasCustom : TAXAS_DESVAL_PADRAO;
  const arr = [];
  for (let i = 0; i < totalAnos; i++) {
    const ano = anoInicio + i;
    const t = Number(taxas[ano] ?? taxas.defaultAo5 ?? 0.05);
    arr.push(Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.05);
  }
  return arr;
}

// Aplica desvalorização composta sobre o valor inicial pelos meses dados.
// Para período incompleto (meses < 12 de um ano), usa fator parcial (1 - taxa)^(meses/12).
export function valorBemNoFinal({ valorInicial, anoInicio, meses, taxasCustom }) {
  if (!valorInicial || valorInicial <= 0 || meses <= 0) return valorInicial || 0;
  const anosCompletos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  const sequencia = montarSequenciaDesvalorizacao(taxasCustom, anoInicio, Math.max(anosCompletos, 1) + (mesesRestantes ? 1 : 0));
  let valor = valorInicial;
  for (let i = 0; i < anosCompletos; i++) {
    valor *= (1 - sequencia[i]);
  }
  if (mesesRestantes > 0 && anosCompletos < sequencia.length) {
    const taxaAno = sequencia[anosCompletos];
    valor *= Math.pow(1 - taxaAno, mesesRestantes / 12);
  }
  return valor;
}

// Cálculo das parcelas do consórcio com reajuste anual a cada 12 meses.
// ano_reajuste = floor((m-1)/12); parcela_corrigida = base × (1 + reajuste)^ano
export function serieParcelasReajustadas({ parcelaBase, prazo, reajusteAnual }) {
  const r = reajusteAnual || 0;
  const series = [];
  let total = 0;
  for (let m = 1; m <= prazo; m++) {
    const ano = Math.floor((m - 1) / 12);
    const v = parcelaBase * Math.pow(1 + r, ano);
    series.push({ mes: m, parcela: v });
    total += v;
  }
  return { series, total };
}

// Determina a parcela-base projetada após abatimento do lance pela regra
// "reduzir o valor das parcelas". Não cobrar lance duas vezes.
// saldo_nominal_estimado = (parcela_inicial × prazo) − lance_proprio
// parcela_estimada = saldo_nominal_estimado / parcelas_restantes
export function projecaoPosLance({ parcelaInicial, prazo, lance, parcelasRestantes, reajusteAnual, cronogramaOficial, formaAbatimento }) {
  const pa = parseFloat(parcelaInicial) || 0;
  const n = parseInt(prazo) || 0;
  const lc = parseFloat(lance) || 0;
  const pr = parcelasRestantes && parcelasRestantes > 0 ? parcelasRestantes : n;

  if (cronogramaOficial && Array.isArray(cronogramaOficial) && cronogramaOficial.length > 0) {
    // Usa obrigatoriamente o cronograma oficial
    return {
      origem: 'oficial',
      parcelaBase: pa,
      saldoNominal: null,
      serie: cronogramaOficial.map((p, i) => ({ mes: i + 1, parcela: parseFloat(p) || 0 })),
      totalParcelas: cronogramaOficial.reduce((s, p) => s + (parseFloat(p) || 0), 0),
    };
  }

  // Só projeta se a forma de abatimento	for "reduzir_parcelas". Para reduzir_prazo ou oficial,
  // ainda mantemos uma estimativa (apenas informativa) para a tabela de Aportes Mensais Equivalentes.
  const custoNominalOriginal = pa * n;
  const saldoNominalEstimado = Math.max(0, custoNominalOriginal - lc);
  const parcelaEstimada = pr > 0 ? saldoNominalEstimado / pr : 0;
  const { series, total } = serieParcelasReajustadas({ parcelaBase: parcelaEstimada, prazo: pr, reajusteAnual });

  return {
    origem: formaAbatimento === 'regra_administradora' ? 'oficial' : 'projetada',
    parcelaBase: parcelaEstimada,
    saldoNominal: saldoNominalEstimado,
    custoNominalOriginal,
    serie: series,
    totalParcelas: total,
  };
}

// Investimento de capital único: valor_futuro = capital × (1 + i_mensal)^meses
export function investimentoCapitalUnico({ capital, taxaMensal, meses, reinvestir }) {
  const i = taxaMensal || 0;
  const vf = capital * Math.pow(1 + i, meses);
  return {
    capitalInicial: capital,
    valorFuturo: vf,
    rendimento: vf - capital,
  };
}

// Simula investimento com aportes mensais recorrentes (com aporte ao final de cada mês).
// saldo(m) = saldo_anterior × (1 + i) + aporte(m)
export function investimentoAportesMensais({ aportesMensais, taxaMensal, meses }) {
  const i = taxaMensal || 0;
  let saldo = 0;
  let totalAportado = 0;
  const series = [];
  for (let m = 1; m <= meses; m++) {
    saldo = saldo * (1 + i) + (aportesMensais[m - 1] || 0);
    totalAportado += aportesMensais[m - 1] || 0;
    series.push({ mes: m, saldo, aporteMes: aportesMensais[m - 1] || 0 });
  }
  return { saldoFinal: saldo, totalAportado, series };
}

// Função orquestradora principal para a modalidade À Vista × Consórcio
export function simularAvistaConsorcio(input) {
  const {
    valorVeiculo,
    condicaoVeiculo,         // 'zero' | 'seminovo'
    idadeVeiculoAnos,        // 0 para zero km; idade atual de seminovo
    capitalDisponivel,
    percentualLance,         // ex: 60 (significa 60%)
    prazoAnalise,            // meses de análise
    dataPrevistaCompra,     // DD/MM/AAAA
    // Consórcio
    consorcio = {},           // { administradora, plano, grupo, credito, prazo, parcelaInicial, taxaAdm, fundoReserva, seguro, outros, reajusteAnual, mesContemplacao, formaAbatimento, parcelaOficialPosLance }
    // Investimento
    investimento = {},        // { rentabilidadeMensal, prazo, reinvestir, taxasImpostos, tipoRendimento }
    // Taxas custom
    taxasCustomDesvalor,
  } = input;

  // ===== 1. Validações =====
  const erros = [];
  if (!(capitalDisponivel > 0)) erros.push('Capital disponível deve ser maior que zero.');
  if (!(valorVeiculo > 0)) erros.push('Valor do veículo deve ser maior que zero.');
  if (parseFloat(percentualLance) > 100) erros.push('Lance não pode superar 100% do capital disponível.');
  if (!(prazoAnalise > 0)) erros.push('Prazo de análise deve ser maior que zero.');
  if (erros.length) return { ok: false, erros };

  // ===== 2. Distribuição do capital =====
  const pctLance = (parseFloat(percentualLance) || 0) / 100;
  const valorLance = capitalDisponivel * pctLance;
  const valorInvestimentoInicial = capitalDisponivel - valorLance;
  // Validação: lance + investimento = capital
  if (Math.abs((valorLance + valorInvestimentoInicial) - capitalDisponivel) > 0.01) {
    return { ok: false, erros: ['A soma do lance com o investimento não fecha com o capital disponível.'] };
  }

  // ===== 3. Desvalorização automática =====
  const anoInicioBem = condicaoVeiculo === 'seminovo' ? Math.max(1, Math.round(parseInt(idadeVeiculoAnos) || 0) + 1) : 1;
  const valorFinalVeiculo = valorBemNoFinal({
    valorInicial: valorVeiculo,
    anoInicio: anoInicioBem,
    meses: prazoAnalise,
    taxasCustom: taxasCustomDesvalor,
  });
  const perdaDesvalorizacao = valorVeiculo - valorFinalVeiculo;

  // ===== 4. Consórcio =====
  const reajusteAnual = (parseFloat(consorcio.reajusteAnual) || 0) / 100;
  const prazoConsorcio = parseInt(consorcio.prazo) || 0;
  const parcelaInicial = parseFloat(consorcio.parcelaInicial) || 0;
  const mesContemplacao = parseInt(consorcio.mesContemplacao) || 1;
  const fundoReserva = parseFloat(consorcio.fundoReserva) || 0;
  const seguro = parseFloat(consorcio.seguro) || 0;
  const outros = parseFloat(consorcio.outros) || 0;

  // Cronograma oficial informado pelo plano, se houver
  let cronogramaOficial = null;
  if (consorcio.parcelaOficialPosLance && Array.isArray(consorcio.parcelaOficialPosLance) && consorcio.parcelaOficialPosLance.length > 0) {
    cronogramaOficial = consorcio.parcelaOficialPosLance;
  }

  // Antes da contemplação: paga parcelas normais (parcelaInicial com reajuste) nos meses 1..(mesContemplacao-1)
  let parcelasAntesContemplacao = 0;
  const serieParcelasAntes = [];
  for (let m = 1; m < mesContemplacao; m++) {
    const ano = Math.floor((m - 1) / 12);
    const v = parcelaInicial * Math.pow(1 + reajusteAnual, ano);
    parcelasAntesContemplacao += v;
    serieParcelasAntes.push({ mes: m, parcela: v });
  }

  // Depois do lance: projeção (ou cronograma oficial)
  const parcelasRestantes = Math.max(0, prazoConsorcio - mesContemplacao);
  const posLance = projecaoPosLance({
    parcelaInicial,
    prazo: prazoConsorcio,
    lance: valorLance,
    parcelasRestantes,
    reajusteAnual,
    cronogramaOficial,
    formaAbatimento: consorcio.formaAbatimento,
  });

  // Total pago ao consórcio: lance (antecipação) + parcelas_antes + parcelas_depois (somadas)
  // O lance NÃO duplica. As parcelas depois do lance já foram reduzidas por ele.
  const totalParcelasPagas = parcelasAntesContemplacao + posLance.totalParcelas;
  const totalPagoConsorcio = valorLance + totalParcelasPagas;

  // ===== 5. Investimento do "restante" (consórcio) =====
  const rentMensal = (parseFloat(investimento.rentabilidadeMensal) || 0) / 100;
  const prazoInvest = parseInt(investimento.prazo) || prazoAnalise;
  const invCons = investimentoCapitalUnico({
    capital: valorInvestimentoInicial,
    taxaMensal: rentMensal,
    meses: prazoInvest,
    reinvestir: investimento.reinvestir !== false,
  });
  const taxasImpostos = parseFloat(investimento.taxasImpostos) || 0;
  const saldoFinalLiquidoConsorcio = invCons.valorFuturo - taxasImpostos;
  const rendimentoLiquidoConsorcio = saldoFinalLiquidoConsorcio - valorInvestimentoInicial;

  // ===== RESULTADO 1 — COMPARAÇÃO DA ESTRATÉGIA (simplificado) =====
  // custo_liquido_consorcio = lance + inv_inicial + parcelas_pagas − saldo_final_investimento
  const desembolsoConsorcio = valorLance + valorInvestimentoInicial + totalParcelasPagas;
  const custoLiquidoConsorcio = desembolsoConsorcio - invCons.valorFuturo;
  // Desembolso à vista = valor do veículo
  const desembolsoAvista = valorVeiculo;
  const diferencaSimplificada = desembolsoAvista - custoLiquidoConsorcio; // >0 = consórcio favorável

  // ===== RESULTADO 2 — COMPARAÇÃO FINANCEIRA EQUIVALENTE (principal) =====
  // Na compra à vista, TODO o capital disponível foi usado para adquirir o veículo — não
  // há aportes mensais (saldo zero). Ao final do prazo, o patrimônio do comprador à
  // vista é apenas o valor residual do veículo (+ eventual saldo inicial não utilizado,
  // quando o capital é maior que o valor do veículo). Comparamos então com o consórcio,
  // que mantém investimento do restante + reajuste anual de 5% na parcela.

  // Patrimônio À Vista:
  const saldoInicialNaoUtilizadoAvista = Math.max(0, capitalDisponivel - valorVeiculo);
  const patrimonioAvista = valorFinalVeiculo + saldoInicialNaoUtilizadoAvista;

  // Manutenção de compatibilidade dos campos antigos (aportes zerados)
  const invAportesSaldoFinal_ZERO = 0;
  const invAportesTotalAportado_ZERO = 0;

  // Patrimônio no Consórcio = valor_final_veiculo + saldo_investimento_dos_(restante)
  const patrimonioConsorcio = valorFinalVeiculo + saldoFinalLiquidoConsorcio;

  const diferencaEquivalente = patrimonioConsorcio - patrimonioAvista; // >0: consórcio superior

  // Memória de cálculo (para o botão "Ver memória de cálculo")
  const memoria = {
    custoNominalOriginal: parcelaInicial * prazoConsorcio,
    lance: valorLance,
    saldoNominalProjetado: (parcelaInicial * prazoConsorcio) - valorLance,
    parcelaBaseProjetada: posLance.parcelaBase,
    parcelasAntesContemplacao,
    totalParcelasDepoisLance: posLance.totalParcelas,
    totalParcelasPagas,
    totalPagoConsorcio,
    investimentoInicial: valorInvestimentoInicial,
    valorFuturoBrutoInvest: invCons.valorFuturo,
    rendimentoBruto: invCons.rendimento,
    taxasImpostos,
    saldoFinalLiquidoConsorcio,
    aportesEquivalentesTotal: invAportesTotalAportado_ZERO,
    aportesSaldoFinal: invAportesSaldoFinal_ZERO,
    valorFinalVeiculo,
    perdaDesvalorizacao,
    patrimonioAvista,
    patrimonioConsorcio,
  };

  return {
    ok: true,
    // Distribuição
    capitalDisponivel,
    valorLance,
    valorInvestimentoInicial,
    percentualLance: pctLance * 100,
    // Consórcio
    totalParcelasPagas,
    totalPagoConsorcio,
    seriePosLance: posLance.serie,
    serieAntesLance: serieParcelasAntes,
    origemCronograma: posLance.origem,
    formaAbatimento: consorcio.formaAbatimento,
    // Investimento (consórcio)
    invValorFuturoBruto: invCons.valorFuturo,
    invRendimentoBruto: invCons.rendimento,
    saldoFinalLiquidoConsorcio,
    rendimentoLiquidoConsorcio,
    // À vista
    saldoInicialNaoUtilizadoAvista,
    invAportesSaldoFinal: invAportesSaldoFinal_ZERO,
    invAportesTotalAportado: invAportesTotalAportado_ZERO,
    patrimonioAvista,
    patrimonioConsorcio,
    // Resultados numéricos principais
    desembolsoConsorcio,
    custoLiquidoConsorcio,
    desembolsoAvista,
    diferencaSimplificada,
    diferencaEquivalente,
    // Bem
    valorFinalVeiculo,
    perdaDesvalorizacao,
    anoInicioBem,
    // Detalhes
    consorcio,
    investimento,
    memoria,
    prazoAnalise,
    dataPrevistaCompra,
  };
}
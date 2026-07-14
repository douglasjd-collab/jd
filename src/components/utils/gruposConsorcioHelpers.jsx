// Helpers compartilhados para Grupos de Consórcio (cadastro, dashboard e simulador)

export const CATEGORIA_LABELS = {
  automovel: 'Automóvel',
  imovel: 'Imóvel',
  motocicleta: 'Motocicleta',
  servico: 'Serviço',
  bens_moveis: 'Bens Móveis'
};

export const CATEGORIA_ICONS = {
  automovel: '🚗',
  imovel: '🏠',
  motocicleta: '🏍️',
  servico: '🛠️',
  bens_moveis: '📦'
};

export const PRIORIDADE_ORDER = { alta: 0, media: 1, baixa: 2 };
export const PRIORIDADE_STARS = { alta: '⭐⭐⭐', media: '⭐⭐', baixa: '⭐' };
export const PRIORIDADE_LABELS = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

// Calcula a média de um campo percentual das assembleias dentro dos últimos N meses
export function calcularMediaPercentual(assembleias, meses, campo) {
  if (!assembleias?.length) return null;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);
  const validas = assembleias.filter(a => {
    if (!a.data_assembleia || a[campo] === null || a[campo] === undefined) return false;
    return new Date(a.data_assembleia) >= limite;
  });
  if (validas.length === 0) return null;
  const soma = validas.reduce((acc, a) => acc + Number(a[campo]), 0);
  return soma / validas.length;
}

export function formatPercent(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '-';
  return `${Number(valor).toFixed(2)}%`;
}

export function formatCurrency(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

// Constrói, a partir do histórico de lances importado (HistoricoLanceDetalhe + HistoricoLanceGrupo),
// uma lista de "assembleias" por grupo (uma entrada por data de assembleia), no mesmo formato
// usado pelos painéis do simulador (data_assembleia, lance_livre_menor_percentual, etc.).
export function construirAssembleiasPorGrupo(detalhes, historicosGrupo) {
  const dataPorHistoricoId = {};
  (historicosGrupo || []).forEach(h => { dataPorHistoricoId[h.id] = h.assembleia_data; });

  const porGrupo = {};

  // Agrupa por mês (YYYY-MM) dentro de cada grupo, mesclando as várias chamadas
  // (Primeira, Segunda...) da mesma assembleia em uma única entrada mensal.
  (detalhes || []).forEach(d => {
    const dataAssembleia = dataPorHistoricoId[d.historico_id];
    if (!dataAssembleia) return;
    const grupoNormalizado = String(d.grupo || '').replace(/^0+/, '') || '0';
    const mesKey = String(dataAssembleia).slice(0, 7); // YYYY-MM

    if (!porGrupo[grupoNormalizado]) porGrupo[grupoNormalizado] = {};
    if (!porGrupo[grupoNormalizado][mesKey]) {
      porGrupo[grupoNormalizado][mesKey] = {
        id: `${grupoNormalizado}_${mesKey}`,
        data_assembleia: dataAssembleia,
        total_contemplados: 0,
        lance_livre_menor_percentual: null,
        lance_livre_qtd_contemplados: 0,
        lance_limitado_menor_percentual: null,
        lance_limitado_qtd_contemplados: 0,
        lance_fixo_30_qtd_contemplados: 0,
        lance_fixo_50_qtd_contemplados: 0,
        sorteio_qtd_contemplados: 0
      };
    }

    const bucket = porGrupo[grupoNormalizado][mesKey];
    // Mantém a data mais recente dentro do mês como representativa
    if (dataAssembleia > bucket.data_assembleia) bucket.data_assembleia = dataAssembleia;
    bucket.total_contemplados += 1;
    const percent = d.lance_percent;

    if (d.modalidade === 'lance_livre') {
      bucket.lance_livre_qtd_contemplados += 1;
      if (percent !== null && percent !== undefined) {
        bucket.lance_livre_menor_percentual = bucket.lance_livre_menor_percentual === null
          ? percent : Math.min(bucket.lance_livre_menor_percentual, percent);
      }
    } else if (d.modalidade === 'lance_limitado') {
      bucket.lance_limitado_qtd_contemplados += 1;
      if (percent !== null && percent !== undefined) {
        bucket.lance_limitado_menor_percentual = bucket.lance_limitado_menor_percentual === null
          ? percent : Math.min(bucket.lance_limitado_menor_percentual, percent);
      }
    } else if (d.modalidade === 'lance_fixo_30') {
      bucket.lance_fixo_30_qtd_contemplados += 1;
    } else if (d.modalidade === 'lance_fixo_50') {
      bucket.lance_fixo_50_qtd_contemplados += 1;
    } else if (d.modalidade === 'sorteio') {
      bucket.sorteio_qtd_contemplados += 1;
    }
  });

  const resultado = {};
  Object.entries(porGrupo).forEach(([grupo, porMes]) => {
    resultado[grupo] = Object.values(porMes).sort((a, b) => b.data_assembleia.localeCompare(a.data_assembleia));
  });
  return resultado;
}

// Retorna as N assembleias mais recentes (ordenadas da mais nova para a mais antiga)
export function obterUltimasAssembleias(assembleias, n = 3) {
  return (assembleias || [])
    .filter(a => a.data_assembleia)
    .slice()
    .sort((a, b) => new Date(b.data_assembleia) - new Date(a.data_assembleia))
    .slice(0, n);
}

// Calcula os indicadores agregados (resumo automático) do período de assembleias informado
export function calcularResumoPeriodo(ultimas) {
  if (!ultimas?.length) return null;
  const livres = ultimas.map(a => a.lance_livre_menor_percentual).filter(v => v !== null && v !== undefined);
  const limitados = ultimas.map(a => a.lance_limitado_menor_percentual).filter(v => v !== null && v !== undefined);
  const soma = (campo) => ultimas.reduce((acc, a) => acc + (Number(a[campo]) || 0), 0);

  return {
    mediaLivre: livres.length ? livres.reduce((a, b) => a + b, 0) / livres.length : null,
    menorLivre: livres.length ? Math.min(...livres) : null,
    maiorLivre: livres.length ? Math.max(...livres) : null,
    contempladosLivre: soma('lance_livre_qtd_contemplados'),
    mediaLimitado: limitados.length ? limitados.reduce((a, b) => a + b, 0) / limitados.length : null,
    menorLimitado: limitados.length ? Math.min(...limitados) : null,
    maiorLimitado: limitados.length ? Math.max(...limitados) : null,
    contempladosLimitado: soma('lance_limitado_qtd_contemplados'),
    contempladosSorteio: soma('sorteio_qtd_contemplados'),
    contempladosFixo30: soma('lance_fixo_30_qtd_contemplados'),
    contempladosFixo50: soma('lance_fixo_50_qtd_contemplados'),
    totalGeral: soma('total_contemplados')
  };
}

// Classifica a tendência de um campo percentual comparando os dois valores mais recentes
export function calcularTendencia(ultimas, campo = 'lance_livre_menor_percentual') {
  const valores = ultimas
    .slice()
    .sort((a, b) => new Date(a.data_assembleia) - new Date(b.data_assembleia))
    .map(a => a[campo])
    .filter(v => v !== null && v !== undefined);
  if (valores.length < 2) return null;

  const ultimo = valores[valores.length - 1];
  const anterior = valores[valores.length - 2];
  const diff = ultimo - anterior;

  let classificacao, emoji;
  if (diff > 1) { classificacao = 'Em alta'; emoji = '🟢'; }
  else if (diff < -1) { classificacao = 'Em queda'; emoji = '🔴'; }
  else { classificacao = 'Estável'; emoji = '🟡'; }

  return { valores, classificacao, emoji };
}
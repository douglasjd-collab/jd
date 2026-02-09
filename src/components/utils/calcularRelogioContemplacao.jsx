/**
 * Calcula o índice de chance de contemplação comparando o lance ofertado com a média histórica
 * @param {number} lanceOfertado - Percentual do lance ofertado pelo cliente
 * @param {number} mediaHistorica - Média histórica de lances do grupo
 * @returns {Object} Resultado com índice, nível, label, cor e percentual visual
 */
export function calcularRelogioContemplacao({ lanceOfertado, mediaHistorica }) {
  if (!lanceOfertado || !mediaHistorica) {
    return {
      indice: 0,
      nivel: 'desconhecido',
      label: 'Dados insuficientes',
      cor: 'gray',
      percentualRelogio: 0
    };
  }

  const indice = lanceOfertado / mediaHistorica;

  if (indice < 0.9) {
    return {
      indice,
      nivel: 'muito_baixa',
      label: 'Chance muito baixa',
      cor: 'red',
      percentualRelogio: 20
    };
  }

  if (indice < 1) {
    return {
      indice,
      nivel: 'baixa',
      label: 'Chance baixa',
      cor: 'orange',
      percentualRelogio: 35
    };
  }

  if (indice < 1.1) {
    return {
      indice,
      nivel: 'media',
      label: 'Chance média',
      cor: 'yellow',
      percentualRelogio: 55
    };
  }

  if (indice < 1.25) {
    return {
      indice,
      nivel: 'alta',
      label: 'Alta chance de contemplação',
      cor: 'green',
      percentualRelogio: 75
    };
  }

  return {
    indice,
    nivel: 'muito_alta',
    label: 'Chance muito alta de contemplação',
    cor: 'green',
    percentualRelogio: 90
  };
}
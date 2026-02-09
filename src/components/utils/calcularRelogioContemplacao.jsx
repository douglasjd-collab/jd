/**
 * Calcula a chance de contemplação baseado no lance ofertado vs menor/maior lance histórico.
 * 
 * Dados de referência:
 * - Menor lance: última assembleia (piso atual do mercado)
 * - Maior lance: histórico completo (teto histórico)
 * 
 * Fórmula: chance = (lanceCliente - menorLance) / (maiorLance - menorLance)
 * 
 * @param {Object} params
 * @param {number} params.lanceCliente - Percentual do lance ofertado pelo cliente
 * @param {number} params.menorLance - Menor lance da última assembleia
 * @param {number} params.maiorLance - Maior lance do histórico completo
 * @returns {Object} Resultado com chance, nível, label, cor e percentual visual
 */
export function calcularRelogioContemplacao({ lanceCliente, menorLance, maiorLance }) {
  // Validação: se não tem dados suficientes
  if (
    lanceCliente == null ||
    menorLance == null ||
    maiorLance == null ||
    maiorLance <= menorLance
  ) {
    return {
      chance: 0,
      chance_percentual: 0,
      nivel: 'desconhecido',
      label: 'Histórico insuficiente',
      cor: 'gray',
      percentualRelogio: 0
    };
  }

  // Fórmula: chance = (lanceCliente - menorLance) / (maiorLance - menorLance)
  let chance = (lanceCliente - menorLance) / (maiorLance - menorLance);
  
  // Clamp entre 0 e 1 (segurança)
  chance = Math.max(0, Math.min(chance, 1));

  let nivel, label, cor;

  // Classificação visual
  if (chance >= 0.75) {
    // 75%+ do intervalo = altas chances
    nivel = 'alta';
    label = 'Altas chances de contemplação';
    cor = 'green';
  } else if (chance >= 0.45) {
    // 45%-75% do intervalo = chances médias
    nivel = 'media';
    label = 'Chances médias de contemplação';
    cor = 'yellow';
  } else {
    // Abaixo de 45% = poucas chances
    nivel = 'baixa';
    label: 'Poucas chances de contemplação';
    cor = 'red';
  }

  const chance_percentual = Math.round(chance * 100);

  return {
    chance,
    chance_percentual,
    nivel,
    label,
    cor,
    percentualRelogio: chance_percentual
  };
}
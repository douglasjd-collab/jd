/**
 * Calcula a chance de contemplação baseado no tipo de lance.
 * 
 * LANCE LIMITADO (Recursos Próprios):
 * - Se lance > menorLance + 3% → Alta chance
 * - Se lance entre menorLance - 3% e menorLance + 3% → Média chance
 * - Se lance < menorLance - 3% → Baixa chance
 * 
 * LANCE LIVRE (Lance Embutido):
 * - Se lance > menorLance + 3% → Muita chance (alta)
 * - Se lance >= menorLance e <= menorLance + 3% → Boa chance (média)
 * - Se lance < menorLance → Baixa chance
 * 
 * @param {Object} params
 * @param {number} params.lanceCliente - Percentual do lance ofertado pelo cliente
 * @param {number} params.menorLance - Menor lance da última assembleia
 * @param {number} params.maiorLance - (Opcional) Maior lance do histórico
 * @param {string} params.tipoLance - 'livre' ou 'limitado' (padrão: 'limitado')
 * @returns {Object} Resultado com chance, nível, label, cor e percentual visual
 */
export function calcularRelogioContemplacao({ lanceCliente, menorLance, maiorLance, tipoLance = 'limitado' }) {
  // Validação: se não tem dados suficientes
  if (lanceCliente == null || menorLance == null) {
    return {
      chance: 0,
      chance_percentual: 0,
      nivel: 'desconhecido',
      label: 'Histórico insuficiente',
      cor: 'gray',
      percentualRelogio: 0
    };
  }

  let nivel, label, cor, percentualRelogio;
  const diferencaPercentual = lanceCliente - menorLance;

  if (tipoLance === 'livre') {
    // REGRA LANCE LIVRE (Lance Embutido)
    if (lanceCliente > menorLance + 3) {
      // Maior que 3% acima → muita chance
      nivel = 'alta';
      label = 'Muitas chances de contemplação';
      cor = 'green';
      percentualRelogio = 85;
    } else if (lanceCliente >= menorLance && lanceCliente <= menorLance + 3) {
      // Igual ou até 3% acima → boa chance
      nivel = 'media';
      label = 'Boas chances de contemplação';
      cor = 'yellow';
      percentualRelogio = 60;
    } else {
      // Menor que o lance informado → baixa chance
      nivel = 'baixa';
      label = 'Poucas chances de contemplação';
      cor = 'red';
      percentualRelogio = 20;
    }
  } else {
    // REGRA LANCE LIMITADO (Recursos Próprios)
    if (diferencaPercentual > 3) {
      nivel = 'alta';
      label = 'Altas chances de contemplação';
      cor = 'green';
      percentualRelogio = 80;
    } else if (diferencaPercentual >= -3 && diferencaPercentual <= 3) {
      nivel = 'media';
      label = 'Chances médias de contemplação';
      cor = 'yellow';
      percentualRelogio = 50;
    } else {
      nivel = 'baixa';
      label = 'Poucas chances de contemplação';
      cor = 'red';
      percentualRelogio = 20;
    }
  }

  const chance_percentual = percentualRelogio;

  return {
    chance: percentualRelogio / 100,
    chance_percentual,
    nivel,
    label,
    cor,
    percentualRelogio,
    diferencaPercentual: diferencaPercentual.toFixed(2)
  };
}
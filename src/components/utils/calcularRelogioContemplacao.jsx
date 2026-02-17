/**
 * Calcula a chance de contemplação baseado no lance ofertado vs menor lance limitado.
 * 
 * Regra para Simulação com Recursos Próprios (Lance Limitado):
 * - Se lance > menorLance + 3% → Alta chance
 * - Se lance entre menorLance - 3% e menorLance + 3% → Média chance
 * - Se lance < menorLance - 3% → Baixa chance
 * 
 * @param {Object} params
 * @param {number} params.lanceCliente - Percentual do lance ofertado pelo cliente
 * @param {number} params.menorLance - Menor lance limitado da última assembleia
 * @param {number} params.maiorLance - (Opcional) Maior lance do histórico
 * @returns {Object} Resultado com chance, nível, label, cor e percentual visual
 */
export function calcularRelogioContemplacao({ lanceCliente, menorLance, maiorLance }) {
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

  // Calcular diferença percentual em relação ao menor lance limitado
  const diferencaPercentual = lanceCliente - menorLance;

  let nivel, label, cor, percentualRelogio;
  
  if (diferencaPercentual > 3) {
    // Lance é mais de 3% acima do menor lance → alta chance
    nivel = 'alta';
    label = 'Altas chances de contemplação';
    cor = 'green';
    percentualRelogio = 80;
  } else if (diferencaPercentual >= -3 && diferencaPercentual <= 3) {
    // Lance está entre -3% e +3% do menor lance → média chance
    nivel = 'media';
    label = 'Chances médias de contemplação';
    cor = 'yellow';
    percentualRelogio = 50;
  } else {
    // Lance é mais de 3% abaixo do menor lance → baixa chance
    nivel = 'baixa';
    label = 'Poucas chances de contemplação';
    cor = 'red';
    percentualRelogio = 20;
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
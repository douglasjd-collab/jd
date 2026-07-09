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
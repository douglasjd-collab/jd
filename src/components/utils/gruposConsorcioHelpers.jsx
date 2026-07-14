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
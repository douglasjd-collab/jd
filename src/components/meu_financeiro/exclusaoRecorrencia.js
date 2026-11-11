// Regras de exclusão de despesas do Meu Financeiro (inclusive recorrentes).
// A série é identificada pelo ID da recorrência (lançamento original) e
// considera TODAS as parcelas, inclusive as já canceladas.
// Parcelas pagas nunca entram na exclusão: permanecem no histórico e na
// conciliação bancária.

export const estaPaga = (item) => item?.status === 'pago' || !!item?.data_pagamento;

export const idDaRecorrencia = (item) =>
  item?.recorrencia_origem_id || (item?.tipo_lancamento === 'recorrente' ? item.id : null);

export const ehDespesaRecorrente = (item) =>
  item?._tipo === 'despesa' && !!idDaRecorrencia(item);

const dataDe = (item) => item?.data_vencimento || item?.data || '';

export const serieDaDespesa = (despesas, item) => {
  const origemId = idDaRecorrencia(item);
  if (!origemId) return item ? [item] : [];
  return despesas.filter(d => d.id === origemId || d.recorrencia_origem_id === origemId);
};

// Retorna o que será excluído e o que será preservado (pagamentos).
export const calcularExclusao = (item, escopo, despesas) => {
  if (!item) return { serie: [], alvo: [], excluir: [], preservar: [] };
  const serie = serieDaDespesa(despesas, item);
  let alvo = serie;

  if (!ehDespesaRecorrente(item) || escopo === 'esta') {
    alvo = [item];
  } else if (escopo === 'proximas') {
    alvo = serie.filter(d => dataDe(d) >= dataDe(item));
  }

  return {
    serie,
    alvo,
    excluir: alvo.filter(d => !estaPaga(d)),
    preservar: alvo.filter(estaPaga),
  };
};

export const SCOPES_EXCLUSAO = [
  { valor: 'esta', label: 'Somente esta parcela' },
  { valor: 'proximas', label: 'Esta e as próximas' },
  { valor: 'todas', label: 'Toda a recorrência' },
];
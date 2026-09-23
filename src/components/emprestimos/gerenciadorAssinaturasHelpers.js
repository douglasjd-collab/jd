// Situações de assinatura para o Gerenciador de Assinaturas
export const SITUACOES = {
  termo_nao_gerado: {
    key: 'termo_nao_gerado',
    label: 'Termo não gerado',
    badge: 'bg-slate-200 text-slate-700',
    dot: 'bg-slate-400',
  },
  termo_gerado_nao_enviado: {
    key: 'termo_gerado_nao_enviado',
    label: 'Termo gerado, assinatura não enviada',
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-500',
  },
  assinatura_pendente: {
    key: 'assinatura_pendente',
    label: 'Assinatura pendente',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
  },
  aguardando_conferencia: {
    key: 'aguardando_conferencia',
    label: 'Aguardando conferência',
    badge: 'bg-cyan-100 text-cyan-700',
    dot: 'bg-cyan-500',
  },
  recusado: {
    key: 'recusado',
    label: 'Assinatura recusada',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
  },
  concluido: {
    key: 'concluido',
    label: 'Concluído',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
  },
};

export const SITUACAO_ORDER = [
  'termo_nao_gerado',
  'termo_gerado_nao_enviado',
  'assinatura_pendente',
  'aguardando_conferencia',
  'recusado',
  'concluido',
];

export const ROLE_LABELS = {
  cliente: 'Cliente',
  testemunha1: 'Testemunha 1',
  testemunha2: 'Testemunha 2',
  representante: 'Representante',
};

// Termos cujo status não deve ser considerado ativo
const STATUS_INATIVO_TERMO = ['substituido', 'cancelado', 'invalidado'];
const STATUS_INATIVO_SOLICITACAO = ['cancelado'];

/**
 * Classifica uma proposta com base no termo mais recente (ativo) e na solicitação atual.
 * @param {object} termoRecente - Termo mais recente com status ativo (ou null)
 * @param {object} solicitacaoAtual - Solicitação mais recente não cancelada (ou null)
 * @returns {{ situacao: string, faltantes: string[], etapaAtual: string|null }}
 */
export function classificarProposta(termoRecente, solicitacaoAtual) {
  if (!termoRecente) {
    return { situacao: 'termo_nao_gerado', faltantes: [], etapaAtual: null };
  }

  if (solicitacaoAtual) {
    // Há solicitação: usar status da solicitação (não apenas do termo)
    if (solicitacaoAtual.status === 'assinado') {
      return { situacao: 'concluido', faltantes: [], etapaAtual: null };
    }
    if (solicitacaoAtual.status === 'aguardando_conferencia') {
      return { situacao: 'aguardando_conferencia', faltantes: [], etapaAtual: null };
    }
    if (solicitacaoAtual.status === 'recusado') {
      return { situacao: 'recusado', faltantes: [], etapaAtual: null };
    }
    // Assinatura pendente — determinar faltantes e etapa atual
    let ordem = [];
    try { ordem = JSON.parse(solicitacaoAtual.ordem_json || '[]'); } catch { ordem = []; }
    const faltantes = ordem.filter((role) => {
      const st = solicitacaoAtual[`${role}_status`];
      return st !== 'assinado' && st !== 'nao_aplicavel';
    });
    const etapaAtual = ordem.find((role) => {
      const st = solicitacaoAtual[`${role}_status`];
      return st === 'pendente' || st === 'visualizado';
    }) || null;
    return { situacao: 'assinatura_pendente', faltantes, etapaAtual };
  }

  // Sem solicitação: usar status do termo
  if (termoRecente.status === 'assinado') {
    return { situacao: 'concluido', faltantes: [], etapaAtual: null };
  }
  if (termoRecente.status === 'recusado') {
    return { situacao: 'recusado', faltantes: [], etapaAtual: null };
  }
  // gerado, aguardando_assinatura, visualizado
  return { situacao: 'termo_gerado_nao_enviado', faltantes: [], etapaAtual: null };
}

/**
 * Obtém o termo mais recente ativo (não substituído/cancelado/invalidado) de uma lista ordenada.
 */
export function getTermoRecenteAtivo(termosProposta) {
  if (!termosProposta || termosProposta.length === 0) return null;
  // termosProposta já ordenado por -versao; pegar o primeiro não inativo
  return termosProposta.find((t) => !STATUS_INATIVO_TERMO.includes(t.status)) || null;
}

/**
 * Obtém a solicitação atual (não cancelada) de uma lista ordenada.
 */
export function getSolicitacaoAtual(solicitacoesProposta) {
  if (!solicitacoesProposta || solicitacoesProposta.length === 0) return null;
  return solicitacoesProposta.find((s) => !STATUS_INATIVO_SOLICITACAO.includes(s.status)) || null;
}

/**
 * Data de envio da assinatura: prioriza a solicitação, depois o termo.
 */
export function getDataEnvio(termoRecente, solicitacaoAtual) {
  if (solicitacaoAtual?.data_criacao) return solicitacaoAtual.data_criacao;
  if (termoRecente?.data_envio) return termoRecente.data_envio;
  return null;
}

/**
 * Tempo pendente formatado (ex: "3d 4h", "5h", "12min").
 */
export function getTempoPendente(termoRecente, solicitacaoAtual, situacao) {
  if (['concluido', 'recusado', 'termo_nao_gerado'].includes(situacao)) return null;
  const dataBase = solicitacaoAtual?.data_criacao || termoRecente?.data_geracao;
  if (!dataBase) return null;
  const diffMs = Date.now() - new Date(dataBase).getTime();
  if (diffMs < 0) return null;
  const dias = Math.floor(diffMs / 86400000);
  const horas = Math.floor((diffMs % 86400000) / 3600000);
  const minutos = Math.floor((diffMs % 3600000) / 60000);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
}

/**
 * Calcula o intervalo de datas (início/fim) para um atalho de período.
 * Retorna { inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' } ou null para 'all'.
 */
export function computePeriodoRange(periodo) {
  if (periodo === 'all' || periodo === 'custom') return null;
  const today = new Date();
  const fim = today.toISOString().slice(0, 10);
  if (periodo === 'today') return { inicio: fim, fim };
  const dias = parseInt(periodo, 10);
  if (isNaN(dias)) return null;
  const inicioDate = new Date(today);
  inicioDate.setDate(inicioDate.getDate() - dias);
  return { inicio: inicioDate.toISOString().slice(0, 10), fim };
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function stripCpf(s) {
  return String(s || '').replace(/[.\-\/\s]/g, '');
}
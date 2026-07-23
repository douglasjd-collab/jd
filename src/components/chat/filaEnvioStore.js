// Store singleton (vanilla JS) da fila de envio assíncrona do Bate-Papo.
//
// Centraliza o estado de cada envio pendente por conversa, permitindo que
// múltiplos uploads/envios rodem em paralelo sem bloquear a UI.
//
// Estados possíveis de cada item:
//   preparando | carregando | na_fila | enviando | enviada | entregue | lida | falhou | cancelado
//
// O pipeline de fato (ler arquivo → base64 → invoke backend → substituir temp_id
// pelo id real) roda no hook useFilaEnvio (React). Este store só guarda
// metadados e notifica ouvintes — mantendo o React distante do loop de envio.

const subscribers = new Set();

/** Map<tempId, EnvioItem> */
const envios = new Map();

const PERSIST_KEY = 'fila_envio_pendente_v1';

function emit() {
  subscribers.forEach((cb) => {
    try { cb(snapshot()); } catch (_) {}
  });
}

/** Snapshot imutável para os ouvintes. */
export function snapshot() {
  return Array.from(envios.values()).map((e) => ({ ...e }));
}

export function subscribe(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function getEnvio(tempId) {
  return envios.get(tempId) ? { ...envios.get(tempId) } : null;
}

export function getEnviosPorConversa(conversaId) {
  const out = [];
  envios.forEach((e) => {
    if (e.conversaId === conversaId) out.push({ ...e });
  });
  return out;
}

export function temPendentes(conversaId) {
  for (const e of envios.values()) {
    if (
      e.conversaId === conversaId &&
      ['preparando', 'carregando', 'na_fila', 'enviando'].includes(e.estado)
    ) {
      return true;
    }
  }
  return false;
}

// Verifica se há uploads/envios em andamento em QUALQUER conversa (usado no
// beforeunload para avisar o atendente antes de fechar/atualizar a página).
export function temPendentesGlobal() {
  for (const e of envios.values()) {
    if (['preparando', 'carregando', 'na_fila', 'enviando'].includes(e.estado)) {
      return true;
    }
  }
  return false;
}

export function gerarTempId() {
  // Chave de idempotência: prefixo + timestamp + random — evita duplicidade
  // mesmo após reconnect/refetch.
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Cria um novo item na fila. Não dispara o pipeline — apenas registra no store.
 * O hook useFilaEnvio é quem observa o novo estado "preparando" e inicia o envio.
 */
export function enqueue(input) {
  const tempId = input.tempId || gerarTempId();
  const item = {
    tempId,
    conversaId: input.conversaId,
    tipo: input.tipo || 'texto', // texto | imagem | audio | video | pdf | documento | figurinha
    texto: input.texto || '',
    arquivo: input.arquivo || null, // { base64, nome, tipo, tamanho } | null
    mensagemParaResponder: input.mensagemParaResponder || null,
    usuarioNome: input.usuarioNome || '',
    empresaId: input.empresaId || null,
    numeroCliente: input.numeroCliente || null,
    whatsappIdDestino: input.whatsappIdDestino || null,
    conversa: input.conversa || null,
    criadoEm: Date.now(),
    ordem: envios.size + 1,
    tentativas: 0,
    estado: input.estado || 'preparando',
    progresso: 0,
    erro: null,
    realId: null,
    whatsappId: null,
  };
  envios.set(tempId, item);
  emit();
  return tempId;
}

export function patch(tempId, patchObj) {
  const atual = envios.get(tempId);
  if (!atual) return null;
  const novo = { ...atual, ...patchObj };
  envios.set(tempId, novo);
  emit();
  return { ...novo };
}

export function setErro(tempId, msg) {
  const atual = envios.get(tempId);
  if (!atual) return null;
  return patch(tempId, { estado: 'falhou', erro: msg || 'Falha no envio' });
}

export function setEnviada(tempId, realId, whatsappId, estadoFinal) {
  return patch(tempId, {
    estado: estadoFinal || 'enviada',
    realId: realId || null,
    whatsappId: whatsappId || null,
    progresso: 100,
  });
}

export function setProgresso(tempId, progresso, estado) {
  const atual = envios.get(tempId);
  if (!atual) return null;
  return patch(tempId, {
    progresso: Math.max(0, Math.min(100, progresso)),
    ...(estado ? { estado } : {}),
  });
}

export function cancelar(tempId) {
  const atual = envios.get(tempId);
  if (!atual) return null;
  // só cancela se ainda está em andamento (preparando..enviando) ou falhou
  if (!['preparando', 'carregando', 'na_fila', 'enviando', 'falhou'].includes(atual.estado)) return null;
  return patch(tempId, { estado: 'cancelado', erro: 'Envio cancelado pelo atendente' });
}

export function remover(tempId) {
  if (envios.delete(tempId)) emit();
}

export function limparConversa(conversaId) {
  let removidos = 0;
  for (const [tempId, e] of Array.from(envios.entries())) {
    if (e.conversaId === conversaId && ['enviada', 'cancelado'].includes(e.estado)) {
      envios.delete(tempId);
      removidos++;
    }
  }
  if (removidos > 0) emit();
}

/**
 * Marca para reenvio: volta para "preparando" e incrementa tentativas.
 * O hook detecta e reinicia o pipeline para esse tempId.
 */
export function reenviar(tempId) {
  const atual = envios.get(tempId);
  if (!atual) return null;
  if (atual.estado !== 'falhou' && atual.estado !== 'cancelado') return null;
  return patch(tempId, {
    estado: 'preparando',
    tentativas: (atual.tentativas || 0) + 1,
    erro: null,
    progresso: 0,
  });
}

/**
 * Persistência leve em localStorage: guarda metadados dos itens ativos
 * (texto/estado), para visualização diagnóstica. NÃO tenta restaurar envios
 * de mídia após reload (não é tecnicamente possível regenerar o blob).
 * Chamado opcionalmente — usado pelo hook para mostrar "pendências" no beforeunload.
 */
export function snapshotPersistencia() {
  const out = [];
  for (const e of envios.values()) {
    out.push({
      tempId: e.tempId,
      conversaId: e.conversaId,
      tipo: e.tipo,
      estado: e.estado,
      texto: e.tipo === 'texto' ? e.texto : '',
      usuarioNome: e.usuarioNome,
      criadoEm: e.criadoEm,
    });
  }
  try { localStorage.setItem(PERSIST_KEY, JSON.stringify(out)); } catch (_) {}
  return out;
}

export function limparSnapshotPersistencia() {
  try { localStorage.removeItem(PERSIST_KEY); } catch (_) {}
}

export function lerSnapshotPersistencia() {
  try {
    const txt = localStorage.getItem(PERSIST_KEY);
    if (!txt) return [];
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
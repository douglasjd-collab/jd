// Cache limitado à sessão da aba, isolado por empresa e usuário.
const PREFIXO = 'jd_historico_v1:';
const MAX_CONVERSAS = 20;
const MAX_MENSAGENS = 100;
const MAX_BYTES = 150000;

function chave(escopo, conversaId) {
  return PREFIXO + JSON.stringify([escopo, conversaId]);
}

export function lerHistoricoSessao(escopo, conversaId) {
  if (!escopo || !conversaId) return undefined;
  try {
    const salvo = JSON.parse(sessionStorage.getItem(chave(escopo, conversaId)) || 'null');
    if (!Array.isArray(salvo?.mensagens)) return undefined;
    const mensagens = salvo.mensagens.filter(m => m.conversa_id === conversaId && m.id && !/^(tmp_|temp_)/.test(m.id));
    return mensagens.length ? mensagens : undefined;
  } catch { return undefined; }
}

export function salvarHistoricoSessao(escopo, conversaId, mensagens) {
  if (!escopo || !conversaId || !Array.isArray(mensagens)) return;
  try {
    const limpas = mensagens.filter(m => m.conversa_id === conversaId && m.id && !/^(tmp_|temp_)/.test(m.id))
      .slice(-MAX_MENSAGENS).map(({fila_envio_estado, fila_envio_progresso, fila_envio_erro, ...m}) => m);
    if (!limpas.length) return;
    let json = JSON.stringify({salvoEm: Date.now(), mensagens: limpas});
    while (json.length > MAX_BYTES && limpas.length > 1) {
      limpas.shift();
      json = JSON.stringify({salvoEm: Date.now(), mensagens: limpas});
    }
    if (json.length > MAX_BYTES) return;
    const key = chave(escopo, conversaId);
    const existentes = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIXO) && k !== key) {
        let salvoEm = 0;
        try { salvoEm = JSON.parse(sessionStorage.getItem(k))?.salvoEm || 0; } catch {}
        existentes.push({k, salvoEm});
      }
    }
    existentes.sort((a,b) => b.salvoEm - a.salvoEm);
    for (const item of existentes.slice(MAX_CONVERSAS - 1)) sessionStorage.removeItem(item.k);
    sessionStorage.setItem(key, json);
  } catch { /* Indisponibilidade/quota do cache não impede abrir o chat. */ }
}

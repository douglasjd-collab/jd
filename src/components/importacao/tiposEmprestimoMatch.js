// Reconhecimento de descrições de tipo de empréstimo em arquivos de importação.
// A mesma regra existe no backend em base44/shared/tiposEmprestimoShared.ts
// (usada pela function vincularTipoPendencia). Ao alterar a normalização aqui, altere lá também.

export const TIPO_NAO_INFORMADO = 'Tipo não informado';

// Normaliza descrição/origem: sem acentos, minúscula, espaços extras removidos.
export function normalizarDescricaoTipo(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Chave do vínculo: "origem|descrição" quando há origem (banco), senão apenas a descrição.
export function chaveOrigemDescricao(origem, descricao) {
  const d = normalizarDescricaoTipo(descricao);
  if (!d) return null;
  const o = normalizarDescricaoTipo(origem);
  return o ? `${o}|${d}` : d;
}

// Índice de reconhecimento: códigos, nomes e aliases (globais e por origem).
export function construirIndiceTipos(tipos) {
  const globais = new Map();
  const porOrigem = new Map();

  const adicionar = (mapa, chave, tipo) => {
    if (!chave) return;
    const atual = mapa.get(chave) || new Map();
    atual.set(tipo.id, tipo);
    mapa.set(chave, atual);
  };

  for (const tipo of tipos || []) {
    if (tipo.ativo === false) continue;
    for (const valor of [tipo.nome, tipo.slug, ...(tipo.aliases_importacao || [])]) {
      adicionar(globais, chaveOrigemDescricao('', valor), tipo);
    }
    for (const alias of tipo.aliases_por_origem || []) {
      const chave = normalizarDescricaoTipo(alias);
      if (chave && chave.includes('|')) adicionar(porOrigem, chave, tipo);
    }
  }

  return {
    globais,
    porOrigem,
    // Tipos marcados para receber arquivos sem tipo informado
    semDescricao: (tipos || []).filter(t => t.ativo !== false && t.tipo_padrao_sem_descricao),
  };
}

/**
 * Resolve o tipo de um registro importado.
 * Retorna { tipo } quando há correspondência única, { conflito: true } quando mais de um
 * tipo casa com a descrição e { tipo: null, conflito: false } quando nada casa (pendente).
 */
export function resolverTipoImportacao({ descricao, origem, indice }) {
  const texto = String(descricao ?? '').trim();
  const descricaoChave = normalizarDescricaoTipo(texto);
  const origemTexto = String(origem ?? '').trim();
  const origemChave = normalizarDescricaoTipo(origemTexto);

  if (!descricaoChave) {
    const padrao = indice?.semDescricao || [];
    return {
      descricaoOriginal: TIPO_NAO_INFORMADO,
      descricaoChave: normalizarDescricaoTipo(TIPO_NAO_INFORMADO),
      origem: origemTexto,
      origemChave,
      semDescricao: true,
      tipo: padrao.length === 1 ? padrao[0] : null,
      conflito: padrao.length > 1,
    };
  }

  // Precedência: vínculo por origem (banco) e, se não houver, vínculo global.
  const conjunto = (origemChave ? indice?.porOrigem?.get(`${origemChave}|${descricaoChave}`) : null)
    || indice?.globais?.get(descricaoChave)
    || null;
  const tipos = conjunto ? [...conjunto.values()] : [];

  return {
    descricaoOriginal: texto,
    descricaoChave,
    origem: origemTexto,
    origemChave,
    semDescricao: false,
    tipo: tipos.length === 1 ? tipos[0] : null,
    conflito: tipos.length > 1,
  };
}
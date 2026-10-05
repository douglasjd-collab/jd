// Regras compartilhadas entre backend functions para reconhecer descrições de tipo de
// empréstimo vindas de arquivos de importação (código, nome e aliases cadastrados).
//
// A mesma regra é usada no frontend em src/components/importacao/tiposEmprestimoMatch.js
// (a importação de comissões roda no navegador). Ao alterar a normalização aqui, altere lá também.

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
export function chaveAlias(origem, descricao) {
  const d = normalizarDescricaoTipo(descricao);
  if (!d) return null;
  const o = normalizarDescricaoTipo(origem);
  return o ? `${o}|${d}` : d;
}

// Todas as chaves de reconhecimento de um tipo: nome, slug, aliases globais e por origem.
export function chavesDoTipo(tipo) {
  const chaves = new Set();
  for (const valor of [tipo?.nome, tipo?.slug]) {
    const k = chaveAlias('', valor);
    if (k) chaves.add(k);
  }
  for (const alias of tipo?.aliases_importacao || []) {
    const k = chaveAlias('', alias);
    if (k) chaves.add(k);
  }
  for (const alias of tipo?.aliases_por_origem || []) {
    const bruto = normalizarDescricaoTipo(alias);
    if (bruto && bruto.includes('|')) chaves.add(bruto);
  }
  return chaves;
}

// Tipos (além do próprio) que já reconhecem esta chave — impede aliases conflitantes.
export function tiposComChave(tipos, chave, ignorarTipoId = null) {
  if (!chave) return [];
  return (tipos || []).filter((t) => t.id !== ignorarTipoId && chavesDoTipo(t).has(chave));
}
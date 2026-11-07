const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
export function resolverTipoImportacao(original, tipos) {
  const valor = normalizar(original);
  if (!valor) return { tipo: null, motivo: 'Tipo de proposta não informado' };
  const encontrados = tipos.filter(t => t.ativo !== false && t.slug && [t.nome, t.slug, ...(t.aliases_importacao || [])].some(n => normalizar(n) === valor));
  const slugs = [...new Set(encontrados.map(t => t.slug))];
  if (slugs.length === 1) return { tipo: slugs[0], motivo: null };
  return { tipo: null, motivo: slugs.length > 1 ? 'Tipo de proposta ambíguo no cadastro' : 'Tipo de proposta não encontrado' };
}

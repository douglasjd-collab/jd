// Hierarquia de bancos no frontend.
// Mesma regra usada no backend (base44/shared/bancosHierarquia.ts), mantida aqui
// como módulo próprio: o navegador não tem acesso à pasta base44/shared.

const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/\s+/g, ' ');

export function bancoPrincipal(banco, bancos) {
  if (!banco) return null;
  const vistos = new Set();
  let atual = banco;
  while (atual.banco_pai_id) {
    if (vistos.has(atual.id)) throw new Error('Vínculo circular entre bancos.');
    vistos.add(atual.id);
    const pai = bancos.find((b) => b.id === atual.banco_pai_id && b.empresa_id === banco.empresa_id);
    if (!pai || pai.ativo === false) throw new Error('Banco pai ausente ou inativo. Revise o cadastro de bancos.');
    atual = pai;
  }
  return atual;
}

export function encontrarBanco(nome, bancos) {
  const texto = norm(nome);
  if (!texto) return null;
  const exatos = bancos.filter(
    (b) => norm(b.nome) === texto || (b.aliases_importacao || []).some((a) => norm(a) === texto)
  );
  if (exatos.length > 1) throw new Error('Nome de banco ambíguo. Revise os nomes alternativos no cadastro.');
  if (exatos.length) return exatos[0];
  const parciais = bancos.filter(
    (b) => norm(b.nome) && (norm(b.nome).includes(texto) || texto.includes(norm(b.nome)))
  );
  return parciais.length === 1 ? parciais[0] : null;
}

export function bancoDaProposta(proposta, bancos) {
  const daEmpresa = bancos.filter((b) => b.empresa_id === proposta.empresa_id);
  const banco = daEmpresa.find((b) => b.id === proposta.administradora_id)
    || encontrarBanco(proposta.administradora_nome, daEmpresa);
  return bancoPrincipal(banco, daEmpresa);
}

export function validarVinculoBanco(id, paiId, bancos, empresaId) {
  if (!paiId) return;
  const pai = bancos.find((b) => b.id === paiId && b.empresa_id === empresaId && b.ativo !== false);
  if (!pai) throw new Error('Selecione um banco pai ativo da mesma empresa.');
  if (id === paiId) throw new Error('O banco não pode ser pai dele mesmo.');
  const lista = bancos.map((b) => (b.id === id ? { ...b, banco_pai_id: paiId } : b));
  bancoPrincipal({ id: id || '__novo__', empresa_id: empresaId, banco_pai_id: paiId }, lista);
}
// Resolve lançamentos antigos que guardavam só o nome da subcategoria em "categoria".
// Não altera registros nem escolhe entre nomes ambíguos ou empresas diferentes.
export function classificacaoDespesa(despesa, categorias = []) {
  const disponiveis = categorias.filter(c => !despesa.empresa_id || c.empresa_id === despesa.empresa_id);
  const unica = lista => lista.length === 1 ? lista[0] : null;
  const categoriaSalva = despesa.categoria || despesa.categoria_nome || '';
  const explicita = !!despesa.categoria_id || !!despesa.subcategoria_id || !!despesa.subcategoria_nome;
  const categoria = disponiveis.find(c => c.id === despesa.categoria_id);
  const subcategoria = disponiveis.find(c => c.id === despesa.subcategoria_id);

  if (explicita) {
    return {
      categoria: categoria?.nome || categoriaSalva,
      categoria_id: despesa.categoria_id || '',
      subcategoria_id: despesa.subcategoria_id || '',
      subcategoria_nome: despesa.subcategoria_nome ?? subcategoria?.nome ?? '',
    };
  }

  const encontrada = unica(disponiveis.filter(c => c.nome === categoriaSalva));
  const pai = encontrada?.categoria_pai_id
    ? disponiveis.find(c => c.id === encontrada.categoria_pai_id)
    : null;

  return {
    categoria: pai?.nome || categoriaSalva,
    categoria_id: pai?.id || (encontrada && !encontrada.categoria_pai_id ? encontrada.id : ''),
    subcategoria_id: pai ? encontrada.id : '',
    subcategoria_nome: pai ? encontrada.nome : '',
  };
}

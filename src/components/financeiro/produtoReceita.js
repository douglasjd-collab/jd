const PRODUTOS = ['Consórcio', 'Financiamento', 'Empréstimo Consignado', 'Proteção Veicular', 'Seguros', 'Microcrédito', 'Outros'];
const normalizar = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

// Receitas antigas podem ter categoria de produto, mas campo produto vazio.
export function produtoDaReceita(receita) {
  if (receita.produto) return receita.produto;
  const categoria = normalizar(receita.categoria_nome || receita.categoria);
  return PRODUTOS.find(produto => normalizar(produto) === categoria) || 'Outros';
}

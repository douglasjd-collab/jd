export const PRODUTO_CONFIG = {
  consorcio:         { label: 'Consórcio',          emoji: '🟣', cor: '#7c3aed', bg: 'bg-purple-100',   text: 'text-purple-800',   barra: '#7c3aed' },
  emprestimo:        { label: 'Consignado',          emoji: '🟢', cor: '#16a34a', bg: 'bg-green-100',    text: 'text-green-800',    barra: '#16a34a' },
  financiamento:     { label: 'Financiamento',       emoji: '🔵', cor: '#2563eb', bg: 'bg-blue-100',     text: 'text-blue-800',     barra: '#2563eb' },
  fgts:              { label: 'FGTS',                emoji: '🟢', cor: '#15803d', bg: 'bg-emerald-100',  text: 'text-emerald-900',  barra: '#15803d' },
  seguro:            { label: 'Seguro',              emoji: '🟠', cor: '#ea580c', bg: 'bg-orange-100',   text: 'text-orange-800',   barra: '#ea580c' },
  protecao_veicular: { label: 'Proteção Veicular',   emoji: '🔴', cor: '#dc2626', bg: 'bg-red-100',      text: 'text-red-800',      barra: '#dc2626' },
  microcredito:      { label: 'Microcrédito',        emoji: '🟤', cor: '#92400e', bg: 'bg-amber-100',    text: 'text-amber-900',    barra: '#92400e' },
};

export function getProdutoConfig(produto) {
  if (!produto) return PRODUTO_CONFIG.consorcio;
  const key = produto.toLowerCase().replace(/[\s-]/g, '_');
  return PRODUTO_CONFIG[key] || {
    label: produto.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    emoji: '🗂️',
    cor: '#64748b',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    barra: '#64748b',
  };
}
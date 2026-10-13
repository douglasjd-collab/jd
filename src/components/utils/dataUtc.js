// O backend retorna datas ISO sem o designador de fuso (ex: "2026-10-13T16:04:21.128000").
// Sem o "Z", o navegador interpreta como hora local, deslocando 3h no horário de Brasília.
// Esta função anexa "Z" quando não há fuso, tratando como UTC e convertendo para o local correto.
export function parseDataSegura(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr);
  // Já tem fuso (Z ou +hh:mm ao final)?
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  // Sem fuso: assume UTC
  return new Date(s + 'Z');
}
// Formata telefone brasileiro para exibição no padrão:
//   (87) 9 8127-5628  → celular (9 dígitos após o DDD)
//   (87) 9653-6201    → fixo   (8 dígitos após o DDD)
// Aceita o número com ou sem o código do país (55) e ignora outros caracteres.
export function formatarTelefoneBR(valor = '') {
  const original = String(valor || '').trim();
  if (!original) return '';

  let digitos = original.replace(/\D/g, '');

  // Remove o código do país quando presente (55 + DDD + número)
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }

  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 3)} ${digitos.slice(3, 7)}-${digitos.slice(7)}`;
  }

  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }

  // Número fora do padrão (grupo, Instagram, etc.) — mantém como está
  return original;
}
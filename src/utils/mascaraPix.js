// Máscara parcial de chave PIX para exibição em telas e comprovantes.
// A chave completa só é exibida para usuários autorizados — aqui mantemos
// sempre a versão mascarada, conforme padrão de privacidade do CRM.

function apenasDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

export function mascararDocumento(doc) {
  const d = apenasDigitos(doc);
  if (d.length === 11) {
    // CPF: preserve apenas os 2 últimos dígitos visíveis
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '***.***.***-$2');
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '**.***.***/****-$2');
  }
  if (d.length >= 4) {
    return '*'.repeat(d.length - 2) + d.slice(-2);
  }
  return d;
}

export function mascararChavePix(chave, tipo) {
  if (!chave) return '';
  const t = String(tipo || '').toLowerCase();

  if (t === 'cpf') return mascararDocumento(chave);
  if (t === 'cnpj') return mascararDocumento(chave);
  if (t === 'celular' || t === 'telefone' || /^\+?\d{8,15}$/.test(String(chave).replace(/[\s()-]/g, ''))) {
    const d = apenasDigitos(chave);
    if (d.length >= 8) {
      const ultimos4 = d.slice(-4);
      const ddd = d.slice(-6, -4) || 'XX';
      return `(${ddd}) *****-${ultimos4.length >= 2 ? ultimos4 : '****'}`.replace('*' + ddd, '*(' + ddd);
    }
    return '*'.repeat(chave.length);
  }
  if (t === 'email' || /@/.test(chave)) {
    const [user, domain] = String(chave).split('@');
    if (user && domain) {
      const u = user.length <= 2 ? user[0] + '*' : user[0] + '***' + user.slice(-1);
      return `${u}@${domain}`;
    }
    return '***';
  }
  if (t === 'aleatoria') {
    if (chave.length <= 4) return '****';
    return chave.slice(0, 4) + '•••••' + chave.slice(-4);
  }

  // Fallback genérico: mantém os 4 últimos caracteres visíveis
  if (chave.length <= 6) return '***';
  return '*'.repeat(chave.length - 4) + chave.slice(-4);
}

export default mascararChavePix;
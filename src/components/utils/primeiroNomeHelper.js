// Marcação enviada à API para sinalizar que a variável {{1}} deve ser
// resolvida automaticamente no envio (primeiro nome do destinatário).
// O backend substitui pelo primeiro nome real de cada cliente no momento do disparo.
export const AUTO_PRIMEIRO_NOME = '__AUTO_PRIMEIRO_NOME__';

// Texto alternativo utilizado quando o contato não possui nome cadastrado.
export const TEXTO_ALTERNATIVO_SEM_NOME = 'por aí';

// Capitaliza a primeira letra de cada parte do nome; para o primeiro nome,
// só a primeira letra importa, mas mantemos consistência visual ("joão" → "João").
function capitalizar(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Extrai o primeiro nome a partir do nome completo (limpa espaços extras).
// Retorna '' quando não houver nome disponível.
export function extrairPrimeiroNome(nomeCompleto) {
  const nome = (nomeCompleto || '').toString().trim();
  if (!nome) return '';
  // Remove espaços extras/múltiplos e pega a primeira palavra válida
  const partes = nome.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  return capitalizar(partes[0]);
}

// Retorna o primeiro nome do cliente a partir do objeto Cliente do CRM.
// Prioriza o campo `primeiro_nome` já extraído; cai para `nome_completo`.
export function primeiroNomeDoCliente(cliente) {
  if (!cliente) return '';
  if (cliente.primeiro_nome && cliente.primeiro_nome.trim()) {
    return capitalizar(cliente.primeiro_nome.trim());
  }
  if (cliente.nome_completo) {
    const extraido = extrairPrimeiroNome(cliente.nome_completo);
    if (extraido) return extraido;
  }
  // PJ: usa razao social (primeira palavra significativa)
  if (cliente.pj_razao_social) {
    const extraido = extrairPrimeiroNome(cliente.pj_razao_social);
    if (extraido) return extraido;
  }
  return '';
}

// Primeiro nome OU texto alternativo "por aí" quando não houver nome.
export function primeiroNomeOuAlternativa(cliente) {
  const nome = primeiroNomeDoCliente(cliente);
  return nome || TEXTO_ALTERNATIVO_SEM_NOME;
}

// Identifica se um valor de variável está marcado como automático.
export function ehAutoPrimeiroNome(valor) {
  return valor === AUTO_PRIMEIRO_NOME;
}

// Substitui variáveis {{n}} em um texto para fins de PRÉVIA (preview).
// Para {{1}} marcado como automático, usa o nome real do cliente (ou "por aí")
// para que o usuário visualize a forma final da mensagem.
export function preencherVariaveisPreview(texto, valores, cliente) {
  const exemplo = primeiroNomeOuAlternativa(cliente);
  return (texto || '').replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const val = valores?.[n];
    if (val === AUTO_PRIMEIRO_NOME) return exemplo;
    return val ?? m;
  });
}
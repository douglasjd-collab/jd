// Cache de visualização temporário, por aba/usuário/empresa. Nunca é fonte oficial.
// sessionStorage sobrevive ao F5, mas não é backup nem armazenamento permanente.
const PREFIX = 'jd_lista_conversas_v1:';
const TTL = 15 * 60 * 1000;
const MAX = 300;
const chave = (empresa, usuario, limite) => PREFIX + JSON.stringify([empresa, usuario, limite]);
export function lerListaConversas(empresa, usuario, limite) {
  if (!empresa || !usuario) return undefined;
  try {
    const dado = JSON.parse(sessionStorage.getItem(chave(empresa, usuario, limite)) || 'null');
    if (!dado || Date.now() - dado.salvoEm > TTL || !Array.isArray(dado.lista)) return undefined;
    return dado.lista.filter(c => c?.id && c?.cliente_telefone);
  } catch { return undefined; }
}
export function salvarListaConversas(empresa, usuario, limite, lista) {
  if (!empresa || !usuario || !Array.isArray(lista)) return;
  try {
    const validas = lista.filter(c => c?.id && c?.cliente_telefone).slice(0, MAX);
    sessionStorage.setItem(chave(empresa, usuario, limite), JSON.stringify({salvoEm: Date.now(), lista: validas}));
  } catch { /* Cache indisponível não impede consulta ao servidor. */ }
}

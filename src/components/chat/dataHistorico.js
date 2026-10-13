// Datas de auditoria sem sufixo são UTC no Base44, não horário local do navegador.
export function dataHistorico(valor) {
  const texto = String(valor || '');
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(texto)
    ? texto + 'Z' : texto;
  return new Date(utc);
}

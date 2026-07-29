// Helpers para o painel de mídias/documentos/áudios/links do Bate-papo.

export function formatarBytes(bytes) {
  if (!bytes) return '—';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < unidades.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${unidades[i]}`;
}

export function formatarDataHora(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export function formatarDataCurta(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  } catch { return iso; }
}

export const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

export function extrairLinks(texto) {
  if (!texto) return [];
  const regex = new RegExp(URL_REGEX.source, 'gi');
  const matches = texto.match(regex) || [];
  return [...new Set(matches.map(m => m.startsWith('http') ? m : `https://${m}`))];
}

export function ehImagem(m) {
  return m?.tipo_conteudo === 'imagem' || (m?.mime_type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(m?.arquivo_nome || m?.arquivo_url || '');
}

export function ehVideo(m) {
  return m?.tipo_conteudo === 'video' || (m?.mime_type || '').startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(m?.arquivo_nome || m?.arquivo_url || '');
}

export function ehPdf(m) {
  return (m?.mime_type || '').includes('pdf') || (m?.arquivo_nome || '').toLowerCase().endsWith('.pdf');
}

export function ehDocumentoGenerico(m) {
  if (ehPdf(m)) return false;
  if (ehImagem(m) || ehVideo(m)) return false;
  return !!m?.arquivo_url;
}

export function iconeArquivo(nome) {
  const n = (nome || '').toLowerCase();
  if (n.endsWith('.pdf')) return '📄';
  if (n.endsWith('.doc') || n.endsWith('.docx')) return '📝';
  if (n.endsWith('.xls') || n.endsWith('.xlsx')) return '📊';
  if (n.endsWith('.csv')) return '📑';
  if (n.endsWith('.txt')) return '📃';
  if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z')) return '🗜️';
  return '📎';
}
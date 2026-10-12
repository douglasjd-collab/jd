// Extrai o nome original do arquivo de uma mensagem do WhatsApp.
//
// Problema histórico: webhooks da D-API/Meta nem sempre preenchiam `arquivo_nome`.
// O nome original ficava apenas no `texto` (legenda/caption) quando não havia
// caption digitada pelo cliente — ex.: "NU_797887887_01AGO2026_31AGO2026.pdf".
// O backend, ao re-baixar a mídia, subia com nome `media_<id>.ext`, e o download
// do CRM acabava salvando esse nome técnico em vez do original.
//
// Esta função recupera o nome original nesta ordem:
//   1. mensagem.arquivo_nome (se preenchido)
//   2. mensagem.texto, se parecer um nome de arquivo (tem extensão conhecida)
// Caso contrário retorna '' (o chamador decide o fallback).
const EXT_RE = /\.(pdf|jpe?g|png|gif|webp|mp4|mov|avi|mp3|ogg|m4a|wav|webm|opus|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z)$/i;

export function nomeArquivoEfetivo(mensagem) {
  if (!mensagem) return '';
  const direto = String(mensagem.arquivo_nome || '').trim();
  if (direto && direto !== 'Documento' && direto !== 'Documento PDF') return direto;
  const t = String(mensagem.texto || '').trim();
  if (!t) return '';
  // Remove prefixos de emoji/símbolo (📎 etc.) e espaços de borda
  const limpo = t.replace(/^[^\p{L}\p{N}\s]+/u, '').trim();
  if (limpo && EXT_RE.test(limpo)) return limpo;
  return '';
}
// Resolve o tipo REAL de uma mensagem de mídia a partir do MIME e da extensão do arquivo.
//
// Motivo: mensagens de áudio (.ogg) foram salvas com tipo_conteudo "pdf".
// Como o Bate-papo escolhe o renderizador pelo tipo_conteudo, o áudio era exibido dentro
// do visualizador de PDF — um <iframe> que aponta direto para o arquivo. O navegador não
// consegue exibir esse arquivo no iframe (a URL é servida como application/octet-stream)
// e o baixa automaticamente para a pasta Downloads a cada abertura da conversa.
//
// Aqui o tipo declarado só é corrigido quando o arquivo pertence, de fato, a outra
// família de mídia — assim a visualização/reprodução acontece dentro do CRM.
const AUDIO = ['ogg', 'oga', 'opus', 'mp3', 'm4a', 'aac', 'wav', 'amr', 'aiff', 'caf', 'weba'];
const IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'tif', 'tiff'];
const VIDEO = ['mov', 'mkv', 'avi', '3gp', 'm4v', 'wmv'];

function extensao(valor) {
  const base = String(valor || '').split('?')[0].split('#')[0].toLowerCase();
  const pos = base.lastIndexOf('.');
  return pos >= 0 ? base.slice(pos + 1) : '';
}

function tipoRealDoArquivo(mensagem, declarado) {
  const mime = String(mensagem?.mime_type || '').toLowerCase();
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.includes('pdf')) return 'pdf';

  const ext = extensao(mensagem?.arquivo_nome) || extensao(mensagem?.arquivo_url);
  if (!ext) return null;
  if (AUDIO.includes(ext)) return 'audio';
  if (IMAGEM.includes(ext)) return 'imagem';
  if (VIDEO.includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  // Extensões ambíguas (mensagem de voz gravada em webm/mp4 x vídeo): mantém o declarado
  if (ext === 'webm' || ext === 'mp4') return declarado === 'video' ? 'video' : 'audio';
  return null;
}

export function resolverTipoConteudo(mensagem) {
  const declarado = mensagem?.tipo_conteudo || 'texto';
  if (declarado === 'figurinha') return 'figurinha';

  const real = tipoRealDoArquivo(mensagem, declarado);
  if (!real || real === declarado) return declarado;
  if (['audio', 'imagem', 'video', 'pdf'].includes(real)) return real;
  return declarado;
}
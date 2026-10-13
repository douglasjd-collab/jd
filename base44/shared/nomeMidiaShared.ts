const extensao = /\.(pdf|jpe?g|png|gif|webp|mp4|mov|avi|mp3|ogg|m4a|wav|webm|opus|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z)$/i;
const generico = /^(Documento(?: PDF)?|Mensagem|Imagem|Vídeo|Áudio)$/i;
export function nomeOriginalMidia(mensagem) {
  const nome = String(mensagem.arquivo_nome || '').trim();
  if (nome && !generico.test(nome) && !/^media_[a-f\d]+\./i.test(nome)) return nome;
  const texto = String(mensagem.texto || '').trim();
  if (!texto || generico.test(texto) || /[\r\n]/.test(texto) || texto.length > 200) return '';
  if (extensao.test(texto)) return texto;
  const pdf = mensagem.tipo_conteudo === 'pdf' || mensagem.mime_type === 'application/pdf' || /\.pdf(?:[?#]|$)/i.test(mensagem.arquivo_url || '');
  return pdf && mensagem.tipo_conteudo === 'documento' ? `${texto}.pdf` : '';
}
export function metadadosMidiaDapi(data, tipo, texto, url) {
  const media = data.media_data || {};
  const arquivo_nome = nomeOriginalMidia({
    arquivo_nome: media.filename || media.fileName || data.filename || data.fileName || media.title || '',
    texto, tipo_conteudo: tipo, arquivo_url: url,
    mime_type: media.mime_type || media.mimetype || data.mime_type || data.mimetype || ''
  });
  return {
    ...(arquivo_nome ? { arquivo_nome } : {}),
    ...(media.mime_type || media.mimetype || data.mime_type || data.mimetype ? { mime_type: media.mime_type || media.mimetype || data.mime_type || data.mimetype } : {})
  };
}
// Salva um arquivo na pasta Downloads SOMENTE quando chamado por um clique explícito
// do usuário (botão "Baixar"). Garante um único arquivo por clique.
//
// REGRA (intocável): o nome do arquivo NUNCA é renomeado no download.
// - O nome original (mensagem.arquivo_nome) é usado verbatim, preservando extensão,
//   espaços, acentos e maiúsculas/minúsculas exatamente como recebidos.
// - Só há fallback para o nome contido na URL quando nenhum nome original foi
//   informado; nesse caso o nome usado é o nome real do arquivo no storage (não um
//   nome genérico inventado como "Documento PDF" ou "video_123.mp4").
// - Nunca alteramos extensão, nunca inventamos nome, nunca abrimos em nova aba.
//
// O bug anterior: o <a> usava target=_blank, que abre uma URL de blob em nova aba em
// vez de disparar o download. Sem target, o atributo download salva o arquivo.
const baixamentosEmAndamento = new Set();

function nomeDaUrl(url) {
  try {
    const limpo = String(url || '').split('?')[0].split('#')[0];
    const nome = decodeURIComponent(limpo.split('/').pop() || '');
    return nome || 'arquivo';
  } catch {
    return 'arquivo';
  }
}

function dispararDownload(objectUrl, nome) {
  const a = document.createElement('a');
  a.href = objectUrl;
  // Nome usado verbatim — sem nenhuma transformação que altere extensão ou conteúdo.
  a.download = nome || 'arquivo';
  a.rel = 'noopener';
  // NÃO usar target=_blank: com URL de blob, _blank abre o arquivo em uma nova aba
  // em vez de baixar. Sem target, o navegador baixa com o nome informado.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Retorna true quando o arquivo foi baixado, false quando falhou (para o chamador
// mostrar erro e permitir tentar novamente).
export async function baixarArquivo(url, nomeArquivo) {
  if (!url) return false;

  const chave = url;
  if (baixamentosEmAndamento.has(chave)) return false; // evita download duplicado do mesmo clique/evento
  baixamentosEmAndamento.add(chave);

  // REGRA: nome original verbatim (apenas trim de bordas); fallback só para o nome
  // real da URL quando nenhum nome original foi fornecido. Nunca renomeia.
  const nome = (nomeArquivo && String(nomeArquivo).trim()) || nomeDaUrl(url);
  try {
    // Baixa os bytes e salva via blob: assim o nome do arquivo é preservado e o clique
    // gera exatamente um arquivo, mesmo em URL de outro domínio (onde o navegador
    // ignoraria o atributo download de um link direto).
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    dispararDownload(objectUrl, nome);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    return true;
  } catch {
    // Falha de CORS/rede: nenhum arquivo foi salvo. O chamador apresenta o erro e
    // permite tentar novamente (ou abrir em nova aba como fallback).
    return false;
  } finally {
    setTimeout(() => baixamentosEmAndamento.delete(chave), 800);
  }
}
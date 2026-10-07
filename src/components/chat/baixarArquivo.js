// Salva um arquivo na pasta Downloads SOMENTE quando chamado por um clique explícito
// do usuário (botão "Baixar"). Garante um único arquivo por clique, com o nome correto,
// sem abrir novas abas e sem navegar a página atual para a URL da mídia (o que faria o
// navegador baixar/mostrar o arquivo fora do CRM).
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

function dispararDownload(href, nome) {
  const a = document.createElement('a');
  a.href = href;
  a.download = nome || 'arquivo';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function baixarArquivo(url, nomeArquivo) {
  if (!url) return false;

  const chave = `${url}|${nomeArquivo || ''}`;
  if (baixamentosEmAndamento.has(chave)) return false; // evita download duplicado do mesmo clique/evento
  baixamentosEmAndamento.add(chave);

  const nome = nomeArquivo || nomeDaUrl(url);
  try {
    // Caminho preferencial: baixar os bytes e salvar via blob. Assim o nome do arquivo
    // é preservado e o clique gera exatamente um arquivo, mesmo em URL de outro domínio
    // (onde o navegador ignora o atributo "download" do link).
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      dispararDownload(objectUrl, nome);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
      return true;
    } catch {
      // URL sem permissão de CORS (ex: mídia da D-API): abre em nova aba, como antes.
      // Nada é salvo automaticamente — o download só ocorre pela ação do usuário.
      return false; // Não informar sucesso quando nenhum arquivo foi salvo.
    }
  } finally {
    setTimeout(() => baixamentosEmAndamento.delete(chave), 1500);
  }
}
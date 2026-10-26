// Retornos síncronos e envelopes de resultado usam o mesmo campo wsUrl.
// Nunca reconstruir a URL: ela contém a autenticação da chamada.
export function lerRespostaStream(raw) {
  const camadas = [];
  const visitar = (valor, caminho = 'resposta', nivel = 0) => {
    if (!valor || typeof valor !== 'object' || nivel > 4) return;
    camadas.push({ valor, caminho });
    visitar(valor.data, caminho + '.data', nivel + 1);
    visitar(valor.result, caminho + '.result', nivel + 1);
  };
  visitar(raw);
  const falhou = camadas.some(({ valor }) => valor.success === false);
  const stream = camadas.find(({ valor }) => typeof valor.wsUrl === 'string' && /^wss?:\/\//i.test(valor.wsUrl))?.valor;
  const mensagens = camadas.flatMap(({ valor }) => [valor.error?.message, valor.error, valor.message])
    .filter(valor => typeof valor === 'string' && valor);
  return {
    falhou,
    stream: falhou ? null : stream || null,
    mensagem: mensagens[0] || '',
    // Somente nomes de campos para diagnóstico; nunca URLs, tokens ou conteúdo.
    estrutura: camadas.map(({ valor, caminho }) => caminho + ': ' + Object.keys(valor).slice(0, 20).join(', ')).join(' | ').slice(0, 1200),
  };
}

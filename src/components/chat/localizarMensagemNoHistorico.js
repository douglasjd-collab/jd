import { base44 } from '@/api/base44Client';

/**
 * Cria a função `localizarMensagem(id)` usada pela busca do Bate-Papo.
 *
 * 1) Se a mensagem já está no DOM (carregada na conversa atual), rola e destaca.
 * 2) Caso contrário, busca no servidor o bloco de histórico que contém a mensagem
 *    (modo "localizar" do backend `buscarMensagensBatePapo`), mescla no cache do
 *    React Query e, após o re-render, rola até a mensagem centralizando-a.
 *
 * Não exibe alertas pedindo rolagem manual — o sistema carrega e localiza sozinho.
 * Usa o ID único da mensagem retornado pela busca (não o texto).
 */
export const criarLocalizarMensagem = (queryClient, conversaSelecionadaId) => async (idParamOrObj) => {
  const id = typeof idParamOrObj === 'string' ? idParamOrObj : idParamOrObj?.id;
  if (!id) return;

  const aplicarDestaque = (el) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('msg-destacada');
    setTimeout(() => el.classList.remove('msg-destacada'), 3500);
  };

  // 1. Já está no DOM: rolar e destacar.
  const existente = document.getElementById(`msg-${id}`);
  if (existente) { aplicarDestaque(existente); return; }

  // 2. Não está no DOM: buscar bloco no servidor + mesclar no cache.
  try {
    const resp = await base44.functions.invoke('buscarMensagensBatePapo', {
      conversa_id: conversaSelecionadaId,
      modo: 'localizar',
      mensagem_id: id,
      contexto_antes: 40,
      contexto_depois: 40,
    });
    const data = resp?.data;
    if (!data?.success || !Array.isArray(data.resultados) || data.resultados.length === 0) return;
    queryClient.setQueryData(['mensagens-whatsapp', conversaSelecionadaId], (old = []) => {
      const map = new Map();
      [...data.resultados, ...old].forEach(m => map.set(m.id, m));
      const merged = Array.from(map.values());
      merged.sort((a, b) => new Date(a.data_envio || a.created_date).getTime() - new Date(b.data_envio || b.created_date).getTime());
      return merged;
    });

    // 3. Aguardar re-render e rolar até a mensagem (retries decrescentes).
    for (const wait of [60, 120, 250, 500, 800, 1200, 1800]) {
      await new Promise(r => setTimeout(r, wait));
      const el = document.getElementById(`msg-${id}`);
      if (el) { aplicarDestaque(el); return; }
    }
  } catch (e) {
    console.error('Erro ao localizar mensagem:', e);
  }
};
/**
 * Separa duas informações que o chat mostra de forma independente:
 *  - a bolinha verde: mensagem que este usuário ainda NÃO visualizou;
 *  - o status do atendimento: quem precisa responder agora.
 *
 * A bolinha nunca deve indicar quem está atendendo, e a resposta enviada pelo
 * CRM ou pelo celular (já sincronizada) nunca deve deixar a bolinha acesa.
 */
export const temMensagemNaoVista = ({ naoLidas = 0, selecionada = false } = {}) =>
  !selecionada && naoLidas > 0;

/**
 * Rótulo da situação do atendimento, derivado apenas do estado da conversa.
 * `emAtendimento` indica que existe um atendente responsável dentro da janela.
 */
export const rotuloSituacaoConversa = (conversa, { emAtendimento = false } = {}) => {
  if (!conversa) return null;
  const status = conversa.status;
  const ultimoDoCliente = conversa.ultimo_remetente === 'cliente';

  if (status === 'encerrada') {
    return ultimoDoCliente
      ? { texto: 'Novo atendimento pendente', cor: '#be123c', fundo: '#ffe4e6' }
      : { texto: 'Finalizada', cor: '#64748b', fundo: '#f1f5f9' };
  }
  if (status === 'arquivada') return { texto: 'Arquivada', cor: '#64748b', fundo: '#f1f5f9' };
  if (status === 'campanha') return { texto: 'Campanha sem resposta', cor: '#6d28d9', fundo: '#ede9fe' };

  if (ultimoDoCliente) {
    if (emAtendimento) {
      const primeiroNome = String(conversa.responsavel_nome || conversa.usuario_responsavel_nome || '').trim().split(/\s+/)[0];
      return {
        texto: primeiroNome ? `Aguardando resposta · ${primeiroNome}` : 'Aguardando sua resposta',
        cor: '#0369a1',
        fundo: '#e0f2fe',
      };
    }
    return { texto: 'Aguardando atendimento', cor: '#b45309', fundo: '#fef3c7' };
  }
  if (conversa.ultimo_remetente === 'vendedor') {
    return { texto: 'Aguardando cliente', cor: '#475569', fundo: '#f1f5f9' };
  }
  return null;
};
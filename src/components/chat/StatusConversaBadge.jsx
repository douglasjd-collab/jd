import React from 'react';
import { rotuloSituacaoConversa } from '@/components/chat/situacaoAtendimento';

/**
 * Etiqueta de situação do atendimento no cartão da conversa.
 * Mostra quem precisa responder agora — nunca indica "não lido"
 * (isso é papel da bolinha verde).
 */
export default function StatusConversaBadge({ conversa, emAtendimento = false }) {
  if (!conversa) return null;
  const encerrada = ['encerrada', 'encerrado', 'finalizado'].includes(conversa.status);
  const nomeAtendente = conversa.responsavel_nome || conversa.usuario_responsavel_nome;

  const base = 'inline-flex w-fit max-w-full self-start items-center gap-1 px-1.5 py-0.5 rounded-full mb-0.5';

  if (conversa.ia_aguardando_humano && !encerrada) {
    return (
      <span title={conversa.ia_motivo_handoff || 'IA não concluiu a resposta'} className={`${base} bg-amber-100 text-amber-800`} style={{ fontSize: '10px' }}>
        {nomeAtendente ? nomeAtendente + ' · assumir atendimento' : 'Aguardando atendimento humano'}
      </span>
    );
  }

  if (conversa.ia_atendendo && conversa.ia_agente_nome && !encerrada) {
    return (
      <span title={conversa.ia_agente_papel || 'Atendimento por IA'} className={`${base} bg-blue-100 text-blue-700`} style={{ fontSize: '10px' }}>
        <span className="font-semibold truncate">{conversa.ia_agente_nome}</span>
        <span>· IA atendendo</span>
      </span>
    );
  }

  const situacao = rotuloSituacaoConversa(conversa, { emAtendimento });
  if (!situacao) return null;

  const finalizada = situacao.texto === 'Finalizada';

  return (
    <span className={base} style={{ background: situacao.fundo, fontSize: '10px', color: situacao.cor, fontWeight: 500 }}>
      {finalizada && (
        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={situacao.cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span className="truncate">{situacao.texto}</span>
    </span>
  );
}
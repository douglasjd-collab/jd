import React from 'react';

export default function StatusConversaBadge({ conversa }) {
  if (!conversa) return null;

  const finalizada = ['encerrada', 'encerrado', 'finalizada', 'finalizado'].includes(conversa.status);
  const iaAtiva = !finalizada && conversa.ia_atendendo && !conversa.ia_aguardando_humano;
  const agente = conversa.ia_agente_nome || 'IA';
  const vendedorAtendendo = !finalizada && !iaAtiva && !!(conversa.responsavel_nome || conversa.usuario_responsavel_nome);
  const nome = finalizada ? 'Atendimento finalizado' : iaAtiva
    ? (/^IA\b/i.test(agente) ? agente : `IA ${agente}`)
    : conversa.responsavel_nome || conversa.usuario_responsavel_nome || 'Sem responsável';

  return (
    <span className={`inline-flex w-fit max-w-full self-start rounded-full px-1.5 py-0.5 mb-0.5 text-[10px] font-semibold ${finalizada ? 'bg-black text-white' : iaAtiva ? 'bg-blue-100 text-blue-700' : vendedorAtendendo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
      <span className="truncate">{nome}</span>
    </span>
  );
}

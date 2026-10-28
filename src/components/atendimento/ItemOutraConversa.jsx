import React from 'react';
import { MessageSquare, CheckCheck } from 'lucide-react';
import { formatarTelefoneBR } from '@/components/utils/formatarTelefone';

/**
 * Conversa encontrada na busca que não está pendente (cliente já respondido ou
 * atendimento em andamento). Serve só para localizar e abrir o contato.
 */
export default function ItemOutraConversa({ conversa, onAbrir, onAgendar }) {
  const respondidoPeloVendedor = conversa.ultimo_remetente === 'vendedor';
  const rotulo = conversa.status === 'encerrada'
    ? 'Encerrada'
    : respondidoPeloVendedor ? 'Respondido' : 'Sem pendência';
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{conversa.cliente_nome || 'Sem nome'}</p>
          <p className="truncate text-xs text-slate-500">{formatarTelefoneBR(conversa.cliente_telefone)}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <CheckCheck className="h-3 w-3" />
          {rotulo}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAbrir(conversa)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Abrir conversa
        </button>
        <button type="button" onClick={() => onAgendar(conversa)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Agendar retorno
        </button>
      </div>
    </div>
  );
}
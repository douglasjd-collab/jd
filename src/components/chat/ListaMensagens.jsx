import React from 'react';
import { format } from 'date-fns';
import { isSameDay, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MensagemItem from './MensagemItem';
import GrupoImagens from './GrupoImagens';

const INTERVALO_MAX_MS = 60 * 1000; // 60 segundos

/**
 * Agrupa mensagens de imagem consecutivas do mesmo remetente em curto intervalo.
 * Retorna um array de { type: 'grupo_imagens', msgs } ou { type: 'mensagem', msg }
 */
function agruparMensagens(mensagens) {
  const grupos = [];
  let i = 0;
  while (i < mensagens.length) {
    const msg = mensagens[i];
    // Tentar iniciar grupo de imagens (somente imagens SEM texto)
    if (msg.tipo_conteudo === 'imagem' && !msg.texto) {
      const grupoImgs = [msg];
      let j = i + 1;
      while (j < mensagens.length) {
        const next = mensagens[j];
        if (
          next.tipo_conteudo === 'imagem' &&
          !next.texto &&
          next.remetente === msg.remetente &&
          next.conversa_id === msg.conversa_id
        ) {
          const tPrev = new Date(mensagens[j - 1].data_envio || mensagens[j - 1].created_date).getTime();
          const tCurr = new Date(next.data_envio || next.created_date).getTime();
          if (Math.abs(tCurr - tPrev) <= INTERVALO_MAX_MS) {
            grupoImgs.push(next);
            j++;
          } else break;
        } else break;
      }
      grupos.push({ type: 'grupo_imagens', msgs: grupoImgs });
      i = j;
    } else {
      grupos.push({ type: 'mensagem', msg });
      i++;
    }
  }
  return grupos;
}

export default function ListaMensagens({ mensagens, conversaSelecionada, isGrupo, onResponder, user, mensagensEndRef }) {
  const grupos = agruparMensagens(mensagens);

  return (
    <div className="space-y-3 pb-4">
      {grupos.map((item, gi) => {
        const primeiraMsg = item.type === 'grupo_imagens' ? item.msgs[0] : item.msg;
        const dataMsg = new Date(primeiraMsg.data_envio || primeiraMsg.created_date);
        const itemAnterior = gi > 0 ? grupos[gi - 1] : null;
        const msgAnterior = itemAnterior ? (itemAnterior.type === 'grupo_imagens' ? itemAnterior.msgs[0] : itemAnterior.msg) : null;
        const dataMsgAnterior = msgAnterior ? new Date(msgAnterior.data_envio || msgAnterior.created_date) : null;
        const mostrarSeparador = !dataMsgAnterior || !isSameDay(dataMsg, dataMsgAnterior);

        let labelData = '';
        if (mostrarSeparador) {
          if (isToday(dataMsg)) labelData = 'Hoje';
          else if (isYesterday(dataMsg)) labelData = 'Ontem';
          else labelData = format(dataMsg, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
        }

        const separador = mostrarSeparador ? (
          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 h-px bg-slate-300/50" />
            <span className="text-[11px] text-slate-500 bg-white/70 backdrop-blur-sm px-2.5 py-0.5 rounded-full shadow-sm font-medium">
              {labelData}
            </span>
            <div className="flex-1 h-px bg-slate-300/50" />
          </div>
        ) : null;

        if (item.type === 'grupo_imagens') {
          const isVendedor = item.msgs[0].remetente === 'vendedor';
          return (
            <div key={item.msgs.map(m => m.id).join('-')}>
              {separador}
              <GrupoImagens
                mensagens={item.msgs}
                conversaId={conversaSelecionada?.id}
                isVendedor={isVendedor}
              />
            </div>
          );
        }

        return (
          <div key={item.msg.id}>
            {separador}
            <MensagemItem
              mensagem={item.msg}
              conversaId={conversaSelecionada?.id}
              isGrupo={isGrupo}
              onResponder={onResponder}
              user={user}
            />
          </div>
        );
      })}
      <div ref={mensagensEndRef} />
    </div>
  );
}
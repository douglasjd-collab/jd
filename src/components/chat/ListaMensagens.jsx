import React from 'react';
import { format } from 'date-fns';
import { isSameDay, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MensagemItem from './MensagemItem';
import GrupoImagens from './GrupoImagens';
import { X, Forward } from 'lucide-react';
import { Button } from '@/components/ui/button';

const INTERVALO_MAX_MS = 5 * 60 * 1000; // 5 minutos (igual ao WhatsApp)

/**
 * Agrupa mensagens de imagem consecutivas do mesmo remetente em curto intervalo.
 * Retorna um array de { type: 'grupo_imagens', msgs } ou { type: 'mensagem', msg }
 */
function agruparMensagens(mensagens) {
  const grupos = [];
  let i = 0;
  while (i < mensagens.length) {
    const msg = mensagens[i];
    const textoVazio = !msg.texto || msg.texto.trim() === '';
    // Tentar iniciar grupo de imagens (somente imagens SEM texto/legenda)
    if (msg.tipo_conteudo === 'imagem' && textoVazio) {
      const grupoImgs = [msg];
      let j = i + 1;
      while (j < mensagens.length) {
        const next = mensagens[j];
        const nextTextoVazio = !next.texto || next.texto.trim() === '';
        if (
          next.tipo_conteudo === 'imagem' &&
          nextTextoVazio &&
          next.remetente === msg.remetente
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

export default function ListaMensagens({ mensagens, conversaSelecionada, isGrupo, onResponder, user, mensagensEndRef, onEditarReenviar, onSelecionarOpcaoLista, modoSelecao = false, idsSelecionados = new Set(), onToggleSelecao = null, onEncaminhar = null, onCancelarSelecao = null, onConfirmarSelecao = null, onEditar = null }) {
  const grupos = modoSelecao ? mensagens.map(msg => ({ type: 'mensagem', msg })) : agruparMensagens(mensagens);

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
              onEditarReenviar={onEditarReenviar}
              onSelecionarOpcaoLista={onSelecionarOpcaoLista}
              modoSelecao={modoSelecao}
              selecionada={idsSelecionados.has(item.msg.id)}
              onToggleSelecao={onToggleSelecao}
              onEncaminhar={onEncaminhar}
              onEditar={onEditar}
            />
          </div>
        );
      })}
      <div ref={mensagensEndRef} />
      {modoSelecao && (
        <div className="sticky bottom-0 left-0 right-0 z-10 -mb-4 mt-3 flex items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2">
            <button
              onClick={onCancelarSelecao}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Cancelar seleção"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
            <span className="text-sm font-medium text-slate-700">
              {idsSelecionados.size} selecionada{idsSelecionados.size === 1 ? '' : 's'}
            </span>
          </div>
          <Button
            size="sm"
            disabled={idsSelecionados.size === 0}
            onClick={onConfirmarSelecao}
            className="gap-2"
          >
            <Forward className="w-4 h-4" />
            Encaminhar ({idsSelecionados.size})
          </Button>
        </div>
      )}
    </div>
  );
}
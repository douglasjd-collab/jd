import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowRightLeft, MessageSquare, Plus, Paperclip, CheckSquare,
  User, DollarSign, Tag, Clock
} from 'lucide-react';

function getIconeEvento(tipo) {
  const mapa = {
    movimentacao: { icon: ArrowRightLeft, bg: 'bg-blue-100', color: 'text-blue-600' },
    comentario: { icon: MessageSquare, bg: 'bg-slate-100', color: 'text-slate-600' },
    criacao: { icon: Plus, bg: 'bg-green-100', color: 'text-green-600' },
    anexo: { icon: Paperclip, bg: 'bg-purple-100', color: 'text-purple-600' },
    checklist: { icon: CheckSquare, bg: 'bg-orange-100', color: 'text-orange-600' },
    responsavel: { icon: User, bg: 'bg-pink-100', color: 'text-pink-600' },
    valor: { icon: DollarSign, bg: 'bg-emerald-100', color: 'text-emerald-600' },
  };
  return mapa[tipo] || mapa.comentario;
}

export default function OportunidadeAbaHistorico({ oportunidade, movimentacoes = [], comentarios = [] }) {
  // Montar timeline unificada
  const eventos = [
    // Criação
    {
      id: 'criacao',
      tipo: 'criacao',
      descricao: `Oportunidade criada: "${oportunidade.titulo}"`,
      usuario_nome: oportunidade.vendedor_nome || 'Sistema',
      created_date: oportunidade.created_date,
    },
    // Movimentações de etapa
    ...movimentacoes.map(m => ({
      id: `mov_${m.id}`,
      tipo: 'movimentacao',
      descricao: `Moveu de "${m.etapa_origem_nome || 'Início'}" para "${m.etapa_destino_nome}"`,
      usuario_nome: m.usuario_nome,
      observacao: m.observacao,
      created_date: m.created_date,
    })),
    // Comentários
    ...comentarios.map(c => {
      const isAnexo = /\[([^\]]+)\]\(https?:\/\/[^)]+\)/.test(c.mensagem || '');
      return {
        id: `com_${c.id}`,
        tipo: isAnexo ? 'anexo' : 'comentario',
        descricao: isAnexo
          ? `Enviou um arquivo`
          : `Comentou: "${(c.mensagem || '').slice(0, 80)}${(c.mensagem || '').length > 80 ? '...' : ''}"`,
        usuario_nome: c.usuario_nome,
        created_date: c.created_date,
      };
    }),
  ].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  return (
    <div className="p-6 max-w-3xl">
      {eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Clock className="w-14 h-14 opacity-15 mb-4" />
          <p className="text-sm font-medium">Nenhum histórico registrado</p>
        </div>
      ) : (
        <div className="relative">
          {/* Linha vertical */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

          <div className="space-y-1">
            {eventos.map((ev, idx) => {
              const { icon: Icon, bg, color } = getIconeEvento(ev.tipo);
              return (
                <div key={ev.id} className="flex gap-4 items-start pb-5 relative">
                  {/* Ícone */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white ${bg}`}>
                    {React.createElement(Icon, { className: `w-3.5 h-3.5 ${color}` })}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-slate-700 leading-snug">{ev.descricao}</p>
                        {ev.observacao && (
                          <p className="text-xs text-slate-500 mt-0.5 italic">"{ev.observacao}"</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">
                        {ev.created_date ? format(new Date(ev.created_date), 'dd/MM HH:mm') : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">{ev.usuario_nome}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
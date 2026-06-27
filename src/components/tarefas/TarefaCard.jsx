import React from 'react';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, CheckSquare, Paperclip, MessageCircle, Phone } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/* ─── PRIORIDADE → cor da borda topo e badge ─── */
const prioridadeCfg = {
  urgente: { label: 'URGENTE',  bg: 'bg-red-50',    border: 'border-red-400',    dot: 'bg-red-500',    text: 'text-red-700' },
  alta:    { label: 'ALTA',     bg: 'bg-orange-50',  border: 'border-orange-400', dot: 'bg-orange-500', text: 'text-orange-700' },
  media:   { label: 'MÉDIA',    bg: 'bg-yellow-50',  border: 'border-yellow-400', dot: 'bg-yellow-400', text: 'text-yellow-700' },
  baixa:   { label: 'BAIXA',    bg: 'bg-green-50',   border: 'border-green-400',  dot: 'bg-green-500',  text: 'text-green-700' },
};

/* ─── PENDÊNCIA ─── */
const pendenciaLabel = {
  cliente:        'Aguardando Cliente',
  banco:          'Aguardando Banco',
  administradora: 'Aguardando Administradora',
  seguradora:     'Aguardando Seguradora',
  detran:         'Aguardando Detran',
  cartorio:       'Aguardando Cartório',
  parceiro:       'Aguardando Parceiro',
  equipe_interna: 'Aguardando Equipe',
};

export default function TarefaCard({ tarefa, onEdit, onDelete, onVerDetalhes }) {
  const finalizado = tarefa.status === 'concluido' || tarefa.status === 'arquivado';
  const prazoDate = tarefa.data_conclusao_prevista
    ? new Date(tarefa.data_conclusao_prevista + 'T23:59:59')
    : null;
  const diasPrazo = prazoDate ? differenceInDays(prazoDate, new Date()) : null;
  const atrasada  = !finalizado && diasPrazo !== null && diasPrazo < 0;
  const venceHoje = !finalizado && diasPrazo === 0;

  // Checklist
  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const checkTotal = checklist.length;
  const checkDone  = checklist.filter(i => i.checked).length;

  // Anexos
  let anexos = [];
  try { anexos = tarefa.anexos ? JSON.parse(tarefa.anexos) : []; } catch {}

  const pCfg = prioridadeCfg[tarefa.prioridade] || prioridadeCfg.media;

  // Status do prazo
  const statusPrazo = (() => {
    if (atrasada)  return { label: `Atrasada ${Math.abs(diasPrazo)} ${Math.abs(diasPrazo) === 1 ? 'dia' : 'dias'}`, cls: 'text-red-600' };
    if (venceHoje) return { label: 'Vence hoje', cls: 'text-orange-500' };
    return null;
  })();

  // Tempo desde o cadastro
  const tempoStr = (() => {
    const base = tarefa.created_date || tarefa.data_cadastro;
    if (!base) return null;
    try {
      return formatDistanceToNow(new Date(base), { addSuffix: true, locale: ptBR });
    } catch { return null; }
  })();

  // Cor do card (inspirada no funil)
  const cardBg = atrasada
    ? 'bg-orange-50 border-orange-400'
    : `${pCfg.bg} ${pCfg.border}`;

  return (
    <div
      className={`rounded-xl border-2 shadow-sm hover:shadow-md transition-all cursor-pointer ${cardBg}`}
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      {/* ══ TOPO: setor + menu ══ */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base">📁</span>
          <span className="text-xs font-bold text-slate-700 uppercase truncate">
            {tarefa.setor_nome || tarefa.subsetor_nome || 'TAREFA'}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-700 flex-shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onVerDetalhes(tarefa); }}>Ver detalhes</DropdownMenuItem>
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(tarefa); }}>Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onDelete(tarefa); }} className="text-red-600">Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status prazo ou pendência */}
      <div className="px-3 pb-1">
        {statusPrazo ? (
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${statusPrazo.cls}`}>
            <span className="inline-block w-2 h-2 rounded-full bg-current opacity-80" />
            {statusPrazo.label}
          </div>
        ) : tarefa.pendencia_com ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <span className="text-sm">🟡</span>
            {pendenciaLabel[tarefa.pendencia_com] || tarefa.pendencia_com}
          </div>
        ) : (
          <div className={`flex items-center gap-1.5 text-xs font-bold ${pCfg.text}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${pCfg.dot}`} />
            {pCfg.label}
          </div>
        )}
      </div>

      {/* ══ TÍTULO ══ */}
      <div className="px-3 pb-2">
        <h4 className="text-slate-900 font-extrabold text-sm leading-snug uppercase line-clamp-2">
          {tarefa.titulo}
        </h4>
      </div>

      {/* ══ CLIENTE + TELEFONE ══ */}
      <div className="px-3 pb-2 space-y-1">
        {tarefa.cliente_nome && (
          <p className="text-xs text-slate-600 flex items-center gap-1">
            <span>👤</span>
            <span className="font-medium uppercase truncate">{tarefa.cliente_nome}</span>
          </p>
        )}
        {tarefa.cliente_telefone && (
          <p className="text-xs text-slate-600 flex items-center gap-1">
            <span>📱</span>
            <span>{tarefa.cliente_telefone}</span>
          </p>
        )}
        {tarefa.subsetor_nome && tarefa.setor_nome && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <span>📌</span>
            <span className="truncate">{tarefa.subsetor_nome}</span>
          </p>
        )}
      </div>

      {/* ══ RODAPÉ: checklist + ações ══ */}
      <div className="px-3 pb-3 flex items-center justify-between">
        {/* Checklist / Anexos */}
        <div className="flex items-center gap-3">
          {checkTotal > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <CheckSquare className={`w-3.5 h-3.5 ${checkDone === checkTotal ? 'text-green-500' : 'text-slate-400'}`} />
              <span className={`font-bold ${checkDone === checkTotal ? 'text-green-600' : 'text-blue-600'}`}>
                {checkDone}/{checkTotal}
              </span>
            </div>
          )}
          {anexos.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Paperclip className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-bold text-slate-700">{anexos.length}</span>
            </div>
          )}
          {checkTotal === 0 && anexos.length === 0 && (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>

        {/* Ícones de ação */}
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 hover:bg-blue-100"
            onClick={e => { e.stopPropagation(); onVerDetalhes(tarefa); }}
            title="Ver detalhes"
          >
            <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
          </Button>
          {tarefa.cliente_telefone && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:bg-green-100"
              onClick={e => { e.stopPropagation(); window.open(`https://wa.me/${tarefa.cliente_telefone.replace(/\D/g, '')}`, '_blank'); }}
              title="Abrir WhatsApp"
            >
              <Phone className="w-3.5 h-3.5 text-green-500" />
            </Button>
          )}
        </div>
      </div>

      {/* ══ TEMPO ══ */}
      {tempoStr && (
        <div className="px-3 pb-3 -mt-1">
          <p className="text-xs text-slate-400">
            ⏱ {tempoStr}
          </p>
        </div>
      )}
    </div>
  );
}
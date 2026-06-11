import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal, Calendar, CheckSquare, User,
  Clock, Briefcase, MapPin, AlertTriangle
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInDays } from 'date-fns';

/* ═══════════════════════════════════════
   CONFIGURAÇÕES
   ═══════════════════════════════════════ */

const prioridadeCfg = {
  urgente: { label: 'URGENTE', dot: 'bg-red-500',    badge: 'border-red-400 text-red-600 bg-red-50' },
  alta:    { label: 'ALTA',    dot: 'bg-orange-500', badge: 'border-orange-400 text-orange-600 bg-orange-50' },
  media:   { label: 'MÉDIA',   dot: 'bg-yellow-400', badge: 'border-yellow-400 text-yellow-600 bg-yellow-50' },
  baixa:   { label: 'BAIXA',   dot: 'bg-green-500',  badge: 'border-green-400 text-green-600 bg-green-50' },
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

/* ═══════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════ */

export default function TarefaCard({ tarefa, onEdit, onDelete, onVerDetalhes }) {
  const hoje = format(new Date(), 'yyyy-MM-dd');

  const finalizado = tarefa.status === 'concluido' || tarefa.status === 'arquivado';
  const prazoDate = tarefa.data_conclusao_prevista ? new Date(tarefa.data_conclusao_prevista + 'T23:59:59') : null;
  const agora = new Date();
  const diasPrazo = prazoDate ? differenceInDays(prazoDate, agora) : null;
  const atrasada = !finalizado && diasPrazo !== null && diasPrazo < 0;
  const venceHoje = !finalizado && diasPrazo === 0;

  // Checklist
  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const checkTotal = checklist.length;
  const checkDone = checklist.filter(i => i.checked).length;

  // Responsáveis
  let responsaveisNomes = [];
  let responsaveisFotos = [];
  try { responsaveisNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
  try { responsaveisFotos = tarefa.responsaveis_fotos ? JSON.parse(tarefa.responsaveis_fotos) : []; } catch {}
  if (responsaveisNomes.length === 0 && tarefa.responsavel_principal_nome) {
    responsaveisNomes = [tarefa.responsavel_principal_nome];
  }

  const pCfg = prioridadeCfg[tarefa.prioridade] || prioridadeCfg.media;

  // Status de prazo (tag inferior esquerda)
  const prazoTag = (() => {
    if (finalizado) return { label: 'Concluída', style: 'bg-blue-50 border-blue-300 text-blue-600', icon: <CheckSquare className="w-3.5 h-3.5" /> };
    if (atrasada) return { label: `Atrasada ${Math.abs(diasPrazo)}d`, style: 'bg-red-50 border-red-400 text-red-600', icon: <AlertTriangle className="w-3.5 h-3.5" /> };
    if (venceHoje) return { label: 'Vence hoje', style: 'bg-orange-50 border-orange-400 text-orange-600', icon: <Clock className="w-3.5 h-3.5" /> };
    if (diasPrazo !== null && diasPrazo <= 3) return { label: `${diasPrazo}d restantes`, style: 'bg-yellow-50 border-yellow-400 text-yellow-600', icon: <Clock className="w-3.5 h-3.5" /> };
    return null;
  })();

  // Cor do texto do prazo no rodapé
  const prazoRodapeLabel = (() => {
    if (finalizado) return { label: 'Concluída', cls: 'text-blue-500 font-semibold' };
    if (atrasada) return { label: 'Atrasada', cls: 'text-red-500 font-semibold' };
    if (venceHoje) return { label: 'Vence hoje', cls: 'text-orange-500 font-semibold' };
    return { label: 'No prazo', cls: 'text-green-500 font-semibold' };
  })();

  const prazoFormatado = tarefa.data_conclusao_prevista
    ? format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yy')
    : '-';
  const inicioFormatado = tarefa.data_cadastro
    ? format(new Date(tarefa.data_cadastro + 'T12:00:00'), 'dd/MM/yy')
    : (tarefa.created_date ? format(new Date(tarefa.created_date), 'dd/MM/yy') : '-');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer"
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      {/* ── LINHA 1: Título + Prioridade + Menu ── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="font-bold text-slate-900 text-sm leading-snug flex-1 line-clamp-2">
          {tarefa.titulo}
        </h4>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          {/* Badge prioridade estilo imagem */}
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${pCfg.badge}`}>
            <span className={`w-2 h-2 rounded-full ${pCfg.dot}`} />
            {pCfg.label}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 hover:bg-slate-100">
                <MoreHorizontal className="w-4 h-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onVerDetalhes(tarefa); }}>Ver detalhes</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(tarefa); }}>Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(tarefa); }} className="text-red-600">Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── LINHA 2: Cliente ── */}
      {tarefa.cliente_nome && (
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600 truncate">{tarefa.cliente_nome}</span>
        </div>
      )}

      {/* ── LINHA 3: Tags Setor / Subsetor ── */}
      {(tarefa.setor_nome || tarefa.subsetor_nome || tarefa.tipo_nome) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {tarefa.setor_nome && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              {tarefa.setor_nome}
            </span>
          )}
          {(tarefa.subsetor_nome || tarefa.tipo_nome) && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              {tarefa.subsetor_nome || tarefa.tipo_nome}
            </span>
          )}
        </div>
      )}

      {/* ── LINHA 4: Status prazo + Checklist ── */}
      <div className="flex items-center gap-2 mb-3">
        {prazoTag && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${prazoTag.style}`}>
            {prazoTag.icon}
            {prazoTag.label}
          </span>
        )}
        {checkTotal > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
            <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
            {checkDone}/{checkTotal} concluídas
          </span>
        )}
      </div>

      {/* ── DIVISOR ── */}
      <div className="border-t border-slate-100 my-2" />

      {/* ── LINHA 5: Datas ── */}
      <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Início</span>
          <span className="font-semibold text-slate-700">{inicioFormatado}</span>
        </div>
        <div className="w-px h-3 bg-slate-200" />
        <div className="flex items-center gap-1.5">
          <Clock className={`w-3.5 h-3.5 ${atrasada ? 'text-red-400' : venceHoje ? 'text-orange-400' : 'text-slate-400'}`} />
          <span className="text-slate-400">Prazo</span>
          <span className={`font-semibold ${atrasada ? 'text-red-600' : venceHoje ? 'text-orange-500' : 'text-slate-700'}`}>
            {prazoFormatado}
          </span>
        </div>
      </div>

      {/* ── LINHA 6: Responsáveis + Status ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Responsáveis</span>
          {responsaveisNomes.length > 0 ? (
            <div className="flex items-center -space-x-2">
              {responsaveisNomes.slice(0, 4).map((nome, idx) => (
                <Avatar key={idx} className="h-7 w-7 border-2 border-white" title={nome}>
                  <AvatarImage src={responsaveisFotos[idx]} alt={nome} />
                  <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-400 to-purple-500 text-white font-bold">
                    {getInitials(nome)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {responsaveisNomes.length > 4 && (
                <div className="h-7 w-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] text-slate-600 font-bold">
                  +{responsaveisNomes.length - 4}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-300 italic">—</span>
          )}
        </div>

        {/* Status prazo (canto direito) */}
        <span className={`text-xs ${prazoRodapeLabel.cls}`}>
          {prazoRodapeLabel.label}
        </span>
      </div>
    </div>
  );
}
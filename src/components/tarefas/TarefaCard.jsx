import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal, Calendar, CheckSquare, User,
  Clock, Briefcase, MapPin, Users, Plus
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInDays } from 'date-fns';

/* ─── PRIORIDADE ─── */
const prioridadeCfg = {
  urgente: { label: 'URGENTE', dot: 'bg-red-500',    header: 'bg-red-600',    badge: 'bg-white text-red-600 border-white' },
  alta:    { label: 'ALTA',    dot: 'bg-orange-500', header: 'bg-orange-500', badge: 'bg-white text-orange-600 border-white' },
  media:   { label: 'MÉDIA',   dot: 'bg-yellow-400', header: 'bg-yellow-500', badge: 'bg-white text-yellow-700 border-white' },
  baixa:   { label: 'BAIXA',   dot: 'bg-green-500',  header: 'bg-green-600',  badge: 'bg-white text-green-700 border-white' },
};

/* ─── PENDÊNCIA ─── */
const pendenciaCfg = {
  cliente:        { label: 'Aguardando Cliente',        cor: 'text-blue-700',   icon: Users },
  banco:          { label: 'Aguardando Banco',          cor: 'text-indigo-700', icon: Users },
  administradora: { label: 'Aguardando Administradora', cor: 'text-purple-700', icon: Users },
  seguradora:     { label: 'Aguardando Seguradora',     cor: 'text-cyan-700',   icon: Users },
  detran:         { label: 'Aguardando Detran',         cor: 'text-red-700',    icon: Users },
  cartorio:       { label: 'Aguardando Cartório',       cor: 'text-violet-700', icon: Users },
  parceiro:       { label: 'Aguardando Parceiro',       cor: 'text-teal-700',   icon: Users },
  equipe_interna: { label: 'Aguardando Equipe',         cor: 'text-blue-700',   icon: Users },
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function TarefaCard({ tarefa, onEdit, onDelete, onVerDetalhes }) {
  const finalizado = tarefa.status === 'concluido' || tarefa.status === 'arquivado';
  const prazoDate = tarefa.data_conclusao_prevista ? new Date(tarefa.data_conclusao_prevista + 'T23:59:59') : null;
  const diasPrazo = prazoDate ? differenceInDays(prazoDate, new Date()) : null;
  const atrasada  = !finalizado && diasPrazo !== null && diasPrazo < 0;
  const venceHoje = !finalizado && diasPrazo === 0;

  // Checklist
  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const checkTotal = checklist.length;
  const checkDone  = checklist.filter(i => i.checked).length;

  // Responsáveis
  let respNomes = [];
  let respFotos = [];
  try { respNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
  try { respFotos = tarefa.responsaveis_fotos ? JSON.parse(tarefa.responsaveis_fotos) : []; } catch {}
  if (respNomes.length === 0 && tarefa.responsavel_principal_nome) {
    respNomes = [tarefa.responsavel_principal_nome];
  }

  const pCfg  = prioridadeCfg[tarefa.prioridade] || prioridadeCfg.media;
  const pend  = tarefa.pendencia_com ? pendenciaCfg[tarefa.pendencia_com] : null;

  // Status pill (vence hoje / atrasada / sem prazo)
  const statusPill = (() => {
    if (finalizado) return null;
    if (atrasada)   return { label: `Atrasada ${Math.abs(diasPrazo)}d`, cls: 'border-red-400 text-red-600 bg-red-50' };
    if (venceHoje)  return { label: 'Vence hoje', cls: 'border-orange-400 text-orange-600 bg-orange-50' };
    return null;
  })();

  const prazoStr  = tarefa.data_conclusao_prevista
    ? format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yy')
    : '-';
  const inicioStr = tarefa.data_cadastro
    ? format(new Date(tarefa.data_cadastro + 'T12:00:00'), 'dd/MM/yy')
    : (tarefa.created_date ? format(new Date(tarefa.created_date), 'dd/MM/yy') : '-');

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-slate-200"
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      {/* ══ HEADER COLORIDO ══ */}
      <div className={`${pCfg.header} px-4 py-3 flex items-start justify-between gap-2`}>
        <h4 className="text-white font-bold text-sm leading-snug uppercase flex-1 line-clamp-3">
          {tarefa.titulo}
        </h4>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${pCfg.badge}`}>
            <span className={`w-2 h-2 rounded-full ${pCfg.dot}`} />
            {pCfg.label}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20">
                <MoreHorizontal className="w-4 h-4" />
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

      {/* ══ CORPO ══ */}
      <div className="px-4 py-3 space-y-3">

        {/* Cliente */}
        {tarefa.cliente_nome && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-sm font-bold text-slate-800 uppercase truncate">{tarefa.cliente_nome}</span>
          </div>
        )}

        {/* Setor */}
        {tarefa.setor_nome && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50">
            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
            {tarefa.setor_nome}
          </span>
        )}

        {/* Subsetor */}
        {(tarefa.subsetor_nome || tarefa.tipo_nome) && (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 bg-blue-50 w-full">
            <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            {tarefa.subsetor_nome || tarefa.tipo_nome}
          </span>
        )}

        {/* Status prazo + Pendência */}
        {(statusPill || pend) && (
          <div className="flex items-center gap-3 flex-wrap">
            {statusPill && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${statusPill.cls}`}>
                <Clock className="w-3.5 h-3.5" />
                {statusPill.label}
              </span>
            )}
            {pend && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${pend.cor}`}>
                <Users className="w-3.5 h-3.5" />
                {pend.label}
              </span>
            )}
          </div>
        )}

        {/* ── DIVISOR ── */}
        <hr className="border-slate-100" />

        {/* Grid Cadastro / Vencimento / Checklist */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>Cadastro</span>
            </div>
            <span className="font-semibold text-slate-700 text-sm">{inicioStr}</span>
          </div>

          <div className="flex flex-col gap-0.5 border-l border-slate-100 pl-2">
            <div className={`flex items-center gap-1 ${atrasada ? 'text-red-400' : venceHoje ? 'text-orange-400' : 'text-slate-400'}`}>
              <Clock className="w-3.5 h-3.5" />
              <span>Vencimento</span>
            </div>
            <span className={`font-bold text-sm ${atrasada ? 'text-red-500' : venceHoje ? 'text-orange-500' : 'text-slate-700'}`}>
              {prazoStr}
            </span>
          </div>

          {checkTotal > 0 && (
            <div className="flex flex-col gap-0.5 border-l border-slate-100 pl-2">
              <div className="flex items-center gap-1 text-slate-400">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Checklist</span>
              </div>
              <span className={`font-bold text-sm ${checkDone === checkTotal ? 'text-green-500' : 'text-blue-500'}`}>
                {checkDone}/{checkTotal}
              </span>
            </div>
          )}
        </div>

        {/* ── DIVISOR ── */}
        <hr className="border-slate-100" />

        {/* Responsáveis */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 flex-shrink-0">Responsáveis</span>
          <div className="flex items-center -space-x-1.5">
            {respNomes.slice(0, 4).map((nome, idx) => (
              <Avatar key={idx} className="h-7 w-7 border-2 border-white" title={nome}>
                <AvatarImage src={respFotos[idx]} alt={nome} />
                <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-400 to-purple-500 text-white font-bold">
                  {getInitials(nome)}
                </AvatarFallback>
              </Avatar>
            ))}
            {respNomes.length > 4 && (
              <div className="h-7 w-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[9px] text-slate-600 font-bold">
                +{respNomes.length - 4}
              </div>
            )}
            {respNomes.length === 0 && (
              <div className="h-7 w-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center">
                <Plus className="w-3 h-3 text-slate-400" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
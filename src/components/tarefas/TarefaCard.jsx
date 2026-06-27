import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal, Calendar, CheckSquare, User,
  Clock, Briefcase, MapPin, Users, Plus, Star, Paperclip
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInDays } from 'date-fns';

/* ─── PRIORIDADE ─── */
const prioridadeCfg = {
  urgente: { label: 'URGENTE',  badgeBg: 'bg-red-50',    badgeText: 'text-red-600',    borderTop: 'border-t-red-500',    iconColor: 'text-red-500' },
  alta:    { label: 'ALTA',     badgeBg: 'bg-orange-50',  badgeText: 'text-orange-600', borderTop: 'border-t-orange-500', iconColor: 'text-orange-500' },
  media:   { label: 'MÉDIA',    badgeBg: 'bg-yellow-50',  badgeText: 'text-yellow-700', borderTop: 'border-t-yellow-400', iconColor: 'text-yellow-500' },
  baixa:   { label: 'BAIXA',    badgeBg: 'bg-green-50',   badgeText: 'text-green-700',  borderTop: 'border-t-green-500',  iconColor: 'text-green-500' },
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

  // Anexos
  let anexos = [];
  try { anexos = tarefa.anexos ? JSON.parse(tarefa.anexos) : []; } catch {}

  // Responsáveis
  let respNomes = [];
  let respFotos = [];
  try { respNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
  try { respFotos = tarefa.responsaveis_fotos ? JSON.parse(tarefa.responsaveis_fotos) : []; } catch {}
  if (respNomes.length === 0 && tarefa.responsavel_principal_nome) {
    respNomes = [tarefa.responsavel_principal_nome];
  }

  const pCfg = prioridadeCfg[tarefa.prioridade] || prioridadeCfg.media;
  const pend = tarefa.pendencia_com ? pendenciaCfg[tarefa.pendencia_com] : null;

  // Status pill
  const statusPill = (() => {
    if (finalizado) return null;
    if (atrasada)   return { label: `Atrasada ${Math.abs(diasPrazo)} ${Math.abs(diasPrazo) === 1 ? 'dia' : 'dias'}`, cls: 'text-red-500' };
    if (venceHoje)  return { label: 'Vence hoje', cls: 'text-orange-500' };
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
      className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-slate-200 border-t-4 ${pCfg.borderTop}`}
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      {/* ══ TOPO: badge prioridade + menu ══ */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${pCfg.badgeBg} ${pCfg.badgeText}`}>
          <Star className={`w-3 h-3 fill-current ${pCfg.iconColor}`} />
          {pCfg.label}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700">
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

      {/* ══ TÍTULO ══ */}
      <div className="px-4 pb-3">
        <h4 className="text-slate-900 font-extrabold text-base leading-snug uppercase line-clamp-3">
          {tarefa.titulo}
        </h4>
      </div>

      {/* ══ CORPO ══ */}
      <div className="px-4 pb-3 space-y-2.5">

        {/* Cliente + avatares */}
        {tarefa.cliente_nome && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-800 uppercase truncate">{tarefa.cliente_nome}</span>
            </div>
            {/* Avatares dos responsáveis ao lado do cliente */}
            <div className="flex items-center -space-x-1.5 flex-shrink-0">
              {respNomes.slice(0, 3).map((nome, idx) => (
                <Avatar key={idx} className="h-6 w-6 border-2 border-white" title={nome}>
                  <AvatarImage src={respFotos[idx]} alt={nome} />
                  <AvatarFallback className="text-[9px] bg-gradient-to-br from-blue-400 to-purple-500 text-white font-bold">
                    {getInitials(nome)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {respNomes.length > 3 && (
                <div className="h-6 w-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[9px] text-slate-600 font-bold">
                  +{respNomes.length - 3}
                </div>
              )}
              {respNomes.length === 0 && (
                <div className="h-6 w-6 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center">
                  <Plus className="w-3 h-3 text-slate-400" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Setor */}
        {tarefa.setor_nome && (
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-sm text-slate-600 truncate">{tarefa.setor_nome}</span>
          </div>
        )}

        {/* Subsetor */}
        {(tarefa.subsetor_nome || tarefa.tipo_nome) && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-sm text-slate-600 truncate">{tarefa.subsetor_nome || tarefa.tipo_nome}</span>
          </div>
        )}

        {/* Status prazo + Pendência */}
        {(statusPill || pend) && (
          <div className="flex flex-col gap-1.5">
            {statusPill && (
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 flex-shrink-0 ${statusPill.cls}`} />
                <span className={`text-sm font-semibold ${statusPill.cls}`}>{statusPill.label}</span>
              </div>
            )}
            {pend && (
              <div className="flex items-center gap-2">
                <Users className={`w-4 h-4 flex-shrink-0 ${pend.cor}`} />
                <span className={`text-sm font-semibold ${pend.cor}`}>{pend.label}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ DIVISOR ══ */}
      <hr className="border-slate-100 mx-4" />

      {/* ══ DATAS ══ */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-0.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Cadastro</span>
          </div>
          <span className="font-bold text-slate-800 text-sm">{inicioStr}</span>
        </div>
        <div>
          <div className={`flex items-center gap-1 text-xs mb-0.5 ${atrasada ? 'text-red-400' : venceHoje ? 'text-orange-400' : 'text-slate-400'}`}>
            <Clock className="w-3.5 h-3.5" />
            <span>Vencimento</span>
          </div>
          <span className={`font-bold text-sm ${atrasada ? 'text-red-500' : venceHoje ? 'text-orange-500' : 'text-slate-800'}`}>
            {prazoStr}
          </span>
        </div>
      </div>

      {/* ══ FOOTER: checklist + anexos ══ */}
      {(checkTotal > 0 || anexos.length > 0) && (
        <>
          <hr className="border-slate-100 mx-4" />
          <div className="px-4 py-2.5 flex items-center gap-4">
            {checkTotal > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <CheckSquare className={`w-3.5 h-3.5 ${checkDone === checkTotal ? 'text-green-500' : 'text-slate-400'}`} />
                <span className="font-medium">Checklist</span>
                <span className={`font-bold ${checkDone === checkTotal ? 'text-green-600' : 'text-blue-600'}`}>{checkDone}/{checkTotal}</span>
              </div>
            )}
            {anexos.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium">Anexos</span>
                <span className="font-bold text-slate-700">{anexos.length}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
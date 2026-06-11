import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal, Calendar, CheckSquare, User,
  Clock, Briefcase, MapPin, AlertTriangle, CheckCircle2
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInDays } from 'date-fns';

/* ─── CONFIGS ─── */

const prioridadeCfg = {
  urgente: { label: 'URGENTE', dot: 'bg-red-500', badge: 'border-red-300 text-red-700 bg-red-50', border: 'border-l-4 border-l-red-500' },
  alta:    { label: 'ALTA',    dot: 'bg-orange-500', badge: 'border-orange-300 text-orange-700 bg-orange-50', border: 'border-l-4 border-l-orange-500' },
  media:   { label: 'MÉDIA',   dot: 'bg-yellow-500', badge: 'border-yellow-300 text-yellow-700 bg-yellow-50', border: 'border-l-4 border-l-yellow-500' },
  baixa:   { label: 'BAIXA',   dot: 'bg-green-500',  badge: 'border-green-300 text-green-700 bg-green-50',  border: 'border-l-4 border-l-green-500' },
};

const pendenciaCfg = {
  cliente:         { label: 'Aguardando Cliente',        cor: '#f59e0b', bg: '#fef3c7' },
  banco:           { label: 'Aguardando Banco',          cor: '#6366f1', bg: '#e0e7ff' },
  administradora:  { label: 'Aguardando Administradora', cor: '#8b5cf6', bg: '#ede9fe' },
  seguradora:      { label: 'Aguardando Seguradora',     cor: '#06b6d4', bg: '#cffafe' },
  detran:          { label: 'Aguardando Detran',         cor: '#ef4444', bg: '#fecaca' },
  cartorio:        { label: 'Aguardando Cartório',       cor: '#a855f7', bg: '#f3e8ff' },
  parceiro:        { label: 'Aguardando Parceiro',       cor: '#14b8a6', bg: '#ccfbf1' },
  equipe_interna:  { label: 'Aguardando Equipe Interna', cor: '#3b82f6', bg: '#dbeafe' },
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function IdadeLabel({ createdAt }) {
  if (!createdAt) return null;
  const dias = differenceInDays(new Date(), new Date(createdAt));
  if (dias === 0) return <span className="text-[10px] text-slate-400">Hoje</span>;
  if (dias === 1) return <span className="text-[10px] text-slate-400">1 dia</span>;
  if (dias >= 30) return <span className="text-[10px] text-slate-400">{Math.round(dias/30)} {Math.round(dias/30)===1?'mês':'meses'}</span>;
  return <span className="text-[10px] text-slate-400">{dias} dias</span>;
}

/* ─── COMPONENTE ─── */

export default function TarefaCard({ tarefa, onEdit, onDelete, onVerDetalhes }) {
  const hoje = format(new Date(), 'yyyy-MM-dd');

  const finalizado = tarefa.status === 'concluido' || tarefa.status === 'arquivado';
  const prazoDate = tarefa.data_conclusao_prevista ? new Date(tarefa.data_conclusao_prevista + 'T23:59:59') : null;
  const agora = new Date();
  const diasPrazo = prazoDate ? differenceInDays(prazoDate, agora) : null;
  const atrasada = !finalizado && diasPrazo !== null && diasPrazo < 0;
  const venceHoje = !finalizado && diasPrazo === 0;
  const prazoCurto = !finalizado && diasPrazo !== null && diasPrazo >= 0 && diasPrazo <= 3;

  // Checklist
  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const checkTotal = checklist.length;
  const checkDone = checklist.filter(i => i.checked).length;

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

  // Status-prazo pill
  const statusPill = (() => {
    if (finalizado) return { ico: CheckCircle2, label: 'Concluída',      bg: 'bg-emerald-50 border-emerald-300 text-emerald-700' };
    if (atrasada)  return { ico: AlertTriangle, label: `Atrasada ${Math.abs(diasPrazo)}d`, bg: 'bg-red-50 border-red-400 text-red-700' };
    if (venceHoje) return { ico: Clock,         label: 'Vence hoje',    bg: 'bg-orange-50 border-orange-400 text-orange-700' };
    if (prazoCurto)return { ico: Clock,         label: `${diasPrazo}d restantes`, bg: 'bg-yellow-50 border-yellow-400 text-yellow-700' };
    return null;
  })();

  const prazoLabel = (() => {
    if (finalizado) return { text: 'Concluída', cls: 'text-emerald-500' };
    if (atrasada)   return { text: 'Atrasada',  cls: 'text-red-500' };
    if (venceHoje)  return { text: 'Vence hoje',cls: 'text-orange-500' };
    return { text: 'No prazo', cls: 'text-green-500' };
  })();

  const prazoStr = tarefa.data_conclusao_prevista
    ? format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yy')
    : '-';
  const inicioStr = tarefa.data_cadastro
    ? format(new Date(tarefa.data_cadastro + 'T12:00:00'), 'dd/MM/yy')
    : (tarefa.created_date ? format(new Date(tarefa.created_date), 'dd/MM/yy') : '-');

  return (
    <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer ${!finalizado ? pCfg.border : ''}`}
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      <div className="p-3.5 space-y-2.5">
        {/* ── LINHA 1: TÍTULO + BADGE + MENU ── */}
        <div className="flex items-start justify-between gap-2">
          <h4 className={`font-semibold text-sm leading-snug flex-1 line-clamp-2 ${finalizado ? 'text-slate-400' : 'text-slate-800'}`}>
            {tarefa.titulo}
          </h4>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${pCfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
              {pCfg.label}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                  <MoreHorizontal className="w-3.5 h-3.5" />
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

        {/* ── CLIENTE ── */}
        {tarefa.cliente_nome && (
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-600 truncate">{tarefa.cliente_nome}</span>
          </div>
        )}

        {/* ── TAGS SETOR / SUBSETOR ── */}
        {(tarefa.setor_nome || tarefa.subsetor_nome || tarefa.tipo_nome) && (
          <div className="flex flex-wrap gap-1.5">
            {tarefa.setor_nome && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 border border-slate-200 rounded-md px-2 py-0.5 bg-slate-50">
                <Briefcase className="w-3 h-3 text-slate-400" />
                {tarefa.setor_nome}
              </span>
            )}
            {(tarefa.subsetor_nome || tarefa.tipo_nome) && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 border border-slate-200 rounded-md px-2 py-0.5 bg-blue-50/50">
                <MapPin className="w-3 h-3 text-blue-400" />
                {tarefa.subsetor_nome || tarefa.tipo_nome}
              </span>
            )}
          </div>
        )}

        {/* ── PENDÊNCIA COM ── */}
        {pend && (
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: pend.bg, color: pend.cor }}
          >
            <Clock className="w-3.5 h-3.5" />
            {pend.label}
          </div>
        )}

        {/* ── PILLS: APENAS CHECKLIST (status de prazo aparece só no rodapé) ── */}
        {checkTotal > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
              <CheckSquare className="w-3 h-3 text-slate-400" />
              {checkDone}/{checkTotal} concluídas
            </span>
          </div>
        )}

        {/* ── DIVISOR ── */}
        <hr className="border-slate-100" />

        {/* ── DATAS ── */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600 font-medium">{inicioStr}</span>
          </div>
          <span className="text-slate-200 text-base">|</span>
          <div className="flex items-center gap-1.5">
            <Clock className={`w-4 h-4 ${atrasada ? 'text-red-400' : venceHoje ? 'text-orange-400' : 'text-slate-400'}`} />
            <span className={`font-semibold ${atrasada ? 'text-red-500' : venceHoje ? 'text-orange-500' : 'text-slate-600'}`}>
              {prazoStr}
            </span>
          </div>
        </div>

        {/* ── RODAPÉ: RESPONSÁVEIS + STATUS ── */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Resp.</span>
            {respNomes.length > 0 ? (
              <div className="flex items-center -space-x-1.5">
                {respNomes.slice(0, 4).map((nome, idx) => (
                  <Avatar key={idx} className="h-6 w-6 border-2 border-white" title={nome}>
                    <AvatarImage src={respFotos[idx]} alt={nome} />
                    <AvatarFallback className="text-[9px] bg-gradient-to-br from-blue-400 to-purple-500 text-white font-bold">
                      {getInitials(nome)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {respNomes.length > 4 && (
                  <div className="h-6 w-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[9px] text-slate-600 font-bold">
                    +{respNomes.length - 4}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[10px] text-slate-300">—</span>
            )}
          </div>
          <span className={`text-[11px] font-semibold ${prazoLabel.cls}`}>{prazoLabel.text}</span>
        </div>
      </div>
    </div>
  );
}
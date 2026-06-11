import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal, Calendar, CheckSquare, User,
  Building2, Shield, AlertTriangle, Clock, ArrowRightCircle,
  Briefcase, MapPin
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInDays } from 'date-fns';

/* ═══════════════════════════════════════
   CONFIGURAÇÕES
   ═══════════════════════════════════════ */

const prioridadeCfg = {
  urgente: { label: 'URGENTE',  emoji: '🔴', border: 'border-red-500',   bg: 'bg-red-50',   text: 'text-red-700',   badge: 'bg-red-600 text-white' },
  alta:    { label: 'ALTA',     emoji: '🟠', border: 'border-orange-400', bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-500 text-white' },
  media:   { label: 'MÉDIA',    emoji: '🟡', border: 'border-yellow-400', bg: 'bg-yellow-50',  text: 'text-yellow-700', badge: 'bg-yellow-500 text-white' },
  baixa:   { label: 'BAIXA',    emoji: '🟢', border: 'border-green-400',  bg: 'bg-green-50',   text: 'text-green-700',  badge: 'bg-green-500 text-white' },
};

const pendenciaCfg = {
  cliente:          { label: 'Aguardando Cliente',          cor: '#f59e0b', icone: User },
  banco:            { label: 'Aguardando Banco',            cor: '#6366f1', icone: Building2 },
  administradora:   { label: 'Aguardando Administradora',   cor: '#8b5cf6', icone: Building2 },
  seguradora:       { label: 'Aguardando Seguradora',       cor: '#06b6d4', icone: Shield },
  detran:           { label: 'Aguardando Detran',           cor: '#ef4444', icone: MapPin },
  cartorio:         { label: 'Aguardando Cartório',          cor: '#a855f7', icone: Briefcase },
  parceiro:         { label: 'Aguardando Parceiro',         cor: '#14b8a6', icone: ArrowRightCircle },
  equipe_interna:   { label: 'Aguardando Equipe Interna',   cor: '#3b82f6', icone: User },
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

/* ═══════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════ */

export default function TarefaCard({ tarefa, onEdit, onDelete, onVerDetalhes, statusList }) {
  const hoje = format(new Date(), 'yyyy-MM-dd');

  const finalizado = tarefa.status === 'concluido' || tarefa.status === 'arquivado';
  const ativo = !finalizado;
  const prazoDate = tarefa.data_conclusao_prevista ? new Date(tarefa.data_conclusao_prevista + 'T23:59:59') : null;
  const agora = new Date();
  const diasPrazo = prazoDate ? differenceInDays(prazoDate, agora) : null;
  const atrasada = ativo && diasPrazo !== null && diasPrazo < 0;
  const venceHoje = ativo && diasPrazo === 0;

  const creatDate = tarefa.data_cadastro ? new Date(tarefa.data_cadastro + 'T12:00:00') : null;
  const diasCriado = creatDate ? differenceInDays(agora, creatDate) : null;

  // Checklist
  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const checkTotal = checklist.length;
  const checkDone = checklist.filter(i => i.checked).length;
  const checkPct = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;

  // Responsáveis
  let responsaveisNomes = [];
  let responsaveisFotos = [];
  try { responsaveisNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
  try { responsaveisFotos = tarefa.responsaveis_fotos ? JSON.parse(tarefa.responsaveis_fotos) : []; } catch {}

  const pCfg = prioridadeCfg[tarefa.prioridade] || prioridadeCfg.media;
  const pend = tarefa.pendencia_com ? pendenciaCfg[tarefa.pendencia_com] : null;

  // Status principal
  const statusLabel = (() => {
    if (finalizado) return { label: 'Concluída', cor: 'bg-blue-500 text-white', icone: '✓' };
    if (atrasada) return { label: `Atrasada há ${Math.abs(diasPrazo)} dia${Math.abs(diasPrazo) > 1 ? 's' : ''}`, cor: 'bg-red-600 text-white', icone: '!' };
    if (venceHoje) return { label: 'Vence Hoje', cor: 'bg-amber-500 text-white', icone: '!' };
    if (diasPrazo !== null && diasPrazo <= 3) return { label: 'Prazo curto', cor: 'bg-amber-400 text-white', icone: '⏱' };
    return { label: 'Dentro do Prazo', cor: 'bg-green-500 text-white', icone: '✓' };
  })();

  // Alerta de atraso (rodapé)
  const alertaRodape = (() => {
    if (finalizado) return { label: 'Concluída', cor: 'text-green-600' };
    if (atrasada) return { label: `${Math.abs(diasPrazo)} dia${Math.abs(diasPrazo) > 1 ? 's' : ''} atrasada`, cor: 'text-red-600' };
    if (venceHoje) return { label: 'Vence hoje', cor: 'text-amber-600' };
    if (diasPrazo !== null && diasPrazo <= 3) return { label: `${diasPrazo}d restantes`, cor: 'text-amber-500' };
    return { label: 'Dentro do prazo', cor: 'text-green-600' };
  })();

  // Idade
  const idadeLabel = (() => {
    if (diasCriado === null) return null;
    if (diasCriado === 0) return 'Criada hoje';
    if (diasCriado === 1) return 'Criada há 1 dia';
    if (diasCriado >= 30) return `Criada há ${Math.round(diasCriado / 30)} ${Math.round(diasCriado / 30) === 1 ? 'mês' : 'meses'}`;
    return `Criada há ${diasCriado} dias`;
  })();

  return (
    <div
      className={`rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg border-2 ${
        atrasada ? 'bg-red-50/60 border-red-400' :
        venceHoje ? 'bg-amber-50/60 border-amber-400' :
        finalizado ? 'bg-slate-50/60 border-slate-200' :
        pCfg.bg + ' ' + pCfg.border
      }`}
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      {/* ═══ CABEÇALHO: Título + Prioridade + Menu ═══ */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="font-bold text-slate-900 text-sm leading-snug flex-1 line-clamp-2">
          {tarefa.titulo}
        </h4>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-xs font-extrabold px-2 py-0.5 rounded ${pCfg.badge}`}>
            {pCfg.emoji} {pCfg.label}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 -mt-0.5 hover:bg-slate-200">
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

      {/* ═══ CLIENTE ═══ */}
      {tarefa.cliente_nome && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-700 truncate">{tarefa.cliente_nome}</span>
        </div>
      )}

      {/* ═══ SETOR E TIPO (TAGS) ═══ */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tarefa.setor_nome && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 border-slate-200 font-medium gap-1">
            <Briefcase className="w-3 h-3" /> {tarefa.setor_nome}
          </Badge>
        )}
        {(tarefa.subsetor_nome || tarefa.tipo_nome) && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 border-blue-200 font-medium gap-1">
            <MapPin className="w-3 h-3" /> {tarefa.subsetor_nome || tarefa.tipo_nome}
          </Badge>
        )}
      </div>

      {/* ═══ STATUS PRINCIPAL (DESTAQUE) ═══ */}
      <div className={`mb-3 px-3 py-2 rounded-xl ${statusLabel.cor} flex items-center gap-2`}>
        <span className="text-lg font-extrabold">{statusLabel.icone === '!' ? <AlertTriangle className="w-5 h-5" /> : statusLabel.icone}</span>
        <span className="text-sm font-extrabold tracking-wide uppercase">{statusLabel.label}</span>
      </div>

      {/* ═══ PENDÊNCIA COM ═══ */}
      {pend && (
        <div className="mb-3 px-3 py-1.5 rounded-lg flex items-center gap-2" style={{ backgroundColor: pend.cor + '18', borderLeft: `4px solid ${pend.cor}` }}>
          <pend.icone className="w-4 h-4 flex-shrink-0" style={{ color: pend.cor }} />
          <span className="text-xs font-semibold" style={{ color: pend.cor }}>{pend.label}</span>
        </div>
      )}

      {/* ═══ CHECKLIST ═══ */}
      {checkTotal > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5" /> Checklist
            </span>
            <span className="text-xs font-bold text-slate-600">
              {checkDone} de {checkTotal} concluído{checkDone !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${checkPct === 100 ? 'bg-green-500' : checkPct > 0 ? 'bg-blue-500' : 'bg-slate-300'}`}
              style={{ width: `${Math.max(checkPct, 4)}%` }}
            />
          </div>
        </div>
      )}

      {/* ═══ DATAS ═══ */}
      <div className="space-y-1 mb-3 text-xs">
        {tarefa.data_cadastro && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>Início:</span>
            <span className="font-medium text-slate-600">{format(new Date(tarefa.data_cadastro + 'T12:00:00'), 'dd/MM/yyyy')}</span>
          </div>
        )}
        {tarefa.data_conclusao_prevista && (
          <div className={`flex items-center gap-1.5 ${atrasada ? 'text-red-600' : venceHoje ? 'text-amber-600' : 'text-slate-400'}`}>
            <Clock className={`w-3.5 h-3.5 ${atrasada ? 'text-red-500' : venceHoje ? 'text-amber-500' : ''}`} />
            <span>Prazo:</span>
            <span className={`font-bold ${atrasada ? 'text-red-700' : venceHoje ? 'text-amber-700' : 'text-slate-600'}`}>
              {format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yyyy')}
            </span>
          </div>
        )}
      </div>

      {/* ═══ RESPONSÁVEIS ═══ */}
      {responsaveisNomes.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Responsáveis</span>
          <div className="flex items-center -space-x-1.5" title={responsaveisNomes.join(', ')}>
            {responsaveisNomes.slice(0, 5).map((nome, idx) => (
              <Avatar key={idx} className="h-7 w-7 border-2 border-white" title={nome}>
                <AvatarImage src={responsaveisFotos[idx]} alt={nome} />
                <AvatarFallback className="text-xs bg-gradient-to-br from-blue-400 to-purple-500 text-white font-semibold">
                  {getInitials(nome)}
                </AvatarFallback>
              </Avatar>
            ))}
            {responsaveisNomes.length > 5 && (
              <div className="h-7 w-7 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-xs text-slate-700 font-bold">
                +{responsaveisNomes.length - 5}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ RODAPÉ: Alerta + Idade ═══ */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60 mt-1">
        <div className={`flex items-center gap-1 text-xs font-extrabold ${alertaRodape.cor}`}>
          {atrasada ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : venceHoje ? (
            <Clock className="w-3.5 h-3.5" />
          ) : (
            <CheckSquare className="w-3.5 h-3.5" />
          )}
          {alertaRodape.label}
        </div>
        {idadeLabel && (
          <span className="text-xs text-slate-400">{idadeLabel}</span>
        )}
      </div>
    </div>
  );
}
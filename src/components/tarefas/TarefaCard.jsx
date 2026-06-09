import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Calendar, CheckSquare, MessageCircle, User, Briefcase } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, differenceInDays, differenceInHours } from 'date-fns';

const prioridadeCfg = {
  urgente: { label: 'Urgente', className: 'bg-red-600 text-white' },
  alta:    { label: 'Alta',    className: 'bg-red-100 text-red-700' },
  media:   { label: 'Média',   className: 'bg-yellow-100 text-yellow-700' },
  baixa:   { label: 'Baixa',   className: 'bg-green-100 text-green-700' },
};

const setorLabel = {
  consorcio: 'Consórcio',
  emprestimo: 'Empréstimo',
  financiamento: 'Financiamento',
  administrativo: 'Administrativo',
  cobranca: 'Cobrança',
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

export default function TarefaCard({ tarefa, onEdit, onDelete, onVerDetalhes, statusList }) {
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const atrasada = tarefa.data_conclusao_prevista && tarefa.data_conclusao_prevista < hoje && tarefa.status !== 'concluido' && tarefa.status !== 'arquivado';
  const venceHoje = tarefa.data_conclusao_prevista === hoje && tarefa.status !== 'concluido' && tarefa.status !== 'arquivado';

  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const checkTotal = checklist.length;
  const checkDone = checklist.filter(i => i.checked).length;
  const checkPct = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;

  let responsaveisNomes = [];
  let responsaveisFotos = [];
  try { responsaveisNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
  try { responsaveisFotos = tarefa.responsaveis_fotos ? JSON.parse(tarefa.responsaveis_fotos) : []; } catch {}

  const pCfg = prioridadeCfg[tarefa.prioridade] || prioridadeCfg.media;

  // Tempo restante até o prazo
  function tempoRestante() {
    if (!tarefa.data_conclusao_prevista) return null;
    if (tarefa.status === 'concluido' || tarefa.status === 'arquivado') return null;
    const prazo = new Date(tarefa.data_conclusao_prevista + 'T23:59:59');
    const agora = new Date();
    const dias = differenceInDays(prazo, agora);
    if (dias < 0) return { label: `${Math.abs(dias)}d atrasada`, cor: 'text-red-600' };
    if (dias === 0) return { label: 'Vence hoje', cor: 'text-amber-600' };
    if (dias === 1) return { label: 'Vence amanhã', cor: 'text-amber-500' };
    if (dias <= 7) return { label: `${dias}d restantes`, cor: 'text-amber-500' };
    return { label: `${dias}d restantes`, cor: 'text-slate-400' };
  }
  const tempo = tempoRestante();

  return (
    <div
      className={`rounded-xl p-3 cursor-pointer transition-all hover:shadow-md border ${
        atrasada ? 'bg-red-50 border-red-300' :
        venceHoje ? 'bg-amber-50 border-amber-300' :
        'bg-white border-slate-200'
      }`}
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-semibold text-slate-900 text-sm leading-snug flex-1">{tarefa.titulo}</h4>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge className={`text-xs px-1.5 py-0 ${pCfg.className}`}>{pCfg.label}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 -mt-0.5">
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

      {/* Cliente */}
      {tarefa.cliente_nome && (
        <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
          <User className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{tarefa.cliente_nome}</span>
        </p>
      )}

      {/* Setor e Subsetor */}
      <div className="flex flex-wrap gap-1 mb-2 items-center">
        {tarefa.setor_nome && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200">
            {tarefa.setor_nome}
          </Badge>
        )}
        {tarefa.subsetor_nome && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">
            {tarefa.subsetor_nome}
          </Badge>
        )}
      </div>

      {/* Badges de status */}
      <div className="flex flex-wrap gap-1 mb-2">
        {atrasada && <Badge className="text-xs px-1.5 py-0 bg-red-600 text-white">⚠ Atrasada</Badge>}
        {venceHoje && !atrasada && <Badge className="text-xs px-1.5 py-0 bg-amber-500 text-white">Vence hoje</Badge>}
      </div>

      {/* Checklist progress */}
      {checkTotal > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <CheckSquare className="w-3 h-3" /> {checkDone}/{checkTotal}
            </span>
            <span className="text-xs text-slate-400">{checkPct}%</span>
          </div>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${checkPct}%` }} />
          </div>
        </div>
      )}

      {/* Datas: início e prazo */}
      {(tarefa.data_cadastro || tarefa.data_conclusao_prevista) && (
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
          {tarefa.data_cadastro && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Início: {format(new Date(tarefa.data_cadastro + 'T12:00:00'), 'dd/MM/yy')}
            </span>
          )}
          {tarefa.data_conclusao_prevista && (
            <span className={`flex items-center gap-1 ${atrasada ? 'text-red-600 font-semibold' : venceHoje ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
              <Calendar className="w-3 h-3" />
              Prazo: {format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yy')}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1 -space-x-2">
          {responsaveisNomes.slice(0, 4).map((nome, idx) => (
            <Avatar key={idx} className="h-6 w-6 border-2 border-white" title={nome}>
              <AvatarImage src={responsaveisFotos[idx]} alt={nome} />
              <AvatarFallback className="text-xs bg-slate-200 text-slate-700">{getInitials(nome)}</AvatarFallback>
            </Avatar>
          ))}
          {responsaveisNomes.length > 4 && (
            <div className="h-6 w-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs text-slate-600 font-medium">
              +{responsaveisNomes.length - 4}
            </div>
          )}
        </div>
        {tempo && (
          <span className={`text-xs font-semibold ${tempo.cor}`}>
            ⏱ {tempo.label}
          </span>
        )}
      </div>
    </div>
  );
}
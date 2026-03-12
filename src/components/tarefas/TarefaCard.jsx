import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Calendar, CheckSquare, MessageCircle, User } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

const prioridadeColors = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-yellow-100 text-yellow-700',
  baixa: 'bg-green-100 text-green-700',
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

export default function TarefaCard({ tarefa, onEdit, onDelete, onVerDetalhes, statusList }) {
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const atrasada = tarefa.data_conclusao_prevista && tarefa.data_conclusao_prevista < hoje && tarefa.status !== 'concluido' && tarefa.status !== 'arquivado';
  
  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const checkTotal = checklist.length;
  const checkDone = checklist.filter(i => i.checked).length;

  let responsaveisNomes = [];
  let responsaveisFotos = [];
  try { responsaveisNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
  try { responsaveisFotos = tarefa.responsaveis_fotos ? JSON.parse(tarefa.responsaveis_fotos) : []; } catch {}

  const statusObj = statusList?.find(s => s.slug === tarefa.status);
  const statusNome = statusObj?.nome || tarefa.status || 'A fazer';

  return (
    <Card
      className={`p-3 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-all ${atrasada ? 'bg-red-50 border-2 border-red-400' : 'bg-white border border-slate-200'}`}
      onDoubleClick={() => onVerDetalhes(tarefa)}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-slate-900 text-sm flex-1 pr-1">{tarefa.titulo}</h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onVerDetalhes(tarefa)}>Ver detalhes</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(tarefa)}>Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(tarefa)} className="text-red-600">Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {tarefa.cliente_nome && (
        <p className="text-xs text-slate-600 mb-1 flex items-center gap-1">
          <User className="w-3 h-3" /> {tarefa.cliente_nome}
        </p>
      )}

      <div className="flex items-center gap-1 mb-2">
        <Badge className={`text-xs px-1 py-0 ${prioridadeColors[tarefa.prioridade] || prioridadeColors.media}`}>
          {tarefa.prioridade || 'média'}
        </Badge>
        {atrasada && <Badge className="text-xs px-1 py-0 bg-red-600 text-white">Atrasada</Badge>}
      </div>

      <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2 text-slate-500">
          {tarefa.data_conclusao_prevista && (
            <span className={`flex items-center gap-1 ${atrasada ? 'text-red-600 font-semibold' : ''}`}>
              <Calendar className="w-3 h-3" />
              {format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yy')}
            </span>
          )}
          {checkTotal > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              {checkDone}/{checkTotal}
            </span>
          )}
        </div>
        <div className="flex items-center -space-x-2">
          {responsaveisNomes.slice(0, 3).map((nome, idx) => (
            <Avatar key={idx} className="h-6 w-6 border-2 border-white" title={nome}>
              <AvatarImage src={responsaveisFotos[idx]} alt={nome} />
              <AvatarFallback className="text-xs">{getInitials(nome)}</AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>
    </Card>
  );
}
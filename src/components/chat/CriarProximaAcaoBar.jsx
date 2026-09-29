import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, TrendingUp, ClipboardList } from 'lucide-react';

/**
 * Barra "Criar próxima ação" exibida logo abaixo da barra de ações do chat.
 * Reúne as duas ações de acompanhamento do cliente: lançar no Funil de Vendas
 * ou criar uma Tarefa vinculada à conversa.
 */
export default function CriarProximaAcaoBar({ onAdicionarFunil, onCriarTarefa, oportunidadeAtual }) {
  return (
    <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#ffeeba] bg-[#fff3cd] px-3 py-2 text-xs sm:text-sm font-medium text-[#856404] transition-colors hover:bg-[#fff8e1] active:bg-[#ffefc2]"
          >
            <Plus className="h-4 w-4" />
            Criar próxima ação
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="z-[200] w-64">
          <DropdownMenuItem onClick={() => onAdicionarFunil?.()}>
            <TrendingUp className="mr-2 h-4 w-4 text-[#23BE84]" />
            {oportunidadeAtual ? 'Atualizar no Funil de Vendas' : 'Adicionar ao Funil de Vendas'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCriarTarefa?.()}>
            <ClipboardList className="mr-2 h-4 w-4 text-emerald-600" />
            Criar tarefa para o cliente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
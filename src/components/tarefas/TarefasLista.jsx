import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, Pencil, Trash2 } from 'lucide-react';

const PRIORIDADE_CORES = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
};

export default function TarefasLista({ tarefas, statusList, onEdit, onDelete, onVerDetalhes }) {
  const hoje = format(new Date(), 'yyyy-MM-dd');

  const getStatus = (slug) => statusList.find(s => s.slug === slug);

  const formatarData = (data) => {
    if (!data) return '-';
    try { return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR }); } catch { return data; }
  };

  const isAtrasada = (tarefa) => {
    return tarefa.data_conclusao_prevista &&
      tarefa.data_conclusao_prevista < hoje &&
      tarefa.status !== 'concluido' &&
      tarefa.status !== 'arquivado';
  };

  if (tarefas.length === 0) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center text-slate-400 text-sm">
        Nenhuma tarefa encontrada
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Cliente</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Título</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Tipo</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Prioridade</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Responsável</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Prazo</th>
              <th className="text-center px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tarefas.map((tarefa, i) => {
              const status = getStatus(tarefa.status);
              const atrasada = isAtrasada(tarefa);
              return (
                <tr
                  key={tarefa.id}
                  className={`border-b last:border-0 hover:bg-slate-50 transition-colors cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}
                  onClick={() => onVerDetalhes(tarefa)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {tarefa.cliente_nome || '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-[220px]">
                    <p className="truncate font-medium">{tarefa.titulo}</p>
                    {tarefa.setor && <p className="text-xs text-slate-400 capitalize">{tarefa.setor}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {tarefa.tipo ? (
                      <span className="px-2 py-1 rounded-lg text-xs bg-blue-50 text-blue-700 font-medium capitalize">
                        {tarefa.tipo}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {status ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                        style={{ backgroundColor: status.cor }}
                      >
                        {status.nome}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">{tarefa.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {tarefa.prioridade ? (
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium capitalize ${PRIORIDADE_CORES[tarefa.prioridade] || 'bg-slate-100 text-slate-600'}`}>
                        {tarefa.prioridade}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {tarefa.responsavel_principal_nome || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-sm font-medium ${atrasada ? 'text-red-600' : 'text-slate-600'}`}>
                      {atrasada && <span className="mr-1">⚠️</span>}
                      {formatarData(tarefa.data_conclusao_prevista)}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onVerDetalhes(tarefa)} title="Ver detalhes">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(tarefa)} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(tarefa)} title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
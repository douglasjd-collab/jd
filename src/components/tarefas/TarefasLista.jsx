import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Pencil, Trash2, Clock, AlignLeft, History, ChevronRight } from 'lucide-react';

const PRIORIDADE_CORES = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-yellow-400 text-white',
  alta: 'bg-orange-500 text-white',
  urgente: 'bg-red-500 text-white',
};

const PRIORIDADE_LABEL = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

function Iniciais({ nome, size = 'sm' }) {
  const initials = (nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length];
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: status.cor }}
    >
      {status.nome}
    </span>
  );
}

export default function TarefasLista({ tarefas, statusList, onEdit, onDelete, onVerDetalhes }) {
  const [selecionada, setSelecionada] = useState(null);
  const hoje = format(new Date(), 'yyyy-MM-dd');

  const getStatus = (slug) => statusList.find(s => s.slug === slug);

  const formatarData = (data) => {
    if (!data) return '-';
    try { return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR }); } catch { return data; }
  };

  const isAtrasada = (tarefa) =>
    tarefa.data_conclusao_prevista &&
    tarefa.data_conclusao_prevista < hoje &&
    tarefa.status !== 'concluido' &&
    tarefa.status !== 'arquivado';

  const tarefaSel = selecionada ? tarefas.find(t => t.id === selecionada) : null;
  const statusSel = tarefaSel ? getStatus(tarefaSel.status) : null;

  if (tarefas.length === 0) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center text-slate-400 text-sm">
        Nenhuma tarefa encontrada
      </div>
    );
  }

  return (
    <div className="flex gap-0 bg-white rounded-2xl border shadow-sm overflow-hidden">
      {/* Tabela */}
      <div className={`flex-1 overflow-x-auto transition-all ${tarefaSel ? 'min-w-0' : ''}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Cliente</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Título</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Tipo</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Responsáveis</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Início</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Limite</th>
              <th className="text-center px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tarefas.map((tarefa) => {
              const status = getStatus(tarefa.status);
              const atrasada = isAtrasada(tarefa);
              const isSel = selecionada === tarefa.id;

              let responsaveisNomes = [];
              try { responsaveisNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
              if (responsaveisNomes.length === 0 && tarefa.responsavel_principal_nome) {
                responsaveisNomes = [tarefa.responsavel_principal_nome];
              }

              return (
                <tr
                  key={tarefa.id}
                  className={`border-b last:border-0 transition-colors cursor-pointer group ${isSel ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
                  onClick={() => setSelecionada(isSel ? null : tarefa.id)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {tarefa.cliente_nome || <span className="text-slate-400 italic text-xs">Interna</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-[200px]">
                    <p className="truncate font-medium">{tarefa.titulo}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {tarefa.tipo ? (
                      <span className="px-2 py-1 rounded-md text-xs bg-indigo-50 text-indigo-700 font-medium capitalize">
                        {tarefa.tipo}
                      </span>
                    ) : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {status ? <StatusBadge status={status} /> : <span className="text-slate-400 text-xs">{tarefa.status}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center -space-x-2">
                      {responsaveisNomes.slice(0, 3).map((nome, i) => (
                        <div key={i} className="ring-2 ring-white rounded-full" title={nome}>
                          <Iniciais nome={nome} size="sm" />
                        </div>
                      ))}
                      {responsaveisNomes.length > 3 && (
                        <div className="w-7 h-7 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-xs text-slate-600 font-semibold">
                          +{responsaveisNomes.length - 3}
                        </div>
                      )}
                      {responsaveisNomes.length === 0 && <span className="text-slate-300 text-xs">-</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">
                    {formatarData(tarefa.data_cadastro || tarefa.created_date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold ${atrasada ? 'text-red-500' : 'text-slate-500'}`}>
                      {formatarData(tarefa.data_conclusao_prevista)}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

      {/* Painel de Detalhes Lateral */}
      {tarefaSel && (
        <div className="w-80 flex-shrink-0 border-l bg-white flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
            <h3 className="font-bold text-slate-800 text-sm">Detalhes da Tarefa</h3>
            <button onClick={() => setSelecionada(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 p-5 space-y-5">
            {/* Título + responsável */}
            <div>
              <h2 className="font-bold text-slate-900 text-base leading-tight mb-3">{tarefaSel.titulo}</h2>
              {tarefaSel.responsavel_principal_nome && (
                <div className="flex items-center gap-2">
                  <Iniciais nome={tarefaSel.responsavel_principal_nome} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{tarefaSel.responsavel_principal_nome}</p>
                    {statusSel && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <span>{statusSel.nome}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Badges status + prioridade */}
            <div className="flex items-center gap-2 flex-wrap">
              {statusSel && <StatusBadge status={statusSel} />}
              {tarefaSel.prioridade && (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${PRIORIDADE_CORES[tarefaSel.prioridade] || 'bg-slate-100 text-slate-600'}`}>
                  {PRIORIDADE_LABEL[tarefaSel.prioridade] || tarefaSel.prioridade}
                </span>
              )}
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Início</p>
                <p className="text-sm font-medium text-slate-700">{formatarData(tarefaSel.data_cadastro || tarefaSel.created_date)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Prazo</p>
                <p className={`text-sm font-medium ${isAtrasada(tarefaSel) ? 'text-red-500' : 'text-slate-700'}`}>
                  {formatarData(tarefaSel.data_conclusao_prevista)}
                </p>
              </div>
            </div>

            {/* Descrição */}
            {tarefaSel.descricao && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlignLeft className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descrição</p>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{tarefaSel.descricao}</p>
              </div>
            )}

            {/* Cliente */}
            {tarefaSel.cliente_nome && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Cliente</p>
                <p className="text-sm font-medium text-slate-800">{tarefaSel.cliente_nome}</p>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                className="flex-1 bg-[#1e3a5f] hover:bg-[#162d4a] text-white"
                onClick={() => { onVerDetalhes(tarefaSel); }}
              >
                Ver completo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(tarefaSel)}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
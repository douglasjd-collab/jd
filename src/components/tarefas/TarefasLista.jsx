import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Pencil, Trash2, AlignLeft, Check, MessageSquarePlus, Send, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SelecionarStatusResponsaveisModal from './SelecionarStatusResponsaveisModal';
import TarefaDetalhesModal from './TarefaDetalhesModal.jsx';
import ResponsaveisModal from './ResponsaveisModal';
import SelecionarStatusModal from './SelecionarStatusModal';

const PRIORIDADE_CORES = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-yellow-400 text-white',
  alta: 'bg-orange-500 text-white',
  urgente: 'bg-red-500 text-white',
};

const PRIORIDADE_LABEL = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};

function Iniciais({ nome, foto, size = 'sm' }) {
  const initials = (nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length];
  if (foto) {
    return (
      <img src={foto} alt={nome} className={`${sz} rounded-full object-cover flex-shrink-0`} />
    );
  }
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}





function ComentarioPopup({ tarefa, currentUser, open, onClose }) {
  const [texto, setTexto] = useState('');
  const queryClient = useQueryClient();

  const { data: comentarios = [], isLoading } = useQuery({
    queryKey: ['comentarios-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open,
    queryFn: () => base44.entities.ComentarioTarefa.filter({ tarefa_id: tarefa.id }, 'created_date'),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!texto.trim()) return;
      await base44.entities.ComentarioTarefa.create({
        tarefa_id: tarefa.id,
        empresa_id: tarefa.empresa_id,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
        texto: texto.trim(),
      });
    },
    onSuccess: () => {
      setTexto('');
      queryClient.invalidateQueries({ queryKey: ['comentarios-tarefa', tarefa?.id] });
    },
  });

  if (!tarefa) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="border-b pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{tarefa.titulo}</h2>
            <span className="text-xs font-medium px-2 py-1 rounded-full text-white" style={{ backgroundColor: '#3b82f6' }}>
              Comentários
            </span>
          </div>
        </div>

        {/* Lista de comentários */}
        <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-2">
          {isLoading && (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          )}
          {!isLoading && comentarios.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">Nenhum comentário ainda.</p>
          )}
          {comentarios.map(c => (
            <div key={c.id} className="bg-slate-50 rounded-lg p-4 border">
              <div className="flex items-start gap-3">
                <Iniciais nome={c.usuario_nome} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-slate-800">{c.usuario_nome || 'Usuário'}</span>
                    <span className="text-xs text-slate-400">
                      {c.created_date ? format(new Date(c.created_date), 'dd/MM HH:mm') : ''}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{c.texto}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t my-2" />

        {/* Input novo comentário */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Comentário</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
            rows={3}
            placeholder="Digite seu comentário..."
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvar.mutate(); } }}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              className="bg-[#4CAF50] hover:bg-[#45a049] text-white"
              onClick={() => salvar.mutate()}
              disabled={!texto.trim() || salvar.isPending}
            >
              {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TarefasLista({ tarefas, statusList, colaboradores = [], onEdit, onDelete, onVerDetalhes, onUpdate, currentUser, tiposList = [] }) {
  const [selecionada, setSelecionada] = useState(null);
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [abaDetalhes, setAbaDetalhes] = useState('detalhes');
  const [responsaveisModalOpen, setResponsaveisModalOpen] = useState(false);
  const [tarefaResponsaveisModal, setTarefaResponsaveisModal] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [tarefaStatusModal, setTarefaStatusModal] = useState(null);
  const [tarefaEditando, setTarefaEditando] = useState(null);
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
      <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-slate-400 text-sm">
        Nenhuma tarefa encontrada
      </div>
    );
  }

  return (
    <div className="flex gap-0 bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Tabela */}
      <div className="flex-1 min-w-0 overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 900 }}>
          <thead>
            <tr className="border-b bg-gradient-to-r from-slate-50 to-slate-100">
              <th className="text-left px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:140}}>Cliente</th>
              <th className="text-left px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:200}}>Título</th>
              <th className="text-left px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:140}}>Status</th>
              <th className="text-left px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:130}}>Responsáveis</th>
              <th className="text-left px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:110}}>Início</th>
              <th className="text-left px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:110}}>Limite</th>
              <th className="text-left px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:140}}></th>
              <th className="text-center px-4 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wide" style={{width:100}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {tarefas.map((tarefa, idx) => {
              const atrasada = isAtrasada(tarefa);
              const isSel = selecionada === tarefa.id;

              return (
                <tr
                  key={tarefa.id}
                  className={`border-b last:border-0 transition-all duration-200 ${isSel ? 'bg-blue-50' : 'hover:bg-gradient-to-r hover:from-slate-50 hover:to-transparent'} group cursor-pointer`}
                  onDoubleClick={() => onVerDetalhes(tarefa)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                        {(tarefa.cliente_nome || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{tarefa.cliente_nome || <span className="text-slate-400 italic">Interna</span>}</p>
                        {tarefa.tipo && <p className="text-xs text-slate-500">{tiposList.find(t => t.id === tarefa.tipo)?.nome || tarefa.tipo}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      {atrasada && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500" title="Atrasada" />
                      )}
                      {!atrasada && tarefa.data_conclusao_prevista === hoje && (
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-yellow-100 border border-yellow-400 flex items-center justify-center text-yellow-600 text-[9px] font-bold" title="Vence hoje">!</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-medium ${atrasada ? 'text-red-600' : 'text-slate-800'}`}>{tarefa.titulo}</p>
                        {tarefa.descricao && <p className="text-xs text-slate-400 truncate">{tarefa.descricao}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); setTarefaStatusModal(tarefa); setStatusModalOpen(true); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap cursor-pointer hover:shadow-md transition-all"
                      style={{ backgroundColor: statusList.find(s => s.slug === tarefa.status)?.cor || '#94a3b8' }}
                    >
                      <span className="w-2 h-2 rounded-full bg-white opacity-70"></span>
                      {statusList.find(s => s.slug === tarefa.status)?.nome || tarefa.status}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); setTarefaResponsaveisModal(tarefa); setResponsaveisModalOpen(true); }}
                      className="flex items-center -space-x-2 cursor-pointer hover:opacity-80 transition-opacity group/avatars"
                    >
                      {(() => {
                        let ids = [];
                        try { ids = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []; } catch {}
                        if (ids.length === 0 && tarefa.responsavel_principal_id) ids = [tarefa.responsavel_principal_id];
                        return (
                          <>
                            {ids.length === 0 && <span className="text-slate-300 text-xs px-2 py-1">-</span>}
                            {ids.slice(0, 3).map((id) => {
                              const colab = colaboradores.find(c => c.id === id);
                              return (
                                <div key={id} className="ring-2 ring-white rounded-full hover:scale-110 transition-transform">
                                  <Iniciais nome={colab?.nome || '?'} foto={colab?.foto_perfil} size="sm" />
                                </div>
                              );
                            })}
                            {ids.length > 3 && (
                              <div className="w-7 h-7 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-xs text-slate-600 font-semibold hover:scale-110 transition-transform">
                                +{ids.length - 3}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-slate-500 text-xs">
                    {formatarData(tarefa.data_cadastro || tarefa.created_date)}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs font-semibold ${atrasada ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                      {formatarData(tarefa.data_conclusao_prevista)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setTarefaSelecionada(tarefa); setDetalhesOpen(true); setAbaDetalhes('comentarios'); }}
                      title="Comentários"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-400 transition-colors text-xs font-medium"
                    >
                      <MessageSquarePlus className="w-4 h-4" />
                      Comentários
                    </button>
                  </td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-50" onClick={() => onEdit(tarefa)} title="Editar">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-50" onClick={() => onDelete(tarefa)} title="Excluir">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SelecionarStatusResponsaveisModal
        open={!!tarefaEditando}
        onOpenChange={(open) => !open && setTarefaEditando(null)}
        tarefa={tarefaEditando}
        statusList={statusList}
        colaboradores={colaboradores}
        onUpdate={onUpdate}
      />

      {tarefaSelecionada && (
        <TarefaDetalhesModal
          open={detalhesOpen}
          onOpenChange={setDetalhesOpen}
          tarefa={tarefaSelecionada}
          statusList={statusList}
          currentUser={currentUser}
          onUpdate={onUpdate}
          colaboradores={colaboradores}
          abaAtiva={abaDetalhes}
        />
      )}

      <ResponsaveisModal
        open={responsaveisModalOpen}
        onOpenChange={setResponsaveisModalOpen}
        tarefa={tarefaResponsaveisModal}
        colaboradores={colaboradores}
        onUpdate={onUpdate}
      />

      <SelecionarStatusModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        tarefa={tarefaStatusModal}
        statusList={statusList}
        onUpdate={onUpdate}
      />

      {/* Painel de Detalhes Lateral */}
      {tarefaSel && (
        <div className="w-80 flex-shrink-0 border-l bg-white flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
            <h3 className="font-bold text-slate-800 text-sm">Detalhes da Tarefa</h3>
            <button onClick={() => setSelecionada(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 p-5 space-y-5">
            <div>
              <h2 className="font-bold text-slate-900 text-base leading-tight mb-3">{tarefaSel.titulo}</h2>
              {tarefaSel.responsavel_principal_nome && (
                <div className="flex items-center gap-2">
                  <Iniciais nome={tarefaSel.responsavel_principal_nome} foto={colaboradores.find(c => c.id === tarefaSel.responsavel_principal_id)?.foto_perfil} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{tarefaSel.responsavel_principal_nome}</p>
                    {statusSel && <p className="text-xs text-slate-500 mt-0.5">{statusSel.nome}</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {statusSel && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: statusSel.cor }}>
                  {statusSel.nome}
                </span>
              )}
              {tarefaSel.prioridade && (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${PRIORIDADE_CORES[tarefaSel.prioridade] || 'bg-slate-100 text-slate-600'}`}>
                  {PRIORIDADE_LABEL[tarefaSel.prioridade] || tarefaSel.prioridade}
                </span>
              )}
            </div>

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

            {tarefaSel.descricao && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlignLeft className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descrição</p>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{tarefaSel.descricao}</p>
              </div>
            )}

            {tarefaSel.cliente_nome && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Cliente</p>
                <p className="text-sm font-medium text-slate-800">{tarefaSel.cliente_nome}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button size="sm" className="flex-1 bg-[#1e3a5f] hover:bg-[#162d4a] text-white" onClick={() => onVerDetalhes(tarefaSel)}>
                Ver completo
              </Button>
              <Button size="sm" variant="outline" onClick={() => onEdit(tarefaSel)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
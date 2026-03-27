import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, MessageCircle, Calendar, User, History, CheckSquare, Briefcase } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

const tipoLabel = {
  comentario: '💬 Comentário',
  ligacao: '📞 Ligação',
  reuniao: '🤝 Reunião',
  email: '📧 Email',
  movimentacao: '🔄 Movimentação',
};

const acaoLabel = {
  criou: '✅ Criou a tarefa',
  moveu_status: '🔄 Moveu status',
  alterou_prazo: '📅 Alterou prazo',
  adicionou_responsavel: '👤 Adicionou responsável',
  editou: '✏️ Editou',
  concluiu: '✅ Concluiu',
  excluiu: '🗑️ Excluiu',
};

const prioridadeCfg = {
  urgente: { label: 'Urgente', className: 'bg-red-600 text-white' },
  alta: { label: 'Alta', className: 'bg-red-100 text-red-700' },
  media: { label: 'Média', className: 'bg-yellow-100 text-yellow-700' },
  baixa: { label: 'Baixa', className: 'bg-green-100 text-green-700' },
};

const setorLabel = {
  consorcio: 'Consórcio', emprestimo: 'Empréstimo',
  financiamento: 'Financiamento', administrativo: 'Administrativo', cobranca: 'Cobrança',
};

const TABS = [
  { key: 'detalhes', label: 'Detalhes', icon: User },
  { key: 'checklist', label: 'Checklist', icon: CheckSquare },
  { key: 'comentarios', label: 'Comentários', icon: MessageCircle },
  { key: 'historico', label: 'Histórico', icon: History },
];

export default function TarefaDetalhesModal({ open, onOpenChange, tarefa, statusList, currentUser, onUpdate, colaboradores = [], tiposList = [] }) {
  const [aba, setAba] = useState('detalhes');
  const [novoComentario, setNovoComentario] = useState('');
  const [tipoComentario, setTipoComentario] = useState('comentario');
  const [mostrarForm, setMostrarForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: comentarios = [] } = useQuery({
    queryKey: ['comentarios-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open,
    queryFn: () => base44.entities.ComentarioTarefa.filter({ tarefa_id: tarefa.id }, '-created_date'),
  });

  const { data: historico = [] } = useQuery({
    queryKey: ['historico-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open,
    queryFn: () => base44.entities.TarefaHistorico.filter({ tarefa_id: tarefa.id }, '-created_date'),
  });

  const criarComentario = useMutation({
    mutationFn: async ({ mensagem, tipo }) => {
      return base44.entities.ComentarioTarefa.create({
        tarefa_id: tarefa.id,
        empresa_id: tarefa.empresa_id,
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name || currentUser.nome_perfil || '',
        mensagem,
        tipo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comentarios-tarefa', tarefa.id] });
      setNovoComentario('');
      setTipoComentario('comentario');
      setMostrarForm(false);
      toast.success('Comentário adicionado!');
    },
  });

  if (!tarefa) return null;

  let checklist = [];
  try { checklist = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  let responsaveisNomes = [];
  let responsaveisFotos = [];
  try { responsaveisNomes = tarefa.responsaveis_nomes ? JSON.parse(tarefa.responsaveis_nomes) : []; } catch {}
  try { responsaveisFotos = tarefa.responsaveis_fotos ? JSON.parse(tarefa.responsaveis_fotos) : []; } catch {}

  const statusObj = statusList?.find(s => s.slug === tarefa.status);
  const checkDone = checklist.filter(i => i.checked).length;
  const checkPct = checklist.length > 0 ? Math.round((checkDone / checklist.length) * 100) : 0;
  const pCfg = prioridadeCfg[tarefa.prioridade] || prioridadeCfg.media;
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const atrasada = tarefa.data_conclusao_prevista && tarefa.data_conclusao_prevista < hoje && tarefa.status !== 'concluido' && tarefa.status !== 'arquivado';

  const handleCheckItem = (itemId, val) => {
    const updated = checklist.map(i => i.id === itemId ? { ...i, checked: val } : i);
    onUpdate?.(tarefa.id, { checklist: JSON.stringify(updated) });
  };

  const handleStatusChange = (novoStatus) => {
    onUpdate?.(tarefa.id, { status: novoStatus });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">{tarefa.titulo}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {statusObj && (
                  <Badge style={{ backgroundColor: statusObj.cor, color: '#fff' }} className="text-xs">{statusObj.nome}</Badge>
                )}
                <Badge className={`text-xs ${pCfg.className}`}>{pCfg.label}</Badge>
                {atrasada && <Badge className="text-xs bg-red-600 text-white">⚠ Atrasada</Badge>}
                {tarefa.setor && <Badge variant="outline" className="text-xs">{setorLabel[tarefa.setor] || tarefa.setor}</Badge>}
              </div>
            </div>
            <Select value={tarefa.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-44 h-8 text-sm flex-shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusList.map(s => <SelectItem key={s.slug} value={s.slug}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Abas */}
        <div className="flex border-b bg-slate-50">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setAba(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                aba === tab.key
                  ? 'border-[#1e3a5f] text-[#1e3a5f] bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'comentarios' && comentarios.length > 0 && (
                <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full">{comentarios.length}</span>
              )}
              {tab.key === 'historico' && historico.length > 0 && (
                <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full">{historico.length}</span>
              )}
              {tab.key === 'checklist' && checklist.length > 0 && (
                <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full">{checkDone}/{checklist.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo das abas */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ABA: DETALHES */}
          {aba === 'detalhes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {tarefa.cliente_nome && (
                  <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
                    <User className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-400">Cliente</p>
                      <p className="font-medium text-slate-800">{tarefa.cliente_nome}</p>
                    </div>
                  </div>
                )}
                {tarefa.data_conclusao_prevista && (
                  <div className={`flex items-center gap-2 rounded-lg p-3 ${atrasada ? 'bg-red-50' : 'bg-slate-50'}`}>
                    <Calendar className={`w-4 h-4 ${atrasada ? 'text-red-500' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-xs text-slate-400">Prazo</p>
                      <p className={`font-medium ${atrasada ? 'text-red-600' : 'text-slate-800'}`}>
                        {format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  </div>
                )}
                {tarefa.setor && (
                  <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
                    <Briefcase className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-400">Setor</p>
                      <p className="font-medium text-slate-800">{setorLabel[tarefa.setor] || tarefa.setor}</p>
                    </div>
                  </div>
                )}
                {tarefa.tipo && (
                  <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
                    <div>
                      <p className="text-xs text-slate-400">Tipo</p>
                      <p className="font-medium text-slate-800">{tiposList.find(t => t.id === tarefa.tipo)?.nome || tarefa.tipo}</p>
                    </div>
                  </div>
                )}
              </div>

              {tarefa.descricao && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-400 mb-2 font-medium">Descrição</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{tarefa.descricao}</p>
                </div>
              )}

              {responsaveisNomes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Responsáveis</p>
                  <div className="flex flex-wrap gap-2">
                    {responsaveisNomes.map((nome, idx) => (
                      <div key={idx} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${nome === (tarefa.responsavel_principal_nome) ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={responsaveisFotos[idx]} />
                          <AvatarFallback className="text-xs bg-slate-200">{getInitials(nome)}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{nome}</span>
                        {nome === tarefa.responsavel_principal_nome && <span className="text-blue-500 text-xs">★</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA: CHECKLIST */}
          {aba === 'checklist' && (
            <div>
              {checklist.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">{checkDone} de {checklist.length} concluídos</span>
                    <span className="text-sm font-bold text-slate-500">{checkPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${checkPct}%` }} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {checklist.map(item => (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${item.checked ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
                    <Checkbox checked={item.checked} onCheckedChange={v => handleCheckItem(item.id, !!v)} />
                    <span className={`text-sm flex-1 ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.texto}</span>
                    {item.checked && <span className="text-xs text-green-600">✓</span>}
                  </div>
                ))}
                {checklist.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">Nenhum item no checklist</p>
                )}
              </div>
            </div>
          )}

          {/* ABA: COMENTÁRIOS */}
          {aba === 'comentarios' && (
            <div className="space-y-3">
              {comentarios.length === 0 && !mostrarForm && (
                <p className="text-sm text-slate-400 text-center py-6">Nenhum comentário ainda</p>
              )}
              {comentarios.map(c => (
                <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(c.usuario_nome)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-semibold text-slate-800">{c.usuario_nome}</span>
                      <Badge variant="outline" className="text-xs h-5">{tipoLabel[c.tipo] || c.tipo}</Badge>
                    </div>
                    <span className="text-xs text-slate-400">{format(new Date(c.created_date), 'dd/MM HH:mm')}</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.mensagem}</p>
                </div>
              ))}

              {!mostrarForm ? (
                <Button variant="outline" size="sm" onClick={() => setMostrarForm(true)} className="w-full">
                  <Plus className="w-4 h-4 mr-1" /> Adicionar comentário
                </Button>
              ) : (
                <div className="space-y-2 border rounded-xl p-4 bg-slate-50">
                  <Select value={tipoComentario} onValueChange={setTipoComentario}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comentario">💬 Comentário</SelectItem>
                      <SelectItem value="ligacao">📞 Ligação</SelectItem>
                      <SelectItem value="reuniao">🤝 Reunião</SelectItem>
                      <SelectItem value="email">📧 Email</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea value={novoComentario} onChange={e => setNovoComentario(e.target.value)} placeholder="Digite seu comentário..." rows={3} />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setMostrarForm(false); setNovoComentario(''); }}>Cancelar</Button>
                    <Button size="sm" onClick={() => criarComentario.mutate({ mensagem: novoComentario, tipo: tipoComentario })}
                      disabled={!novoComentario.trim() || criarComentario.isPending} className="bg-[#23BE84] hover:bg-[#1da570]">
                      Enviar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA: HISTÓRICO */}
          {aba === 'historico' && (
            <div className="space-y-2">
              {historico.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">Nenhuma movimentação registrada</p>
              )}
              {historico.map((h, idx) => (
                <div key={h.id || idx} className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                    <AvatarFallback className="text-xs bg-slate-200 text-slate-700">{getInitials(h.usuario_nome || '')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-700">{h.usuario_nome}</span>
                        <span className="text-xs text-slate-500 ml-2">{acaoLabel[h.acao] || h.acao}</span>
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {h.created_date ? format(new Date(h.created_date), 'dd/MM HH:mm') : ''}
                      </span>
                    </div>
                    {h.descricao && <p className="text-xs text-slate-500 mt-0.5">{h.descricao}</p>}
                    {h.status_anterior && h.status_novo && (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs h-5">{h.status_anterior}</Badge>
                        <span className="text-xs text-slate-400">→</span>
                        <Badge variant="outline" className="text-xs h-5 text-green-700 border-green-300">{h.status_novo}</Badge>
                      </div>
                    )}
                    {h.valor_anterior && h.valor_novo && !h.status_anterior && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 line-through">{h.valor_anterior}</span>
                        <span className="text-xs text-slate-400">→</span>
                        <span className="text-xs text-green-700 font-medium">{h.valor_novo}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
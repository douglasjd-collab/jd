import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, MessageCircle, Calendar, User } from 'lucide-react';
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

export default function TarefaDetalhesModal({ open, onOpenChange, tarefa, statusList, currentUser, onUpdate }) {
  const [novoComentario, setNovoComentario] = useState('');
  const [tipoComentario, setTipoComentario] = useState('comentario');
  const [mostrarForm, setMostrarForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: comentarios = [] } = useQuery({
    queryKey: ['comentarios-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open,
    queryFn: () => base44.entities.ComentarioTarefa.filter({ tarefa_id: tarefa.id }, '-created_date'),
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

  const handleCheckItem = (itemId, val) => {
    const updated = checklist.map(i => i.id === itemId ? { ...i, checked: val } : i);
    onUpdate?.(tarefa.id, { checklist: JSON.stringify(updated) });
  };

  const handleStatusChange = (novoStatus) => {
    onUpdate?.(tarefa.id, { status: novoStatus });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{tarefa.titulo}</DialogTitle>
          {statusObj && <Badge className="w-fit mt-1" style={{ backgroundColor: statusObj.cor || '#3b82f6', color: '#fff' }}>{statusObj.nome}</Badge>}
        </DialogHeader>

        <div className="space-y-5">
          {/* Info geral */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {tarefa.cliente_nome && (
              <div className="flex items-center gap-2 text-slate-600">
                <User className="w-4 h-4" /> <span>{tarefa.cliente_nome}</span>
              </div>
            )}
            {tarefa.data_conclusao_prevista && (
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4" />
                <span>Prazo: {format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yyyy')}</span>
              </div>
            )}
          </div>

          {/* Alterar status */}
          <div>
            <p className="text-xs text-slate-500 mb-1 font-medium">Alterar Status</p>
            <Select value={tarefa.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusList.map(s => <SelectItem key={s.slug} value={s.slug}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {tarefa.descricao && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Descrição</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{tarefa.descricao}</p>
            </div>
          )}

          {/* Responsáveis */}
          {responsaveisNomes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Responsáveis</p>
              <div className="flex flex-wrap gap-2">
                {responsaveisNomes.map((nome, idx) => (
                  <div key={idx} className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                    <Avatar className="h-5 w-5"><AvatarImage src={responsaveisFotos[idx]} /><AvatarFallback className="text-xs">{getInitials(nome)}</AvatarFallback></Avatar>
                    <span className="text-xs">{nome}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          {checklist.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Checklist ({checkDone}/{checklist.length})</p>
              <div className="space-y-2">
                {checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Checkbox checked={item.checked} onCheckedChange={v => handleCheckItem(item.id, !!v)} />
                    <span className={`text-sm ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histórico / Comentários */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Histórico e Comentários</p>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
              {comentarios.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Nenhum registro ainda</p>
              ) : comentarios.map(c => (
                <div key={c.id} className="bg-slate-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5"><AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(c.usuario_nome)}</AvatarFallback></Avatar>
                      <span className="text-xs font-semibold">{c.usuario_nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{tipoLabel[c.tipo] || c.tipo}</Badge>
                      <span className="text-xs text-slate-400">{format(new Date(c.created_date), 'dd/MM HH:mm')}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.mensagem}</p>
                </div>
              ))}
            </div>

            {!mostrarForm ? (
              <Button variant="outline" size="sm" onClick={() => setMostrarForm(true)} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> Adicionar comentário
              </Button>
            ) : (
              <div className="space-y-2 border rounded-lg p-3">
                <Select value={tipoComentario} onValueChange={setTipoComentario}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comentario">💬 Comentário</SelectItem>
                    <SelectItem value="ligacao">📞 Ligação</SelectItem>
                    <SelectItem value="reuniao">🤝 Reunião</SelectItem>
                    <SelectItem value="email">📧 Email</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea value={novoComentario} onChange={e => setNovoComentario(e.target.value)} placeholder="Digite..." rows={2} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setMostrarForm(false); setNovoComentario(''); }}>Cancelar</Button>
                  <Button size="sm" onClick={() => criarComentario.mutate({ mensagem: novoComentario, tipo: tipoComentario })} disabled={!novoComentario.trim() || criarComentario.isPending} className="bg-[#23BE84] hover:bg-[#1da570]">Enviar</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
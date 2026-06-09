import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  X, Pencil, Calendar, User, Tag, CheckSquare, MessageSquare, Clock, AlertTriangle
} from 'lucide-react';
import ComentariosWhatsApp from './ComentariosWhatsApp';
import ChecklistAba from './ChecklistAba';

const PRIORIDADE_CORES = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
};

const PRIORIDADE_LABEL = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};

function Iniciais({ nome, foto, size = 'md' }) {
  const initials = (nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-sm';
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length];
  if (foto) return <img src={foto} alt={nome} className={`${sz} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function formatarData(data) {
  if (!data) return '-';
  try { return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR }); } catch { return data; }
}

export default function TarefaDetalhesModal({
  open, onOpenChange, tarefa, statusList = [], currentUser,
  onUpdate, colaboradores = [], subsetoresList = [], abaAtiva: abaInicial
}) {
  const [aba, setAba] = useState(abaInicial || 'detalhes');
  const [novoComentario, setNovoComentario] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setAba(abaInicial || 'detalhes');
  }, [open, abaInicial]);

  const { data: comentarios = [], isLoading: loadingComentarios } = useQuery({
    queryKey: ['comentarios-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open,
    queryFn: () => base44.entities.ComentarioTarefa.filter({ tarefa_id: tarefa.id }, 'created_date'),
  });

  const { data: historico = [], isLoading: loadingHistorico } = useQuery({
    queryKey: ['historico-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open && aba === 'historico',
    queryFn: () => base44.entities.TarefaHistorico.filter({ tarefa_id: tarefa.id }, '-created_date'),
  });

  const enviarComentario = useMutation({
    mutationFn: async (responsavelSelecionado) => {
      if (!novoComentario.trim()) return;
      await base44.entities.ComentarioTarefa.create({
        tarefa_id: tarefa.id,
        empresa_id: tarefa.empresa_id,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
        mensagem: novoComentario.trim(),
        tipo: 'comentario',
        responsavel_mencionado_id: responsavelSelecionado?.id || null,
        responsavel_mencionado_nome: responsavelSelecionado?.nome || null,
      });
      if (responsavelSelecionado) {
        await base44.entities.AlertaTarefa.create({
          empresa_id: tarefa.empresa_id,
          tarefa_id: tarefa.id,
          tarefa_titulo: tarefa.titulo,
          comentario_texto: novoComentario.trim(),
          destinatario_id: responsavelSelecionado.id,
          destinatario_nome: responsavelSelecionado.nome,
          remetente_id: currentUser?.id,
          remetente_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
          lido: false,
        });
      }
    },
    onSuccess: () => {
      setNovoComentario('');
      queryClient.invalidateQueries({ queryKey: ['comentarios-tarefa', tarefa?.id] });
    },
  });

  const atualizarChecklist = async (novaLista) => {
    await onUpdate(tarefa.id, { checklist: JSON.stringify(novaLista) });
  };

  if (!tarefa) return null;

  const status = statusList.find(s => (s.slug || s.id) === tarefa.status);
  const responsavelPrincipal = colaboradores.find(c => c.id === tarefa.responsavel_principal_id);
  let responsaveisIds = [];
  try { responsaveisIds = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []; } catch {}
  const responsaveisColabs = responsaveisIds.map(id => colaboradores.find(c => c.id === id)).filter(Boolean);
  let checklistItems = [];
  try { checklistItems = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const subsetor = subsetoresList.find(s => s.id === tarefa.subsetor_id);
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const atrasada = tarefa.data_conclusao_prevista && tarefa.data_conclusao_prevista < hoje && tarefa.status !== 'concluido' && tarefa.status !== 'arquivado';

  const abas = [
    { key: 'detalhes', label: 'Detalhes', icon: Tag },
    { key: 'comentarios', label: 'Comentários', icon: MessageSquare, badge: comentarios.length },
    { key: 'checklist', label: 'Checklist', icon: CheckSquare, badge: checklistItems.length > 0 ? `${checklistItems.filter(i => i.checked).length}/${checklistItems.length}` : null },
    { key: 'historico', label: 'Histórico', icon: Clock },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col gap-0" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b bg-white">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              {status && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: status.cor }}>
                  {status.nome}
                </span>
              )}
              {tarefa.prioridade && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PRIORIDADE_CORES[tarefa.prioridade] || 'bg-slate-100 text-slate-600'}`}>
                  {PRIORIDADE_LABEL[tarefa.prioridade] || tarefa.prioridade}
                </span>
              )}
              {atrasada && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Atrasada
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">{tarefa.titulo}</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-600 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b bg-white px-6 gap-1">
          {abas.map(a => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                aba === a.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <a.icon className="w-4 h-4" />
              {a.label}
              {a.badge != null && a.badge !== 0 && (
                <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                  {a.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {/* Detalhes */}
          {aba === 'detalhes' && (
            <div className="p-6 space-y-5">
              {/* Responsável principal */}
              {(responsavelPrincipal || tarefa.responsavel_principal_nome) && (
                <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-4">
                  <Iniciais
                    nome={responsavelPrincipal?.nome || tarefa.responsavel_principal_nome}
                    foto={responsavelPrincipal?.foto_perfil}
                    size="lg"
                  />
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Responsável Principal</p>
                    <p className="text-base font-bold text-slate-900">{responsavelPrincipal?.nome || tarefa.responsavel_principal_nome}</p>
                    {responsavelPrincipal?.email && <p className="text-sm text-slate-500">{responsavelPrincipal.email}</p>}
                    {responsavelPrincipal?.telefone && <p className="text-sm text-slate-400">{responsavelPrincipal.telefone}</p>}
                  </div>
                </div>
              )}

              {/* Outros responsáveis */}
              {responsaveisColabs.length > 1 && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Responsáveis</p>
                  <div className="flex flex-wrap gap-2">
                    {responsaveisColabs.map(c => (
                      <div key={c.id} className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
                        <Iniciais nome={c.nome} foto={c.foto_perfil} size="sm" />
                        <span className="text-sm font-medium text-slate-700">{c.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grid de informações */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Criado em</p>
                  <p className="text-sm font-semibold text-slate-800">{formatarData(tarefa.data_cadastro || tarefa.created_date)}</p>
                </div>
                <div className={`border rounded-xl p-3 ${atrasada ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                  <p className={`text-xs mb-1 flex items-center gap-1 ${atrasada ? 'text-red-400' : 'text-slate-400'}`}>
                    <Calendar className="w-3 h-3" /> Prazo
                  </p>
                  <p className={`text-sm font-semibold ${atrasada ? 'text-red-600' : 'text-slate-800'}`}>
                    {formatarData(tarefa.data_conclusao_prevista)}
                  </p>
                </div>
                {tarefa.cliente_nome && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Cliente</p>
                    <p className="text-sm font-semibold text-slate-800">{tarefa.cliente_nome}</p>
                  </div>
                )}
                {(subsetor || tarefa.subsetor_nome) && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Tipo</p>
                    <p className="text-sm font-semibold text-slate-800">{subsetor?.nome || tarefa.subsetor_nome}</p>
                  </div>
                )}
                {tarefa.setor_nome && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Setor</p>
                    <p className="text-sm font-semibold text-slate-800">{tarefa.setor_nome}</p>
                  </div>
                )}
                {tarefa.senha_gov && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Senha GOV</p>
                    <p className="text-sm font-semibold text-slate-800">{tarefa.senha_gov}</p>
                  </div>
                )}
              </div>

              {/* Descrição */}
              {tarefa.descricao && (
                <div className="bg-white border rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Descrição</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{tarefa.descricao}</p>
                </div>
              )}
            </div>
          )}

          {/* Comentários */}
          {aba === 'comentarios' && (
            <div className="flex flex-col" style={{ height: '440px' }}>
              <ComentariosWhatsApp
                comentarios={comentarios}
                currentUser={currentUser}
                novoComentario={novoComentario}
                setNovoComentario={setNovoComentario}
                onEnviar={(resp) => enviarComentario.mutate(resp)}
                enviando={enviarComentario.isPending}
                colaboradores={colaboradores}
              />
            </div>
          )}

          {/* Checklist */}
          {aba === 'checklist' && (
            <div className="p-6">
              <ChecklistAba
                checklist={checklistItems}
                empresaId={tarefa.empresa_id}
                onUpdate={atualizarChecklist}
              />
            </div>
          )}

          {/* Histórico */}
          {aba === 'historico' && (
            <div className="p-6 space-y-3">
              {loadingHistorico && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
              {!loadingHistorico && historico.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum histórico registrado</p>
                </div>
              )}
              {historico.map(h => (
                <div key={h.id} className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">{h.descricao}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {h.usuario_nome} · {h.created_date ? format(new Date(h.created_date), 'dd/MM/yyyy HH:mm') : ''}
                    </p>
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
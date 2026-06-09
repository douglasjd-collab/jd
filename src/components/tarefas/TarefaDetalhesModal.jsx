import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Phone, CreditCard, Calendar, Briefcase, ClipboardList, MessageCircle, History, Paperclip, ChevronRight, ArrowRight, Upload, Trash2, FileText, Image, File } from 'lucide-react';
import ComentariosWhatsApp from './ComentariosWhatsApp';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

const prioridadeCfg = {
  urgente: { label: 'Urgente', className: 'bg-red-500 text-white' },
  alta:    { label: 'Alta',    className: 'bg-red-100 text-red-700' },
  media:   { label: 'Média',   className: 'bg-yellow-100 text-yellow-800' },
  baixa:   { label: 'Baixa',   className: 'bg-green-100 text-green-700' },
};

const setorLabel = {
  consorcio: 'Consórcio', emprestimo: 'Empréstimo',
  financiamento: 'Financiamento', administrativo: 'Administrativo', cobranca: 'Cobrança',
};

const TABS = [
  { key: 'detalhes',    label: 'Detalhes',    icon: ClipboardList },
  { key: 'checklist',   label: 'Checklist',   icon: ClipboardList },
  { key: 'comentarios', label: 'Comentários', icon: MessageCircle },
  { key: 'anexos',      label: 'Anexos',      icon: Paperclip },
  { key: 'historico',   label: 'Histórico',   icon: History },
];

function formatarHora(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const hoje = new Date();
    const isHoje = d.toDateString() === hoje.toDateString();
    const hora = format(d, 'HH:mm');
    return isHoje ? `${hora} Hoje` : format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

function getFileIcon(nome) {
  const ext = nome?.split('.').pop()?.toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return Image;
  if (['pdf'].includes(ext)) return FileText;
  return File;
}

export default function TarefaDetalhesModal({ open, onOpenChange, tarefa, statusList, currentUser, onUpdate, colaboradores = [], tiposList = [] }) {
  const [aba, setAba] = useState('detalhes');
  const [novoComentario, setNovoComentario] = useState('');
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
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
    mutationFn: async (mensagem) => base44.entities.ComentarioTarefa.create({
      tarefa_id: tarefa.id,
      empresa_id: tarefa.empresa_id,
      usuario_id: currentUser?.id,
      usuario_nome: currentUser?.full_name || currentUser?.nome_perfil || '',
      mensagem,
      tipo: 'comentario',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comentarios-tarefa', tarefa.id] });
      setNovoComentario('');
      toast.success('Comentário adicionado!');
    },
  });

  // Carregar anexos salvos na tarefa
  let anexos = [];
  try { anexos = tarefa?.anexos ? JSON.parse(tarefa.anexos) : []; } catch {}

  const handleUploadAnexo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAnexo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const novosAnexos = [...anexos, { nome: file.name, url: file_url, data: new Date().toISOString() }];
      await onUpdate?.(tarefa.id, { anexos: JSON.stringify(novosAnexos) });
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success(`Anexo "${file.name}" enviado!`);
    } catch (err) {
      toast.error('Erro ao enviar anexo');
    } finally {
      setUploadingAnexo(false);
      e.target.value = '';
    }
  };

  const handleRemoverAnexo = async (idx) => {
    const novosAnexos = anexos.filter((_, i) => i !== idx);
    await onUpdate?.(tarefa.id, { anexos: JSON.stringify(novosAnexos) });
    queryClient.invalidateQueries({ queryKey: ['tarefas'] });
    toast.success('Anexo removido');
  };

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
  const atrasada = tarefa.data_conclusao_prevista && tarefa.data_conclusao_prevista < hoje
    && tarefa.status !== 'concluido' && tarefa.status !== 'arquivado';

  const handleCheckItem = (itemId, val) => {
    const updated = checklist.map(i => i.id === itemId ? { ...i, checked: val } : i);
    onUpdate?.(tarefa.id, { checklist: JSON.stringify(updated) });
  };

  // Busca dados do cliente (cpf, telefone) se disponível
  const clienteCpf = tarefa.cliente_cpf || '';
  const clienteTelefone = tarefa.cliente_telefone || '';

  // Responsável principal
  const respPrincipalNome = tarefa.responsavel_principal_nome || responsaveisNomes[0] || '';
  const respPrincipalFoto = responsaveisFotos[0] || '';

  // Histórico + comentários combinados para sidebar (últimos 3)
  const historicoRecente = historico.slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col overflow-hidden p-0 gap-0 [&>button]:top-3 [&>button]:right-3">

        {/* ── CABEÇALHO ── */}
        <div className="px-6 pt-5 pb-4 border-b bg-white">
          <div className="flex items-start gap-4">
            {/* Avatar do cliente */}
            <Avatar className="h-12 w-12 flex-shrink-0 border-2 border-slate-200">
              <AvatarFallback className="bg-slate-200 text-slate-600 font-bold text-base">
                {getInitials(tarefa.cliente_nome || tarefa.titulo || '')}
              </AvatarFallback>
            </Avatar>

            {/* Info cliente + prioridade */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 truncate">
                  {tarefa.cliente_nome || tarefa.titulo}
                </h2>
                <Badge className={`text-xs font-semibold px-2 py-0.5 ${pCfg.className}`}>
                  {pCfg.label}
                </Badge>
                {atrasada && (
                  <span className="text-amber-500 text-sm">⚠</span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                {clienteTelefone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {clienteTelefone}
                  </span>
                )}
                {clienteCpf && (
                  <span className="flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> CPF: {clienteCpf}
                  </span>
                )}
              </div>
            </div>

            {/* Select status */}
            <Select value={tarefa.status} onValueChange={v => onUpdate?.(tarefa.id, { status: v })}>
              <SelectTrigger className="w-56 h-9 text-sm flex-shrink-0 border-slate-300 mr-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusList?.map(s => <SelectItem key={s.slug} value={s.slug}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── ABAS ── */}
        <div className="flex border-b bg-slate-50 px-2 overflow-x-auto flex-shrink-0">
          {TABS.map(tab => {
            const count = tab.key === 'comentarios' ? comentarios.length
              : tab.key === 'historico' ? historico.length
              : tab.key === 'checklist' ? checklist.length
              : tab.key === 'anexos' ? anexos.length : 0;
            return (
              <button
                key={tab.key}
                onClick={() => setAba(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  aba === tab.key
                    ? 'border-[#1e3a5f] text-[#1e3a5f] bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {count > 0 && (
                  <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full leading-5">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── CORPO: duas colunas ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Coluna esquerda: conteúdo da aba */}
          <div className="flex-1 overflow-hidden flex flex-col">
          <div className={aba === 'comentarios' ? 'flex-1 overflow-hidden flex flex-col' : 'flex-1 overflow-y-auto p-5 space-y-4'}>

            {/* DETALHES */}
            {aba === 'detalhes' && (
              <div className="space-y-4">
                {/* Título da tarefa em destaque */}
                <h3 className="text-base font-semibold text-slate-900">{tarefa.titulo}</h3>

                {/* CPF e senha GOV inline */}
                <div className="text-sm text-slate-700 space-y-1">
                  {clienteCpf && <p>· CPF: {clienteCpf}</p>}
                  {tarefa.senha_gov && <p>· Senha GOV: {tarefa.senha_gov}</p>}
                </div>

                {/* Descrição */}
                {tarefa.descricao && (
                  <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-100">
                    {tarefa.descricao}
                  </div>
                )}

                {/* Cards: prazo + setor */}
                <div className="flex gap-3 flex-wrap">
                  {tarefa.data_cadastro && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-white border-slate-200">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Início</p>
                        <p className="text-sm font-bold text-slate-800">
                          {format(new Date(tarefa.data_cadastro + 'T12:00:00'), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                  )}
                  {tarefa.data_conclusao_prevista && (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${atrasada ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                      <Calendar className={`w-4 h-4 ${atrasada ? 'text-red-400' : 'text-slate-400'}`} />
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Prazo</p>
                        <p className={`text-sm font-bold ${atrasada ? 'text-red-600' : 'text-slate-800'}`}>
                          {format(new Date(tarefa.data_conclusao_prevista + 'T12:00:00'), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                  )}
                  {tarefa.setor && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-white border-slate-200">
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Setor</p>
                        <p className="text-sm font-bold text-slate-800">{setorLabel[tarefa.setor] || tarefa.setor}</p>
                      </div>
                    </div>
                  )}
                  {tarefa.tipo && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-white border-slate-200">
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Tipo</p>
                        <p className="text-sm font-bold text-slate-800">{tiposList.find(t => t.id === tarefa.tipo)?.nome || tarefa.tipo}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Histórico inline na aba detalhes */}
                {historico.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                      Histórico <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full">{historico.length}</span>
                    </p>
                    <div className="space-y-2">
                      {historico.slice(0, 5).map((h, idx) => (
                        <div key={h.id || idx} className="flex items-start gap-3">
                          <Avatar className="h-7 w-7 flex-shrink-0">
                            <AvatarFallback className="text-xs bg-slate-200">{getInitials(h.usuario_nome || '')}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-800">{h.usuario_nome}</span>
                              <span className="text-xs text-slate-400">{formatarHora(h.created_date)}</span>
                            </div>
                            {h.status_anterior && h.status_novo && (
                              <div className="flex items-center gap-1 text-xs mt-0.5">
                                <span className="text-slate-500">{h.status_anterior}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className={atrasada && h.status_novo?.toLowerCase().includes('atras') ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>{h.status_novo}</span>
                              </div>
                            )}
                            {h.descricao && !h.status_anterior && (
                              <p className="text-xs text-slate-500 mt-0.5">{h.descricao}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CHECKLIST */}
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

            {/* COMENTÁRIOS — estilo WhatsApp */}
            {aba === 'comentarios' && (
              <ComentariosWhatsApp
                comentarios={comentarios}
                currentUser={currentUser}
                novoComentario={novoComentario}
                setNovoComentario={setNovoComentario}
                onEnviar={() => novoComentario.trim() && criarComentario.mutate(novoComentario)}
                enviando={criarComentario.isPending}
              />
            )}

            {/* ANEXOS */}
            {aba === 'anexos' && (
              <div className="space-y-4">
                {/* Botão de upload */}
                <label className={`flex items-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors ${uploadingAnexo ? 'opacity-60 pointer-events-none' : ''}`}>
                  <input type="file" className="hidden" onChange={handleUploadAnexo} disabled={uploadingAnexo} />
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-slate-500">
                    {uploadingAnexo ? 'Enviando...' : 'Clique para anexar um arquivo'}
                  </span>
                </label>

                {/* Lista de anexos */}
                {anexos.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Nenhum anexo adicionado</p>
                ) : (
                  <div className="space-y-2">
                    {anexos.map((anexo, idx) => {
                      const IconComp = getFileIcon(anexo.nome);
                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                          <IconComp className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          <a
                            href={anexo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-0 text-sm font-medium text-blue-700 hover:underline truncate"
                          >
                            {anexo.nome}
                          </a>
                          {anexo.data && (
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              {format(new Date(anexo.data), 'dd/MM/yyyy')}
                            </span>
                          )}
                          <button
                            onClick={() => handleRemoverAnexo(idx)}
                            className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors"
                            title="Remover anexo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* HISTÓRICO */}
            {aba === 'historico' && (
              <div className="space-y-3">
                {historico.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">Nenhuma movimentação registrada</p>
                )}
                {historico.map((h, idx) => (
                  <div key={h.id || idx} className="flex gap-3">
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className="text-xs bg-slate-200 text-slate-700">{getInitials(h.usuario_nome || '')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">{h.usuario_nome}</span>
                        <span className="text-xs text-slate-400">{formatarHora(h.created_date)}</span>
                      </div>
                      {h.status_anterior && h.status_novo && (
                        <div className="flex items-center gap-1 text-xs mt-0.5">
                          <span className="text-slate-500">{h.status_anterior}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="text-green-600 font-medium">{h.status_novo}</span>
                        </div>
                      )}
                      {h.descricao && (
                        <p className="text-xs text-slate-500 mt-0.5">{h.descricao}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>

          {/* ── Sidebar direita ── */}
          <div className="w-80 flex-shrink-0 border-l bg-slate-50 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* Responsável */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2">Responsável</p>
                {responsaveisNomes.length > 0 ? (
                  <div className="space-y-2">
                    {responsaveisNomes.map((nome, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={responsaveisFotos[idx]} />
                          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(nome)}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-slate-800">{nome}</span>
                        {nome === tarefa.responsavel_principal_nome && (
                          <span className="text-yellow-500 text-xs">★</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Não definido</p>
                )}
              </div>

              {/* Histórico sidebar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                    Histórico
                    {historico.length > 0 && (
                      <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full">{historico.length}</span>
                    )}
                  </p>
                  <div className="flex gap-1">
                    <button className="text-slate-400 hover:text-slate-600 p-0.5 rounded">
                      <ChevronRight className="w-3 h-3 rotate-180" />
                    </button>
                    <button className="text-slate-400 hover:text-slate-600 p-0.5 rounded">
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {historicoRecente.map((h, idx) => (
                    <div key={h.id || idx} className="flex gap-2">
                      <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                        <AvatarFallback className="text-xs bg-slate-200">{getInitials(h.usuario_nome || '')}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{h.usuario_nome}</p>
                        {h.status_anterior && h.status_novo && (
                          <div className="flex items-center gap-1 text-xs flex-wrap">
                            <span className="text-slate-400 truncate">{h.status_anterior}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-red-500 font-medium truncate">{h.status_novo}</span>
                          </div>
                        )}
                        {h.descricao && !h.status_anterior && (
                          <p className="text-xs text-slate-500 truncate">{h.descricao}</p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <span>{formatarHora(h.created_date)}</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {historico.length === 0 && (
                    <p className="text-xs text-slate-400">Sem histórico ainda</p>
                  )}
                </div>
              </div>
            </div>


          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
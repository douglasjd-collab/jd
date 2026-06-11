import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Plus, Trash2, Pencil, Check, X, GripVertical,
  Layers, AlertTriangle, Star, Eye, EyeOff
} from 'lucide-react';

const STATUS_PADRAO = [
  { slug: 'a_fazer', nome: 'A Fazer', cor: '#f59e0b', ordem: 1 },
  { slug: 'em_andamento', nome: 'Em Andamento', cor: '#3b82f6', ordem: 2 },
  { slug: 'aguardando_cliente', nome: 'Aguardando Cliente', cor: '#8b5cf6', ordem: 3 },
  { slug: 'aguardando_banco', nome: 'Aguardando Banco', cor: '#f97316', ordem: 4 },
  { slug: 'concluido', nome: 'Concluído', cor: '#22c55e', ordem: 5 },
  { slug: 'arquivado', nome: 'Arquivado', cor: '#94a3b8', ordem: 6 },
];

function isStatusValido(s) {
  return s != null && typeof s === 'object' && typeof s.nome === 'string' && s.nome.trim().length > 0;
}

export default function GerenciarEtapasModal({ open, onOpenChange, empresaId, currentUser, tarefas = [], setoresList = [], statusList = [], onStatusChanged }) {
  const [aba, setAba] = useState('globais');
  const queryClient = useQueryClient();

  const isAdminPerfil = ['master', 'super_admin', 'admin'].includes(currentUser?.perfil);
  const isGerente = currentUser?.perfil === 'gerente';
  const podeEditar = isAdminPerfil || isGerente;

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Layers className="w-5 h-5 text-[#1e3a5f]" />
            Gerenciar Etapas de Tarefas
          </DialogTitle>
          <DialogDescription>
            Configure as etapas do fluxo operacional das tarefas da empresa.
          </DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex border-b mb-2 gap-1">
          <TabButton active={aba === 'globais'} onClick={() => setAba('globais')}>
            Etapas Globais
          </TabButton>
          <TabButton active={aba === 'setores'} onClick={() => setAba('setores')}>
            Etapas por Setor
          </TabButton>
        </div>

        {!empresaId ? (
          <p className="text-sm text-slate-500 py-8 text-center">Empresa não identificada.</p>
        ) : aba === 'globais' ? (
          <AbaGlobais
            empresaId={empresaId}
            tarefas={tarefas}
            statusList={statusList}
            podeEditar={podeEditar}
            onStatusChanged={onStatusChanged}
            queryClient={queryClient}
          />
        ) : (
          <AbaSetores
            empresaId={empresaId}
            setoresList={setoresList}
            statusList={statusList}
            tarefas={tarefas}
            podeEditar={podeEditar}
            onStatusChanged={onStatusChanged}
            queryClient={queryClient}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
        active ? 'border-[#1e3a5f] text-[#1e3a5f] bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA: ETAPAS GLOBAIS
   ══════════════════════════════════════════════════════════════ */
function AbaGlobais({ empresaId, tarefas, statusList, podeEditar, onStatusChanged, queryClient }) {
  const [statusOrdenado, setStatusOrdenado] = useState([]);
  const [editando, setEditando] = useState(null);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState('#3b82f6');
  const [mostrarInativos, setMostrarInativos] = useState(false);

  // Carrega status do banco
  const { data: statusRaw = [] } = useQuery({
    queryKey: ['status-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const res = await base44.entities.StatusTarefa.filter({ empresa_id: empresaId });
      return Array.isArray(res) ? res.filter(isStatusValido) : [];
    },
  });

  const statusBase = useMemo(() => {
    const fromDb = (Array.isArray(statusRaw) && statusRaw.length > 0 ? statusRaw : STATUS_PADRAO)
      .filter(isStatusValido)
      .slice()
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
    return fromDb;
  }, [statusRaw]);

  useEffect(() => {
    setStatusOrdenado(statusBase);
  }, [statusBase]);

  // Contagem de tarefas por status
  const contagemPorStatus = useMemo(() => {
    const map = {};
    tarefas.forEach(t => {
      const key = t.status || 'sem_status';
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [tarefas]);

  // Slug da etapa padrão (primeira ativa)
  const etapaPadrao = useMemo(() => {
    const ativas = statusOrdenado.filter(s => s.ativo !== false);
    return ativas.length > 0 ? (ativas[0].slug || ativas[0].id) : null;
  }, [statusOrdenado]);

  const listaFiltrada = mostrarInativos
    ? statusOrdenado
    : statusOrdenado.filter(s => s.ativo !== false);

  // ── Mutations ──
  const salvarOrdem = async (lista) => {
    const updates = lista.map((s, idx) => ({ ...s, ordem: idx + 1 })).filter(s => s.id);
    if (updates.length === 0) return;
    try {
      await Promise.all(updates.map(s => base44.entities.StatusTarefa.update(s.id, { ordem: s.ordem })));
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      onStatusChanged?.();
    } catch { toast.error('Erro ao salvar ordem'); }
  };

  const onDragEnd = (result) => {
    if (!result.destination || !podeEditar) return;
    const nova = Array.from(statusOrdenado);
    const [moved] = nova.splice(result.source.index, 1);
    nova.splice(result.destination.index, 0, moved);
    const comOrdem = nova.map((s, idx) => ({ ...s, ordem: idx + 1 }));
    setStatusOrdenado(comOrdem);
    salvarOrdem(comOrdem);
  };

  const criarStatus = useMutation({
    mutationFn: (data) => base44.entities.StatusTarefa.create({
      ...data,
      empresa_id: empresaId,
      ativo: true,
      ordem: statusOrdenado.length + 1,
      slug: data.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      setNovoNome('');
      setNovaCor('#3b82f6');
      onStatusChanged?.();
      toast.success('Etapa criada!');
    },
  });

  const atualizarStatus = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StatusTarefa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      setEditando(null);
      onStatusChanged?.();
      toast.success('Etapa atualizada!');
    },
  });

  const toggleAtivo = async (s) => {
    if (!s.id) return;
    try {
      await base44.entities.StatusTarefa.update(s.id, { ativo: !(s.ativo !== false) });
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      onStatusChanged?.();
      toast.success(s.ativo !== false ? 'Etapa desativada' : 'Etapa ativada');
    } catch { toast.error('Erro ao alterar status'); }
  };

  const excluirStatus = (s) => {
    if (!s.id) return;
    const slug = s.slug || s.id;
    const qtd = contagemPorStatus[slug] || 0;
    const msg = qtd > 0
      ? `Esta etapa tem ${qtd} tarefa(s) vinculada(s). Ao excluir, as tarefas ficarão sem etapa definida. Deseja continuar?`
      : 'Excluir esta etapa?';
    if (!confirm(msg)) return;
    // Move tarefas para sem status (opcional: poderia mover para outra etapa)
    base44.entities.StatusTarefa.delete(s.id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      onStatusChanged?.();
      toast.success('Etapa excluída!');
    }).catch(() => toast.error('Erro ao excluir'));
  };

  const inicializarPadroes = async () => {
    if (!confirm('Criar os status padrão no banco para edição? Continuar?')) return;
    try {
      await Promise.all(STATUS_PADRAO.map(s =>
        base44.entities.StatusTarefa.create({
          empresa_id: empresaId, nome: s.nome, slug: s.slug, cor: s.cor, ordem: s.ordem, ativo: true, e_padrao: true,
        })
      ));
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      onStatusChanged?.();
      toast.success('Status padrão criados!');
    } catch { toast.error('Erro ao inicializar'); }
  };

  const temNoBanco = statusRaw.length > 0;

  return (
    <ScrollArea className="flex-1 pr-2">
      <div className="space-y-3 pb-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Arraste para reordenar as colunas do Kanban.</p>
          <div className="flex items-center gap-2">
            {!temNoBanco && podeEditar && (
              <Button variant="outline" size="sm" onClick={inicializarPadroes} className="text-xs h-7">
                Inicializar Padrões
              </Button>
            )}
            {podeEditar && (
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <Switch checked={mostrarInativos} onCheckedChange={setMostrarInativos} className="scale-75" />
                Inativas
              </label>
            )}
          </div>
        </div>

        {/* Lista de etapas */}
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="etapas-globais">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                {listaFiltrada.map((s, idx) => {
                  const slug = s.slug || s.id;
                  const qtd = contagemPorStatus[slug] || 0;
                  const isEditing = editando && (editando.id ? editando.id === s.id : editando.slug === s.slug);
                  const isPadrao = etapaPadrao === slug;

                  return (
                    <Draggable key={s.id || s.slug || idx} draggableId={String(s.id || s.slug || idx)} index={idx} isDragDisabled={!podeEditar}>
                      {(drag) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                            s.ativo === false ? 'bg-slate-100 opacity-60' : 'bg-white hover:border-slate-300'
                          } ${isPadrao ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20' : ''}`}
                        >
                          {podeEditar && (
                            <div {...drag.dragHandleProps} className="cursor-grab text-slate-300 hover:text-slate-500">
                              <GripVertical className="w-4 h-4" />
                            </div>
                          )}

                          {/* Cor */}
                          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor || '#3b82f6' }} />

                          {isEditing ? (
                            <div className="flex-1 flex items-center gap-2">
                              <Input
                                value={editando.nome}
                                onChange={e => setEditando({ ...editando, nome: e.target.value })}
                                className="flex-1 h-7 text-sm"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && atualizarStatus.mutate({ id: editando.id, data: { nome: editando.nome, cor: editando.cor } })}
                              />
                              <input type="color" value={editando.cor || '#3b82f6'} onChange={e => setEditando({ ...editando, cor: e.target.value })} className="h-7 w-9 rounded border cursor-pointer flex-shrink-0" />
                              <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700" onClick={() => atualizarStatus.mutate({ id: editando.id, data: { nome: editando.nome, cor: editando.cor } })}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditando(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-800">{s.nome}</span>
                                  {isPadrao && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title="Etapa padrão para novas tarefas" />}
                                  {s.ativo === false && <Badge variant="outline" className="text-xs py-0 text-slate-400">Inativa</Badge>}
                                </div>
                              </div>

                              {/* Contagem */}
                              <Badge variant="secondary" className="text-xs font-mono flex-shrink-0">
                                {qtd}
                              </Badge>

                              {podeEditar && (
                                <div className="flex items-center gap-0.5">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleAtivo(s)} title={s.ativo !== false ? 'Desativar' : 'Ativar'}>
                                    {s.ativo !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                    if (!s.id && statusRaw.length === 0) return inicializarPadroes();
                                    setEditando(s);
                                  }}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  {s.id && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => excluirStatus(s)}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {listaFiltrada.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Nenhuma etapa cadastrada.</p>
        )}

        {/* Criar nova etapa */}
        {podeEditar && (
          <div className="border rounded-lg p-3 bg-slate-50 space-y-2 mt-2">
            <Label className="text-xs font-semibold text-slate-600">Nova Etapa</Label>
            <div className="flex gap-2 items-center">
              <Input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Nome da etapa"
                className="flex-1 h-8 text-sm"
                onKeyDown={e => e.key === 'Enter' && novoNome.trim() && criarStatus.mutate({ nome: novoNome.trim(), cor: novaCor })}
              />
              <input type="color" value={novaCor} onChange={e => setNovaCor(e.target.value)} className="h-8 w-10 rounded border cursor-pointer flex-shrink-0" />
              <Button size="sm" onClick={() => {
                if (!novoNome.trim()) return toast.error('Informe o nome da etapa');
                criarStatus.mutate({ nome: novoNome.trim(), cor: novaCor });
              }} disabled={criarStatus.isPending} className="bg-[#1e3a5f] hover:bg-[#2a4a73] flex-shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA: ETAPAS POR SETOR
   ══════════════════════════════════════════════════════════════ */
function AbaSetores({ empresaId, setoresList, statusList, tarefas, podeEditar, onStatusChanged, queryClient }) {
  const [setorSelecionado, setSetorSelecionado] = useState(null);

  const setoresAtivos = setoresList.filter(s => s.status !== 'inativo');
  const setoresCombinados = setoresAtivos.length > 0
    ? setoresAtivos
    : [{ id: 'geral', nome: 'Geral' }];

  const { data: configSetores = {}, refetch: refetchConfig } = useQuery({
    queryKey: ['status-por-setor', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'status_por_setor' });
        if (configs.length > 0 && configs[0].valor) {
          return JSON.parse(configs[0].valor);
        }
      } catch {}
      return {};
    },
  });

  const salvarConfigSetores = async (novaConfig) => {
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'status_por_setor' });
      const valor = JSON.stringify(novaConfig);
      if (configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, { valor });
      } else {
        await base44.entities.ConfiguracaoSistema.create({ empresa_id: empresaId, chave: 'status_por_setor', valor });
      }
      refetchConfig();
    } catch { toast.error('Erro ao salvar configuração'); }
  };

  const statusAtivos = statusList.filter(s => s.ativo !== false);

  const getConfigSetor = (setorId) => configSetores[setorId] || { usar_especificas: false, status_slugs: [] };

  const toggleUsarEspecificas = async (setorId) => {
    const atual = getConfigSetor(setorId);
    const novo = { ...atual, usar_especificas: !atual.usar_especificas };
    if (!atual.usar_especificas && novo.status_slugs.length === 0) {
      // Ao ativar, copia todos os status globais como padrão
      novo.status_slugs = statusAtivos.map(s => s.slug || s.id);
    }
    await salvarConfigSetores({ ...configSetores, [setorId]: novo });
    toast.success(novo.usar_especificas ? 'Etapas específicas ativadas!' : 'Usando etapas globais');
    onStatusChanged?.();
  };

  const toggleStatusNoSetor = async (setorId, statusSlug, adicionar) => {
    const atual = getConfigSetor(setorId);
    let novosSlugs;
    if (adicionar) {
      novosSlugs = [...atual.status_slugs, statusSlug];
    } else {
      novosSlugs = atual.status_slugs.filter(s => s !== statusSlug);
    }
    const novo = { ...atual, status_slugs: novosSlugs };
    await salvarConfigSetores({ ...configSetores, [setorId]: novo });
    toast.success('Etapa ' + (adicionar ? 'adicionada' : 'removida'));
    onStatusChanged?.();
  };

  const reordenarSetor = async (setorId, novaOrdem) => {
    const atual = getConfigSetor(setorId);
    await salvarConfigSetores({ ...configSetores, [setorId]: { ...atual, status_slugs: novaOrdem } });
    toast.success('Ordem atualizada!');
    onStatusChanged?.();
  };

  return (
    <ScrollArea className="flex-1 pr-2">
      <div className="space-y-4 pb-4">
        <p className="text-xs text-slate-400">
          Configure etapas específicas por setor. Setores sem configuração usarão as etapas globais automaticamente.
        </p>

        {/* Lista de setores */}
        <div className="space-y-3">
          {setoresCombinados.map(setor => {
            const config = getConfigSetor(setor.id);
            const usandoEspecificas = config.usar_especificas;
            const statusDoSetor = usandoEspecificas
              ? config.status_slugs.map(slug => statusAtivos.find(s => (s.slug || s.id) === slug)).filter(Boolean)
              : statusAtivos;

            return (
              <div key={setor.id} className="border rounded-xl overflow-hidden">
                {/* Cabeçalho do setor */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{setor.nome}</span>
                    {usandoEspecificas && <Badge className="text-xs bg-[#1e3a5f] text-white">Específico</Badge>}
                  </div>
                  {podeEditar && (
                    <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                      <span>Etapas específicas</span>
                      <Switch checked={usandoEspecificas} onCheckedChange={() => toggleUsarEspecificas(setor.id)} className="scale-75" />
                    </label>
                  )}
                </div>

                {/* Etapas do setor */}
                <div className="p-3 space-y-1.5">
                  {usandoEspecificas && podeEditar ? (
                    <SetorEtapasEditor
                      setorId={setor.id}
                      statusAtivos={statusAtivos}
                      statusDoSetor={statusDoSetor}
                      onToggle={toggleStatusNoSetor}
                      onReorder={reordenarSetor}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {statusDoSetor.map(s => (
                        <Badge key={s.slug || s.id} variant="secondary" className="flex items-center gap-1 text-xs py-1">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.cor || '#3b82f6' }} />
                          {s.nome}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

function SetorEtapasEditor({ setorId, statusAtivos, statusDoSetor, onToggle, onReorder }) {
  const statusSlugsNoSetor = statusDoSetor.map(s => s.slug || s.id);
  const statusDisponiveis = statusAtivos.filter(s => !statusSlugsNoSetor.includes(s.slug || s.id));

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const nova = Array.from(statusSlugsNoSetor);
    const [moved] = nova.splice(result.source.index, 1);
    nova.splice(result.destination.index, 0, moved);
    onReorder(setorId, nova);
  };

  return (
    <div className="space-y-2">
      {/* Etapas atuais (ordenáveis) */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`setor-${setorId}`}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
              {statusDoSetor.map((s, idx) => (
                <Draggable key={s.slug || s.id} draggableId={`${setorId}-${s.slug || s.id}`} index={idx}>
                  {(drag) => (
                    <div ref={drag.innerRef} {...drag.draggableProps} className="flex items-center gap-2 p-2 bg-white rounded-lg border text-sm">
                      <div {...drag.dragHandleProps} className="cursor-grab text-slate-300">
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor || '#3b82f6' }} />
                      <span className="flex-1">{s.nome}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => onToggle(setorId, s.slug || s.id, false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Adicionar mais etapas */}
      {statusDisponiveis.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {statusDisponiveis.map(s => (
            <button
              key={s.slug || s.id}
              onClick={() => onToggle(setorId, s.slug || s.id, true)}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f] hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-3 h-3" />
              {s.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
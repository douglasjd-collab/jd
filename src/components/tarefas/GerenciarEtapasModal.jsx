import { carregarConfigStatusSetor, salvarConfigStatusSetor } from './statusSetorConfig';
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
  Layers, AlertTriangle, Star, Eye, EyeOff, FolderTree
} from 'lucide-react';
import SetoresManager from '@/components/tarefas/SetoresManager';

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
  const [aba, setAba] = useState('cadastros');
  const queryClient = useQueryClient();

  const isAdminPerfil = ['master', 'super_admin', 'admin'].includes(currentUser?.perfil);
  const isGerente = currentUser?.perfil === 'gerente';
  const podeEditar = isAdminPerfil || isGerente;

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Layers className="w-5 h-5 text-[#1e3a5f]" />
            Setores e status das tarefas
          </DialogTitle>
          <DialogDescription>
            Organize os setores, os tipos de serviço e os status das tarefas.
          </DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex border-b mb-2 gap-1 overflow-x-auto shrink-0">
          <TabButton active={aba === 'cadastros'} onClick={() => setAba('cadastros')}>
            Setores e subcategorias
          </TabButton>
          <TabButton active={aba === 'globais'} onClick={() => setAba('globais')}>
            Status das tarefas
          </TabButton>
          <TabButton active={aba === 'setores'} onClick={() => setAba('setores')}>
            Status por setor
          </TabButton>
        </div>

        {!empresaId ? (
          <p className="text-sm text-slate-500 py-8 text-center">Empresa não identificada.</p>
        ) : aba === 'cadastros' ? (
          <div className="flex-1 min-h-0 overflow-y-auto pr-2 pb-4">
            <p className="text-xs text-slate-500 mb-4">Setor é a área do serviço, como Consórcio. Subcategoria é o tipo de solicitação, como Ativação de cota. O andamento é definido na aba Status das tarefas.</p>
            <SetoresManager empresaId={empresaId} podeEditar={podeEditar} />
          </div>
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
      className={`px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${
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
    queryKey: ['status-tarefa', empresaId, 'gerenciamento'],
    enabled: !!empresaId,
    queryFn: async () => {
      const res = await base44.entities.StatusTarefa.filter({ empresa_id: empresaId });
      return Array.isArray(res) ? res.filter(s => isStatusValido(s) && !s.slug?.startsWith('setor_')) : [];
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
    mutationFn: (data) => {
      const nome = data.nome?.trim();
      const normalizar = v => v.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const slug = normalizar(nome || '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (!nome || !slug) throw new Error('Informe um nome válido para o status');
      if (statusBase.some(s => normalizar(s.nome) === normalizar(nome) || s.slug === slug)) throw new Error('Já existe um status com este nome');
      return base44.entities.StatusTarefa.create({
      ...data,
      empresa_id: empresaId,
      ativo: true,
      ordem: statusOrdenado.length + 1,
      slug,
    });
    },
    onError: e => toast.error(e.message || 'Erro ao criar status'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      setNovoNome('');
      setNovaCor('#3b82f6');
      onStatusChanged?.();
      toast.success('Etapa criada!');
    },
  });

  const atualizarStatus = useMutation({
    mutationFn: ({ id, data }) => {
      if (!id || !data.nome?.trim()) throw new Error('Informe o nome do status');
      if (statusBase.some(s => s.id !== id && s.nome.trim().toLocaleLowerCase('pt-BR') === data.nome.trim().toLocaleLowerCase('pt-BR'))) throw new Error('Já existe um status com este nome');
      return base44.entities.StatusTarefa.update(id, { ...data, nome: data.nome.trim() });
    },
    onError: e => toast.error(e.message || 'Erro ao atualizar status'),
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
    <div className="flex-1 min-h-0 overflow-y-auto pr-2">
      <div className="space-y-3 pb-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Crie e edite os status usados na lista e no Kanban. Arraste para reordenar.</p>
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
            <Label className="text-xs font-semibold text-slate-600">Novo status da tarefa</Label>
            <div className="flex gap-2 items-center">
              <Input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Nome do status"
                className="flex-1 h-8 text-sm"
                onKeyDown={e => e.key === 'Enter' && novoNome.trim() && criarStatus.mutate({ nome: novoNome.trim(), cor: novaCor })}
              />
              <input type="color" value={novaCor} onChange={e => setNovaCor(e.target.value)} className="h-8 w-10 rounded border cursor-pointer flex-shrink-0" />
              <Button size="sm" onClick={() => {
                if (!novoNome.trim()) return toast.error('Informe o nome da etapa');
                criarStatus.mutate({ nome: novoNome.trim(), cor: novaCor });
              }} disabled={criarStatus.isPending} className="bg-[#1e3a5f] hover:bg-[#2a4a73] flex-shrink-0">
                <Plus className="w-4 h-4 mr-1" /> Criar status
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA: ETAPAS POR SETOR
   ══════════════════════════════════════════════════════════════ */
function AbaSetores({ empresaId, setoresList, statusList, tarefas, podeEditar, onStatusChanged, queryClient }) {
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [novoStatus, setNovoStatus] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [editandoStatus, setEditandoStatus] = useState(null);
  const criarNoSetor = async (setor) => {
    const nome = (novoStatus[setor.id] || '').trim();
    if (!nome || salvando) return;
    const slugBase = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (!slugBase) return toast.error('Informe um nome válido');
    const slug = 'setor_' + setor.id + '_' + slugBase;
    const existente = statusList.find(s => s.slug === slug);
    setSalvando(true);
    try {
      if (!existente) await base44.entities.StatusTarefa.create({ empresa_id: empresaId, nome, slug, cor: '#3b82f6', ativo: true, ordem: statusList.length + 1 });
      const cfg = getConfigSetor(setor.id);
      await salvarConfigSetores({ ...configSetores, [setor.id]: { ...cfg, usar_especificas: true, status_slugs: [...(cfg.usar_especificas ? cfg.status_slugs.filter(s => s !== slug) : statusAtivos.filter(s => !s.slug?.startsWith('setor_')).map(s => s.slug || s.id)), slug] } });
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      setNovoStatus(v => ({ ...v, [setor.id]: '' }));
      onStatusChanged?.();
      toast.success('Status criado para ' + setor.nome);
    } catch (e) { toast.error(e.message || 'Erro ao criar status'); }
    finally { setSalvando(false); }
  };
  const salvarEdicao = async () => {
    if (!editandoStatus?.nome?.trim()) return toast.error('Informe o nome');
    try {
      await base44.entities.StatusTarefa.update(editandoStatus.id, { nome: editandoStatus.nome.trim(), cor: editandoStatus.cor });
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      setEditandoStatus(null);
      onStatusChanged?.();
      toast.success('Status atualizado');
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const setoresAtivos = setoresList.filter(s => s.status !== 'inativo');
  const setoresCombinados = setoresAtivos.length > 0
    ? setoresAtivos
    : [{ id: 'geral', nome: 'Geral' }];

  const { data: configSetores = {}, refetch: refetchConfig } = useQuery({
    queryKey: ['status-por-setor', empresaId],
    enabled: !!empresaId,
    queryFn: () => carregarConfigStatusSetor(empresaId),
  });

  const salvarConfigSetores = async (novaConfig) => {
    await salvarConfigStatusSetor(empresaId, novaConfig);
    queryClient.setQueryData(['status-por-setor', empresaId], novaConfig);
    await queryClient.invalidateQueries({ queryKey: ['status-por-setor', empresaId] });
  };

  const statusAtivos = statusList.filter(s => s.ativo !== false);

  const getConfigSetor = (setorId) => ({ usar_especificas: false, status_slugs: [], ...configSetores[setorId] });

  const toggleUsarEspecificas = async (setorId) => {
    if (salvando) return;
    setSalvando(true);
    try {
    const atual = getConfigSetor(setorId);
    const novo = { ...atual, usar_especificas: !atual.usar_especificas };
    if (!atual.usar_especificas && novo.status_slugs.length === 0) {
      // Ao ativar, copia todos os status globais como padrão
      novo.status_slugs = statusAtivos.filter(s => !s.slug?.startsWith('setor_') || s.slug.startsWith('setor_' + setorId + '_')).map(s => s.slug || s.id);
    }
    await salvarConfigSetores({ ...configSetores, [setorId]: novo });
    toast.success(novo.usar_especificas ? 'Status específicos ativados!' : 'Usando status globais');
    onStatusChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao configurar setor'); }
    finally { setSalvando(false); }
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
    <div className="flex-1 min-h-0 overflow-y-auto pr-2">
      <div className="space-y-4 pb-4">
        <p className="text-xs text-slate-500">Crie status próprios para cada setor ou escolha os status existentes. As alterações serão usadas nas tarefas desse setor.</p>

        {/* Editor de etapas por setor */}
        <div className="space-y-3">
          {setoresCombinados.map(setor => {
            const cfg = getConfigSetor(setor.id);
            const statusDoSetor = (cfg.status_slugs || [])
              .map(slug => statusAtivos.find(s => (s.slug || s.id) === slug))
              .filter(Boolean);
            return (
              <div key={setor.id} className="border rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="text-sm font-semibold text-slate-700">{setor.nome}</span>
                    {cfg.usar_especificas && <Badge className="text-[10px] py-0">Personalizado</Badge>}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer" title="Usar etapas específicas deste setor">
                    <Switch disabled={!podeEditar || salvando} checked={cfg.usar_especificas || false} onCheckedChange={() => podeEditar && toggleUsarEspecificas(setor.id)} className="scale-75" />
                    {cfg.usar_especificas ? 'Específicas' : 'Globais'}
                  </label>
                </div>
                {podeEditar && (
                  <div className="flex gap-2 my-3">
                    <Input placeholder={'Novo status de ' + setor.nome} value={novoStatus[setor.id] || ''} onChange={e => setNovoStatus(v => ({ ...v, [setor.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && criarNoSetor(setor)} />
                    <Button disabled={salvando || !(novoStatus[setor.id] || '').trim()} onClick={() => criarNoSetor(setor)}>Criar status</Button>
                  </div>
                )}
                {editandoStatus && statusDoSetor.some(s => s.id === editandoStatus.id) && (
                  <div className="flex gap-2 mb-3">
                    <Input value={editandoStatus.nome} onChange={e => setEditandoStatus(v => ({ ...v, nome: e.target.value }))} />
                    <input type="color" value={editandoStatus.cor || '#3b82f6'} onChange={e => setEditandoStatus(v => ({ ...v, cor: e.target.value }))} />
                    <Button onClick={salvarEdicao}>Salvar</Button>
                    <Button variant="ghost" onClick={() => setEditandoStatus(null)}>Cancelar</Button>
                  </div>
                )}
                {cfg.usar_especificas && (
                  <SetorEtapasEditor
                    setorId={setor.id}
                    statusAtivos={statusAtivos.filter(s => !s.slug?.startsWith('setor_') || s.slug.startsWith('setor_' + setor.id + '_'))}
                    podeEditar={podeEditar}
                    onEdit={setEditandoStatus}
                    statusDoSetor={statusDoSetor}
                    onToggle={podeEditar ? toggleStatusNoSetor : () => {}}
                    onReorder={podeEditar ? reordenarSetor : () => {}}
                  />
                )}
              </div>
            );
          })}
        </div>
       </div>
     </div>
   );
  }

  function SetorEtapasEditor({ setorId, statusAtivos, statusDoSetor, onToggle, onReorder, podeEditar, onEdit }) {
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
                <Draggable key={s.slug || s.id} draggableId={`${setorId}-${s.slug || s.id}`} index={idx} isDragDisabled={!podeEditar}>
                  {(drag) => (
                    <div ref={drag.innerRef} {...drag.draggableProps} className="flex items-center gap-2 p-2 bg-white rounded-lg border text-sm">
                      <div {...drag.dragHandleProps} className="cursor-grab text-slate-300">
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor || '#3b82f6' }} />
                      <span className="flex-1">{s.nome}</span>
                      {podeEditar && s.slug?.startsWith('setor_' + setorId + '_') && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(s)} title="Editar status deste setor"><Pencil className="w-3 h-3" /></Button>}
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
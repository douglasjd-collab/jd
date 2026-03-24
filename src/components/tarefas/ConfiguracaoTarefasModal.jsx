import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Check, X, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const STATUS_PADRAO = [
  { slug: 'a_fazer', nome: 'A Fazer', cor: '#f59e0b', ordem: 1, e_padrao: true },
  { slug: 'em_andamento', nome: 'Em Andamento', cor: '#3b82f6', ordem: 2, e_padrao: true },
  { slug: 'aguardando_cliente', nome: 'Aguardando Cliente', cor: '#8b5cf6', ordem: 3, e_padrao: true },
  { slug: 'aguardando_banco', nome: 'Aguardando Banco', cor: '#f97316', ordem: 4, e_padrao: true },
  { slug: 'concluido', nome: 'Concluído', cor: '#22c55e', ordem: 5, e_padrao: true },
  { slug: 'arquivado', nome: 'Arquivado', cor: '#94a3b8', ordem: 6, e_padrao: true },
];

const SETORES_PADRAO = ['Consórcio', 'Empréstimo', 'Financiamento', 'Proteção Veicular', 'Cobrança'];

function isStatusValido(s) {
  return s != null && typeof s === 'object' && typeof s.nome === 'string' && s.nome.trim().length > 0;
}

function ConteudoModal({ empresaId, onStatusChanged }) {
  const [aba, setAba] = useState('status');
  const [novoStatus, setNovoStatus] = useState({ nome: '', cor: '#3b82f6' });
  const [editStatus, setEditStatus] = useState(null);
  const [novoSetor, setNovoSetor] = useState('');
  const [editSetor, setEditSetor] = useState(null);
  const [novoStatusNome, setNovoStatusNome] = useState('');
  const [editStatusNome, setEditStatusNome] = useState(null);
  const [statusOrdenado, setStatusOrdenado] = useState([]);
  const queryClient = useQueryClient();

  // ── Status ──────────────────────────────────────────────
  const { data: statusRaw = [] } = useQuery({
    queryKey: ['status-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const res = await base44.entities.StatusTarefa.filter({ empresa_id: empresaId });
      if (!Array.isArray(res)) return [];
      return res.filter(isStatusValido);
    },
  });

  const statusBase = (Array.isArray(statusRaw) && statusRaw.length > 0 ? statusRaw : STATUS_PADRAO)
    .filter(isStatusValido)
    .slice()
    .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));

  // Sincroniza lista local quando dados chegam
  useEffect(() => {
    setStatusOrdenado(statusBase);
  }, [statusRaw]);

  const salvarOrdem = async (lista) => {
    const updates = lista
      .map((s, idx) => ({ ...s, ordem: idx + 1 }))
      .filter(s => s.id); // só salva os que têm id no banco
    try {
      await Promise.all(updates.map(s => base44.entities.StatusTarefa.update(s.id, { ordem: s.ordem })));
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      onStatusChanged?.();
      toast.success('Ordem salva!');
    } catch {
      toast.error('Erro ao salvar ordem');
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const nova = Array.from(statusOrdenado);
    const [moved] = nova.splice(result.source.index, 1);
    nova.splice(result.destination.index, 0, moved);
    const comOrdem = nova.map((s, idx) => ({ ...s, ordem: idx + 1 }));
    setStatusOrdenado(comOrdem);
    salvarOrdem(comOrdem);
  };

  const moverStatus = (idx, direcao) => {
    const nova = Array.from(statusOrdenado);
    const destino = idx + direcao;
    if (destino < 0 || destino >= nova.length) return;
    [nova[idx], nova[destino]] = [nova[destino], nova[idx]];
    const comOrdem = nova.map((s, i) => ({ ...s, ordem: i + 1 }));
    setStatusOrdenado(comOrdem);
    salvarOrdem(comOrdem);
  };

  const inicializarPadroes = async () => {
    if (!confirm('Isso vai criar os status padrão no banco para que você possa editá-los e reordená-los. Continuar?')) return;
    try {
      await Promise.all(
        STATUS_PADRAO.map(s =>
          base44.entities.StatusTarefa.create({
            empresa_id: empresaId,
            nome: s.nome,
            slug: s.slug,
            cor: s.cor,
            ordem: s.ordem,
            ativo: true,
            e_padrao: true,
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      onStatusChanged?.();
      toast.success('Status padrão criados! Agora você pode editá-los e reordená-los.');
    } catch {
      toast.error('Erro ao inicializar status padrão');
    }
  };

  const criarStatus = useMutation({
    mutationFn: (data) => base44.entities.StatusTarefa.create({
      ...data,
      empresa_id: empresaId,
      ativo: true,
      ordem: statusOrdenado.length + 1,
      slug: data.nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      setNovoStatus({ nome: '', cor: '#3b82f6' });
      toast.success('Status criado!');
      onStatusChanged?.();
    },
  });

  const atualizarStatus = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StatusTarefa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      setEditStatus(null);
      toast.success('Status atualizado!');
      onStatusChanged?.();
    },
  });

  const excluirStatus = useMutation({
    mutationFn: (id) => base44.entities.StatusTarefa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-tarefa'] });
      toast.success('Status excluído!');
      onStatusChanged?.();
    },
  });

  // ── Nomes de Status (label do campo status) ─────────────
  const STATUS_NOMES_PADRAO = ['Pendente', 'Em Análise', 'Aprovado', 'Reprovado', 'Cancelado'];

  const { data: statusNomesList = [] } = useQuery({
    queryKey: ['status-nomes-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'status_nomes_tarefa' });
        if (configs.length > 0 && configs[0].valor) {
          const parsed = JSON.parse(configs[0].valor);
          return Array.isArray(parsed) ? parsed.filter(t => t != null && typeof t === 'string') : STATUS_NOMES_PADRAO;
        }
      } catch {}
      return STATUS_NOMES_PADRAO;
    },
  });

  const salvarStatusNomes = async (novaLista) => {
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'status_nomes_tarefa' });
      if (configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, { valor: JSON.stringify(novaLista) });
      } else {
        await base44.entities.ConfiguracaoSistema.create({ empresa_id: empresaId, chave: 'status_nomes_tarefa', valor: JSON.stringify(novaLista) });
      }
      queryClient.invalidateQueries({ queryKey: ['status-nomes-tarefa'] });
    } catch {
      toast.error('Erro ao salvar status');
    }
  };

  const adicionarStatusNome = async () => {
    const nome = novoStatusNome.trim();
    if (!nome) return toast.error('Informe o nome do status');
    if (statusNomesList.includes(nome)) return toast.error('Status já existe');
    await salvarStatusNomes([...statusNomesList, nome]);
    setNovoStatusNome('');
    toast.success('Status adicionado!');
  };

  const excluirStatusNome = async (s) => {
    if (!confirm(`Excluir status "${s}"?`)) return;
    await salvarStatusNomes(statusNomesList.filter(t => t !== s));
    toast.success('Status excluído!');
  };

  const atualizarStatusNome = async () => {
    if (!editStatusNome?.nome?.trim()) return toast.error('Informe o nome');
    await salvarStatusNomes(statusNomesList.map(t => t === editStatusNome.original ? editStatusNome.nome : t));
    setEditStatusNome(null);
    toast.success('Status atualizado!');
  };

  // ── Setores ─────────────────────────────────────────────
  const { data: setoresList = [] } = useQuery({
    queryKey: ['setores-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'setores_tarefa' });
        if (configs.length > 0 && configs[0].valor) {
          const parsed = JSON.parse(configs[0].valor);
          return Array.isArray(parsed) ? parsed.filter(t => t != null && typeof t === 'string') : SETORES_PADRAO;
        }
      } catch {}
      return SETORES_PADRAO;
    },
  });

  const salvarSetores = async (novaLista) => {
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'setores_tarefa' });
      if (configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, { valor: JSON.stringify(novaLista) });
      } else {
        await base44.entities.ConfiguracaoSistema.create({ empresa_id: empresaId, chave: 'setores_tarefa', valor: JSON.stringify(novaLista) });
      }
      queryClient.invalidateQueries({ queryKey: ['setores-tarefa'] });
    } catch {
      toast.error('Erro ao salvar setores');
    }
  };

  const adicionarSetor = async () => {
    const nome = novoSetor.trim();
    if (!nome) return toast.error('Informe o nome do setor');
    if (setoresList.includes(nome)) return toast.error('Setor já existe');
    await salvarSetores([...setoresList, nome]);
    setNovoSetor('');
    toast.success('Setor adicionado!');
  };

  const excluirSetor = async (setor) => {
    if (!confirm(`Excluir setor "${setor}"?`)) return;
    await salvarSetores(setoresList.filter(t => t !== setor));
    toast.success('Setor excluído!');
  };

  const atualizarSetor = async () => {
    if (!editSetor?.nome?.trim()) return toast.error('Informe o nome');
    await salvarSetores(setoresList.map(t => t === editSetor.original ? editSetor.nome : t));
    setEditSetor(null);
    toast.success('Setor atualizado!');
  };

  // lista a exibir: usa statusOrdenado se já foi preenchido, senão statusBase
  const listaExibir = statusOrdenado.length > 0 ? statusOrdenado : statusBase;

  return (
    <>
      {/* Abas */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setAba('status')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === 'status' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Quadros (Status)
        </button>
        <button
          onClick={() => setAba('status_nomes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === 'status_nomes' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Status
        </button>
        <button
          onClick={() => setAba('setores')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === 'setores' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Setores
        </button>
      </div>

      <div className="overflow-y-auto flex-1 space-y-3 pr-1">

        {/* ── ABA STATUS / QUADROS ── */}
        {aba === 'status' && (
          <>
            {statusRaw.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-amber-700">Os status padrão estão apenas no sistema. Inicialize-os para poder editar e reordenar.</p>
                <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100 flex-shrink-0 text-xs" onClick={inicializarPadroes}>
                  Inicializar
                </Button>
              </div>
            )}
            <p className="text-xs text-slate-400 mb-1">Arraste ou use as setas para reordenar os quadros.</p>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="status-list">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {listaExibir.map((s, idx) => (
                      <Draggable key={s.id || s.slug || idx} draggableId={String(s.id || s.slug || idx)} index={idx}>
                        {(drag) => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border"
                          >
                            {/* Handle drag */}
                            <div {...drag.dragHandleProps} className="cursor-grab text-slate-300 hover:text-slate-500">
                              <GripVertical className="w-4 h-4" />
                            </div>

                            <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor || '#3b82f6' }} />

                            {editStatus?.id === s.id && s.id ? (
                              <>
                                <Input value={editStatus.nome} onChange={e => setEditStatus({ ...editStatus, nome: e.target.value })} className="flex-1 h-7 text-sm" />
                                <input type="color" value={editStatus.cor || '#3b82f6'} onChange={e => setEditStatus({ ...editStatus, cor: e.target.value })} className="h-7 w-10 rounded border cursor-pointer" />
                                <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700" onClick={() => atualizarStatus.mutate({ id: editStatus.id, data: { nome: editStatus.nome, cor: editStatus.cor } })}>
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditStatus(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm font-medium">{s.nome}</span>

                                {/* Setas de ordem */}
                                <div className="flex flex-col">
                                  <button onClick={() => moverStatus(idx, -1)} disabled={idx === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none">
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => moverStatus(idx, 1)} disabled={idx === listaExibir.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none">
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {s.e_padrao && <Badge variant="outline" className="text-xs py-0">Padrão</Badge>}
                                {s.id && (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditStatus(s)}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700"
                                      onClick={() => { if (confirm('Excluir este status?')) excluirStatus.mutate(s.id); }}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <div className="border rounded-lg p-3 bg-slate-50 space-y-2 mt-2">
              <Label className="text-xs font-semibold text-slate-600">Novo Quadro</Label>
              <div className="flex gap-2 items-center">
                <Input
                  value={novoStatus.nome}
                  onChange={e => setNovoStatus({ ...novoStatus, nome: e.target.value })}
                  placeholder="Ex: Em aprovação"
                  className="flex-1 h-8 text-sm"
                  onKeyDown={e => e.key === 'Enter' && criarStatus.mutate(novoStatus)}
                />
                <input type="color" value={novoStatus.cor} onChange={e => setNovoStatus({ ...novoStatus, cor: e.target.value })} className="h-8 w-12 rounded border cursor-pointer flex-shrink-0" />
                <Button
                  size="sm"
                  onClick={() => { if (!novoStatus.nome.trim()) return toast.error('Informe o nome'); criarStatus.mutate(novoStatus); }}
                  disabled={criarStatus.isPending}
                  className="bg-[#1e3a5f] hover:bg-[#2a4a73] flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── ABA SETORES ── */}
        {aba === 'setores' && (
          <>
            <div className="space-y-2">
              {setoresList.filter(t => t != null && typeof t === 'string').map((setor, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border">
                  {editSetor?.original === setor ? (
                    <>
                      <Input
                        value={editSetor.nome}
                        onChange={e => setEditSetor({ ...editSetor, nome: e.target.value })}
                        className="flex-1 h-7 text-sm"
                        onKeyDown={e => e.key === 'Enter' && atualizarSetor()}
                      />
                      <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700" onClick={atualizarSetor}>
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditSetor(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{setor}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditSetor({ original: setor, nome: setor })}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => excluirSetor(setor)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {setoresList.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhum setor cadastrado.</p>}
            </div>

            <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
              <Label className="text-xs font-semibold text-slate-600">Novo Setor</Label>
              <div className="flex gap-2">
                <Input
                  value={novoSetor}
                  onChange={e => setNovoSetor(e.target.value)}
                  placeholder="Ex: Jurídico, Marketing..."
                  className="flex-1 h-8 text-sm"
                  onKeyDown={e => e.key === 'Enter' && adicionarSetor()}
                />
                <Button size="sm" onClick={adicionarSetor} className="bg-[#1e3a5f] hover:bg-[#2a4a73] flex-shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function ConfiguracaoTarefasModal({ open, onOpenChange, empresaId, onStatusChanged }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⚙️ Configurações de Tarefas
          </DialogTitle>
        </DialogHeader>
        {open && empresaId && (
          <ConteudoModal empresaId={empresaId} onStatusChanged={onStatusChanged} />
        )}
        {open && !empresaId && (
          <p className="text-sm text-slate-500 py-6 text-center">Empresa não identificada.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  ChevronDown, ChevronRight, Plus, Loader2, MoreVertical,
  Pencil, Trash2, Copy, ArrowRight, GripVertical,
  Users, Zap, Archive, Settings, LayoutGrid, TrendingUp,
  ArrowUp, ArrowDown, CheckSquare, MessageSquare, Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const FUNIS_FIXOS = [
  { value: 'consorcio', label: 'Consórcio', emoji: '🏦' },
  { value: 'emprestimo', label: 'Empréstimo Consignado', emoji: '💳' },
];

const CORES_ETAPA = [
  { nome: 'Azul', valor: '#3b82f6' },
  { nome: 'Verde', valor: '#10b981' },
  { nome: 'Amarelo', valor: '#f59e0b' },
  { nome: 'Vermelho', valor: '#ef4444' },
  { nome: 'Roxo', valor: '#8b5cf6' },
  { nome: 'Rosa', valor: '#ec4899' },
  { nome: 'Cinza', valor: '#6b7280' },
  { nome: 'Laranja', valor: '#f97316' },
  { nome: 'Teal', valor: '#14b8a6' },
  { nome: 'Índigo', valor: '#6366f1' },
];

const TIPO_LABELS = {
  aberta: { label: 'Em andamento', color: 'bg-blue-100 text-blue-700' },
  ganho: { label: 'Ganho', color: 'bg-green-100 text-green-700' },
  perdida: { label: 'Perdida', color: 'bg-red-100 text-red-700' },
  planejamento: { label: 'Planejamento', color: 'bg-purple-100 text-purple-700' },
};

function EtapaCard({ etapa, index, onEdit, onDelete, funil, etapasDoFunil }) {
  const tipo = TIPO_LABELS[etapa.tipo] || TIPO_LABELS.aberta;
  const isPrefixada = ['ganho', 'perdida', 'planejamento'].includes(etapa.tipo);

  return (
    <Draggable draggableId={etapa.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`group relative bg-white border rounded-xl p-3 flex items-center gap-3 transition-all ${
            snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400 rotate-1' : 'hover:shadow-md border-slate-200'
          }`}
        >
          {/* Drag handle */}
          <div {...provided.dragHandleProps} className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0">
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Cor da etapa */}
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: etapa.cor }} />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-800 text-sm truncate">{etapa.nome}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tipo.color}`}>{tipo.label}</span>
              {etapa.requer_cliente && <span className="text-xs text-slate-400">• Cliente</span>}
              {etapa.requer_documentos && <span className="text-xs text-slate-400">• Docs</span>}
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600"
              onClick={() => onEdit(etapa)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {!isPrefixada && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500"
                onClick={() => onDelete(etapa.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {isPrefixada && (
              <span className="text-xs text-slate-300 px-2">🔒</span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

function FunilCard({ funil, oportunidades, onRename, onDelete, onDuplicate, onAddEtapa, onEditEtapa, onDeleteEtapa, onReorder }) {
  const [expanded, setExpanded] = useState(false);
  const leadsAtivos = oportunidades.filter(o => o.produto === funil.slug && o.status !== 'ganha' && o.status !== 'perdida').length;

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    const sorted = [...funil.etapas].sort((a, b) => a.ordem - b.ordem);
    const [moved] = sorted.splice(result.source.index, 1);
    sorted.splice(result.destination.index, 0, moved);
    // Atualizar ordens
    sorted.forEach((etapa, idx) => {
      if (etapa.ordem !== idx + 1) {
        onReorder(etapa.id, idx + 1);
      }
    });
  };

  const emojiFunil = FUNIS_FIXOS.find(f => f.value === funil.slug)?.emoji || '📋';
  const corPrincipal = funil.etapas[0]?.cor || '#3b82f6';

  return (
    <Card className="overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all">
      {/* Faixa de cor topo */}
      <div className="h-1 w-full" style={{ backgroundColor: corPrincipal }} />

      {/* Header do card */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {/* Info principal */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ backgroundColor: corPrincipal + '20' }}>
              {emojiFunil}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base">{funil.label}</h3>
                {funil.fixo && (
                  <Badge className="text-xs bg-slate-100 text-slate-500 border-none font-normal">Padrão</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3" />
                  {funil.etapas.length} etapas
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {leadsAtivos} leads ativos
                </span>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-8 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {expanded ? 'Fechar' : 'Ver etapas'}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => { setExpanded(true); onAddEtapa(funil.slug); }}>
                  <Plus className="w-4 h-4 mr-2 text-blue-600" />
                  Nova Etapa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRename(funil)}>
                  <Pencil className="w-4 h-4 mr-2 text-slate-500" />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(funil)}>
                  <Copy className="w-4 h-4 mr-2 text-slate-500" />
                  Duplicar Funil
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(funil.slug)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Funil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Preview das etapas (inline, sempre visível) */}
        {!expanded && funil.etapas.length > 0 && (
          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {[...funil.etapas].sort((a, b) => a.ordem - b.ordem).map((etapa, idx) => (
              <React.Fragment key={etapa.id}>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: etapa.cor }} />
                    <span className="text-xs text-slate-600 font-medium whitespace-nowrap">{etapa.nome}</span>
                  </div>
                </div>
                {idx < funil.etapas.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Expansão: etapas em formato visual com drag & drop */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-700 text-sm">Etapas do Funil</h4>
            <Button size="sm" className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-1 h-7 text-xs"
              onClick={() => onAddEtapa(funil.slug)}>
              <Plus className="w-3.5 h-3.5" /> Nova Etapa
            </Button>
          </div>

          {funil.etapas.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <LayoutGrid className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma etapa. Crie a primeira!</p>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId={funil.slug}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {[...funil.etapas].sort((a, b) => a.ordem - b.ordem).map((etapa, idx) => (
                      <EtapaCard
                        key={etapa.id}
                        etapa={etapa}
                        index={idx}
                        onEdit={onEditEtapa}
                        onDelete={onDeleteEtapa}
                        funil={funil}
                        etapasDoFunil={funil.etapas}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ConfiguracaoFunis() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [etapaFormOpen, setEtapaFormOpen] = useState(false);
  const [selectedEtapa, setSelectedEtapa] = useState(null);
  const [selectedFunilSlug, setSelectedFunilSlug] = useState(null);
  const [deleteEtapaId, setDeleteEtapaId] = useState(null);
  const [deleteFunilSlug, setDeleteFunilSlug] = useState(null);
  const [renameFunil, setRenameFunil] = useState(null);
  const [etapaForm, setEtapaForm] = useState({
    nome: '', ordem: '', cor: '#3b82f6', tipo: 'aberta',
    requer_cliente: false, requer_documentos: false, status: 'ativa',
  });

  useEffect(() => {
    base44.auth.me().then(u => {
      if (u && u.role !== 'super_admin') {
        base44.entities.Colaborador.filter({ user_id: u.id }).then(colabs => {
          const colab = colabs.find(c => c.status === 'ativo' && c.empresa_id) || colabs[0];
          setCurrentUser({ ...u, empresa_id: colab?.empresa_id || u.empresa_id, perfil: colab?.perfil || u.role });
        });
      } else {
        setCurrentUser({ ...u, perfil: 'super_admin' });
      }
    });
  }, []);

  const { data: etapas = [], isLoading } = useQuery({
    queryKey: ['etapas-funil-config'],
    enabled: !!currentUser,
    queryFn: () => base44.entities.EtapaFunil.list('ordem', 500),
  });

  const { data: oportunidades = [] } = useQuery({
    queryKey: ['oportunidades-funil-config'],
    enabled: !!currentUser,
    queryFn: () => base44.entities.Oportunidade.list(),
  });

  const funis = useMemo(() => {
    const slugs = [...new Set(etapas.map(e => e.produto || 'sem_funil').filter(Boolean))];
    const fixosSlugs = FUNIS_FIXOS.map(f => f.value);
    const todos = [
      ...fixosSlugs.filter(s => slugs.includes(s)),
      ...slugs.filter(s => !fixosSlugs.includes(s)),
    ];
    return todos.map(slug => {
      const fixo = FUNIS_FIXOS.find(f => f.value === slug);
      const etapasDoFunil = etapas.filter(e => (e.produto || 'sem_funil') === slug).sort((a, b) => a.ordem - b.ordem);
      const label = fixo?.label || (slug === 'sem_funil' ? 'Sem Funil' : slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
      return { slug, label, fixo: !!fixo, etapas: etapasDoFunil };
    });
  }, [etapas]);

  const createEtapaMutation = useMutation({
    mutationFn: (data) => base44.entities.EtapaFunil.create({
      ...data, empresa_id: currentUser?.empresa_id, produto: selectedFunilSlug, status: 'ativa',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setEtapaFormOpen(false); resetEtapaForm(); toast.success('Etapa criada!');
    },
    onError: (e) => toast.error(e.message),
  });

  const updateEtapaMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const etapa = etapas.find(e => e.id === id);
      return base44.entities.EtapaFunil.update(id, { ...data, empresa_id: etapa?.empresa_id || currentUser?.empresa_id, produto: etapa?.produto });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setEtapaFormOpen(false); setSelectedEtapa(null); resetEtapaForm(); toast.success('Etapa atualizada!');
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteEtapaMutation = useMutation({
    mutationFn: (id) => base44.entities.EtapaFunil.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setDeleteEtapaId(null); toast.success('Etapa excluída!');
    },
  });

  const deleteFunilMutation = useMutation({
    mutationFn: async (slug) => {
      const etapasDoFunil = etapas.filter(e => e.produto === slug);
      for (const e of etapasDoFunil) await base44.entities.EtapaFunil.delete(e.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setDeleteFunilSlug(null); toast.success('Funil excluído!');
    },
    onError: (e) => toast.error(e.message),
  });

  const renameFunilMutation = useMutation({
    mutationFn: async ({ slug, novoNome }) => {
      const etapasDoFunil = etapas.filter(e => e.produto === slug);
      const novoSlug = novoNome.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      for (const e of etapasDoFunil) {
        await base44.entities.EtapaFunil.update(e.id, { ...e, produto: novoSlug });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setRenameFunil(null); toast.success('Funil renomeado!');
    },
    onError: (e) => toast.error(e.message),
  });

  const duplicarFunilMutation = useMutation({
    mutationFn: async ({ slug, novoNome }) => {
      const etapasDoFunil = etapas.filter(e => e.produto === slug).sort((a, b) => a.ordem - b.ordem);
      const novoSlug = novoNome.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_copia_' + Date.now();
      for (const e of etapasDoFunil) {
        await base44.entities.EtapaFunil.create({
          nome: e.nome, cor: e.cor, tipo: e.tipo, ordem: e.ordem,
          requer_cliente: e.requer_cliente, requer_documentos: e.requer_documentos,
          status: 'ativa', empresa_id: currentUser?.empresa_id, produto: novoSlug,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      toast.success('Funil duplicado com sucesso!');
    },
    onError: (e) => toast.error(e.message),
  });

  const reordenarMutation = useMutation({
    mutationFn: ({ id, novaOrdem }) => base44.entities.EtapaFunil.update(id, { ordem: novaOrdem }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
    },
  });

  const resetEtapaForm = () => {
    setEtapaForm({ nome: '', ordem: '', cor: '#3b82f6', tipo: 'aberta', requer_cliente: false, requer_documentos: false, status: 'ativa' });
  };

  const handleSubmitEtapa = () => {
    if (!etapaForm.nome.trim()) { toast.error('Informe o nome da etapa'); return; }
    const data = { ...etapaForm, ordem: parseInt(etapaForm.ordem) || etapas.length + 1 };
    if (selectedEtapa) updateEtapaMutation.mutate({ id: selectedEtapa.id, data });
    else createEtapaMutation.mutate(data);
  };

  if (isLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to={createPageUrl('FunilVendas')} className="text-slate-400 hover:text-slate-600 text-sm transition-colors">
              ← Funil de Vendas
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Configuração de Funis</h1>
          <p className="text-slate-500 text-sm mt-0.5">Gerencie funis, etapas e fluxos de venda</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm px-3 py-1">{funis.length} funis</Badge>
        </div>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Total de Funis</p>
          <p className="text-2xl font-bold text-slate-800">{funis.length}</p>
        </Card>
        <Card className="p-4 border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Total de Etapas</p>
          <p className="text-2xl font-bold text-slate-800">{etapas.length}</p>
        </Card>
        <Card className="p-4 border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Leads Ativos</p>
          <p className="text-2xl font-bold text-slate-800">
            {oportunidades.filter(o => o.status !== 'ganha' && o.status !== 'perdida').length}
          </p>
        </Card>
      </div>

      {/* Lista de funis */}
      {funis.length === 0 ? (
        <Card className="p-10 text-center text-slate-400 border-dashed border-2">
          <Settings className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum funil configurado</p>
          <p className="text-sm mt-1">Vá ao Funil de Vendas e crie seu primeiro funil.</p>
          <Link to={createPageUrl('FunilVendas')}>
            <Button className="mt-4 bg-[#1e3a5f] hover:bg-[#2a4a73]">Ir para Funil de Vendas</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {funis.map((funil) => (
            <FunilCard
              key={funil.slug}
              funil={funil}
              oportunidades={oportunidades}
              onRename={(f) => setRenameFunil({ slug: f.slug, novoNome: f.label })}
              onDelete={(slug) => setDeleteFunilSlug(slug)}
              onDuplicate={(f) => duplicarFunilMutation.mutate({ slug: f.slug, novoNome: f.label })}
              onAddEtapa={(slug) => {
                setSelectedFunilSlug(slug);
                setSelectedEtapa(null);
                resetEtapaForm();
                setEtapaFormOpen(true);
              }}
              onEditEtapa={(etapa) => {
                setSelectedEtapa(etapa);
                setSelectedFunilSlug(etapa.produto);
                setEtapaForm({
                  nome: etapa.nome, ordem: etapa.ordem.toString(), cor: etapa.cor,
                  tipo: etapa.tipo, requer_cliente: etapa.requer_cliente || false,
                  requer_documentos: etapa.requer_documentos || false, status: etapa.status,
                });
                setEtapaFormOpen(true);
              }}
              onDeleteEtapa={(id) => setDeleteEtapaId(id)}
              onReorder={(id, novaOrdem) => reordenarMutation.mutate({ id, novaOrdem })}
            />
          ))}
        </div>
      )}

      {/* Modal criar/editar etapa */}
      <Dialog open={etapaFormOpen} onOpenChange={setEtapaFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-600" />
              {selectedEtapa ? 'Editar Etapa' : 'Nova Etapa'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Etapa *</Label>
              <Input value={etapaForm.nome} onChange={e => setEtapaForm({ ...etapaForm, nome: e.target.value })}
                placeholder="Ex: Em Análise" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cor</Label>
                <div className="flex gap-2 items-center mt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {CORES_ETAPA.map(cor => (
                      <button key={cor.valor} onClick={() => setEtapaForm({ ...etapaForm, cor: cor.valor })}
                        className={`w-6 h-6 rounded-full transition-all ${etapaForm.cor === cor.valor ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                        style={{ backgroundColor: cor.valor }} title={cor.nome} />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label>Tipo</Label>
                <Select value={etapaForm.tipo} onValueChange={v => setEtapaForm({ ...etapaForm, tipo: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">🔵 Em andamento</SelectItem>
                    <SelectItem value="ganho">🟢 Ganho (conversão)</SelectItem>
                    <SelectItem value="perdida">🔴 Perdida</SelectItem>
                    <SelectItem value="planejamento">🟣 Planejamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-xl p-4 space-y-3 bg-slate-50">
              <h4 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                <CheckSquare className="w-4 h-4" /> Regras desta Etapa
              </h4>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Requer cliente vinculado</p>
                  <p className="text-xs text-slate-400">Obriga vincular um cliente antes de avançar</p>
                </div>
                <Switch checked={etapaForm.requer_cliente}
                  onCheckedChange={v => setEtapaForm({ ...etapaForm, requer_cliente: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Requer documentos</p>
                  <p className="text-xs text-slate-400">Obriga anexar documentos</p>
                </div>
                <Switch checked={etapaForm.requer_documentos}
                  onCheckedChange={v => setEtapaForm({ ...etapaForm, requer_documentos: v })} />
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white border rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-2">Preview da etapa</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 w-fit">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: etapaForm.cor }} />
                <span className="text-sm font-medium text-slate-700">{etapaForm.nome || 'Nome da etapa'}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIPO_LABELS[etapaForm.tipo]?.color}`}>
                  {TIPO_LABELS[etapaForm.tipo]?.label}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEtapaFormOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmitEtapa}
                disabled={createEtapaMutation.isPending || updateEtapaMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
                {(createEtapaMutation.isPending || updateEtapaMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedEtapa ? 'Salvar Alterações' : 'Criar Etapa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal renomear funil */}
      <Dialog open={!!renameFunil} onOpenChange={() => setRenameFunil(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Renomear Funil</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Novo nome do funil</Label>
              <Input className="mt-1" value={renameFunil?.novoNome || ''}
                onChange={e => setRenameFunil(r => ({ ...r, novoNome: e.target.value }))}
                placeholder="Ex: Financiamento Veículos" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRenameFunil(null)}>Cancelar</Button>
              <Button onClick={() => { if (!renameFunil?.novoNome?.trim()) { toast.error('Digite um nome'); return; } renameFunilMutation.mutate(renameFunil); }}
                disabled={renameFunilMutation.isPending} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
                {renameFunilMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar excluir etapa */}
      <AlertDialog open={!!deleteEtapaId} onOpenChange={() => setDeleteEtapaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta etapa?</AlertDialogTitle>
            <AlertDialogDescription>Os leads nesta etapa não serão excluídos, mas ficarão sem etapa vinculada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteEtapaMutation.mutate(deleteEtapaId)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar excluir funil */}
      <AlertDialog open={!!deleteFunilSlug} onOpenChange={() => setDeleteFunilSlug(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funil?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as <strong>{funis.find(f => f.slug === deleteFunilSlug)?.etapas.length}</strong> etapas deste funil serão excluídas permanentemente. Os leads vinculados não serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteFunilMutation.mutate(deleteFunilSlug)} className="bg-red-600 hover:bg-red-700">
              {deleteFunilMutation.isPending ? 'Excluindo...' : 'Excluir Funil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
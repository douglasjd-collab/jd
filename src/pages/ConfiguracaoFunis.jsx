import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Pencil, Trash2, Plus, ArrowUp, ArrowDown, Settings2, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const FUNIS_FIXOS = [
  { value: 'consorcio', label: 'Consórcio' },
  { value: 'emprestimo', label: 'Empréstimo Consignado' },
];

const coresDisponiveis = [
  { nome: 'Azul', valor: '#3b82f6' },
  { nome: 'Verde', valor: '#10b981' },
  { nome: 'Amarelo', valor: '#f59e0b' },
  { nome: 'Vermelho', valor: '#ef4444' },
  { nome: 'Roxo', valor: '#8b5cf6' },
  { nome: 'Rosa', valor: '#ec4899' },
  { nome: 'Cinza', valor: '#6b7280' },
  { nome: 'Laranja', valor: '#f97316' },
  { nome: 'Teal', valor: '#14b8a6' },
];

export default function ConfiguracaoFunis() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [expandedFunil, setExpandedFunil] = useState(null);
  const [etapaFormOpen, setEtapaFormOpen] = useState(false);
  const [selectedEtapa, setSelectedEtapa] = useState(null);
  const [selectedFunilSlug, setSelectedFunilSlug] = useState(null);
  const [deleteEtapaId, setDeleteEtapaId] = useState(null);
  const [deleteFunilSlug, setDeleteFunilSlug] = useState(null);
  const [renameFunil, setRenameFunil] = useState(null); // { slug, novoNome }
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
    queryFn: () => base44.entities.EtapaFunil.filter({ status: 'ativa' }, 'ordem'),
  });

  // Agrupar etapas por funil (produto)
  const funis = useMemo(() => {
    const slugs = [...new Set(etapas.map(e => e.produto).filter(Boolean))];
    const fixosSlugs = FUNIS_FIXOS.map(f => f.value);

    // Funis fixos sempre primeiro, depois os criados
    const todos = [
      ...fixosSlugs.filter(s => slugs.includes(s)),
      ...slugs.filter(s => !fixosSlugs.includes(s)),
    ];

    return todos.map(slug => {
      const fixo = FUNIS_FIXOS.find(f => f.value === slug);
      // Pegar o nome do funil (da primeira etapa ou da etapa-raiz criada pelo usuário)
      const etapasDoFunil = etapas.filter(e => e.produto === slug).sort((a, b) => a.ordem - b.ordem);
      const label = fixo?.label || etapasDoFunil[0]?.nome || slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { slug, label, fixo: !!fixo, etapas: etapasDoFunil };
    });
  }, [etapas]);

  const createEtapaMutation = useMutation({
    mutationFn: (data) => base44.entities.EtapaFunil.create({
      ...data,
      empresa_id: currentUser?.empresa_id,
      produto: selectedFunilSlug,
      status: 'ativa',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setEtapaFormOpen(false);
      resetEtapaForm();
      toast.success('Etapa criada!');
    },
    onError: (e) => toast.error(e.message),
  });

  const updateEtapaMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const etapa = etapas.find(e => e.id === id);
      return base44.entities.EtapaFunil.update(id, {
        ...data,
        empresa_id: etapa?.empresa_id || currentUser?.empresa_id,
        produto: etapa?.produto,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setEtapaFormOpen(false);
      setSelectedEtapa(null);
      resetEtapaForm();
      toast.success('Etapa atualizada!');
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteEtapaMutation = useMutation({
    mutationFn: (id) => base44.entities.EtapaFunil.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setDeleteEtapaId(null);
      toast.success('Etapa excluída!');
    },
  });

  // Excluir funil = excluir todas as etapas do slug
  const deleteFunilMutation = useMutation({
    mutationFn: async (slug) => {
      const etapasDoFunil = etapas.filter(e => e.produto === slug);
      for (const e of etapasDoFunil) {
        await base44.entities.EtapaFunil.delete(e.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setDeleteFunilSlug(null);
      if (expandedFunil === deleteFunilSlug) setExpandedFunil(null);
      toast.success('Funil excluído!');
    },
    onError: (e) => toast.error(e.message),
  });

  // Renomear funil = renomear a primeira etapa (nome-do-funil) e atualizar o produto slug
  const renameFunilMutation = useMutation({
    mutationFn: async ({ slug, novoNome }) => {
      const etapasDoFunil = etapas.filter(e => e.produto === slug);
      const novoSlug = novoNome.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      for (const e of etapasDoFunil) {
        await base44.entities.EtapaFunil.update(e.id, {
          ...e,
          produto: novoSlug,
          // Se era a etapa principal (nome = nome do funil), renomear também
          nome: e.ordem === Math.min(...etapasDoFunil.map(x => x.ordem)) ? novoNome : e.nome,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      setRenameFunil(null);
      toast.success('Funil renomeado!');
    },
    onError: (e) => toast.error(e.message),
  });

  const reordenarMutation = useMutation({
    mutationFn: async ({ id, novaOrdem, etapaAdjacenteId, ordemAdjacente }) => {
      await base44.entities.EtapaFunil.update(id, { ordem: novaOrdem });
      if (etapaAdjacenteId) {
        await base44.entities.EtapaFunil.update(etapaAdjacenteId, { ordem: ordemAdjacente });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil-config'] });
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
    },
  });

  const handleMoverEtapa = (etapaId, direcao, etapasDoFunil) => {
    const etapa = etapasDoFunil.find(e => e.id === etapaId);
    if (!etapa) return;
    const sorted = [...etapasDoFunil].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex(e => e.id === etapaId);
    const targetIdx = direcao === 'cima' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const adjacente = sorted[targetIdx];
    reordenarMutation.mutate({
      id: etapa.id, novaOrdem: adjacente.ordem,
      etapaAdjacenteId: adjacente.id, ordemAdjacente: etapa.ordem,
    });
  };

  const resetEtapaForm = () => {
    setEtapaForm({ nome: '', ordem: '', cor: '#3b82f6', tipo: 'aberta', requer_cliente: false, requer_documentos: false, status: 'ativa' });
  };

  const handleSubmitEtapa = () => {
    if (!etapaForm.nome.trim()) { toast.error('Informe o nome da etapa'); return; }
    const data = { ...etapaForm, ordem: parseInt(etapaForm.ordem) || etapas.length + 1 };
    if (selectedEtapa) {
      updateEtapaMutation.mutate({ id: selectedEtapa.id, data });
    } else {
      createEtapaMutation.mutate(data);
    }
  };

  const isAdmin = true; // Todos têm acesso completo às configurações do funil

  if (isLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração de Funis"
        subtitle="Gerencie seus funis de vendas e suas etapas"
        backTo="FunilVendas"
      />

      {funis.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum funil criado ainda.</p>
          <p className="text-sm mt-1">Vá ao Funil de Vendas e crie seu primeiro funil.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {funis.map((funil) => (
            <Card key={funil.slug} className="overflow-hidden border border-slate-200 shadow-sm">
              {/* Header do funil */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedFunil(expandedFunil === funil.slug ? null : funil.slug)}
              >
                <div className="flex items-center gap-3">
                  {expandedFunil === funil.slug
                    ? <ChevronDown className="w-5 h-5 text-slate-400" />
                    : <ChevronRight className="w-5 h-5 text-slate-400" />}
                  <span className="font-semibold text-slate-800 text-lg">{funil.label}</span>
                  <Badge variant="secondary" className="text-xs">{funil.etapas.length} etapas</Badge>
                  {funil.fixo && <Badge className="text-xs bg-blue-100 text-blue-700 border-none">Fixo</Badge>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {!funil.fixo && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-500 hover:text-blue-600"
                          onClick={() => setRenameFunil({ slug: funil.slug, novoNome: funil.label })}
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Renomear
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteFunilSlug(funil.slug)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Excluir Funil
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-1"
                      onClick={() => {
                        setSelectedFunilSlug(funil.slug);
                        setSelectedEtapa(null);
                        resetEtapaForm();
                        setEtapaFormOpen(true);
                        setExpandedFunil(funil.slug);
                      }}
                    >
                      <Plus className="w-4 h-4" /> Nova Etapa
                    </Button>
                  </div>
                )}
              </div>

              {/* Lista de etapas */}
              {expandedFunil === funil.slug && (
                <div className="border-t border-slate-100">
                  {funil.etapas.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-6">Nenhuma etapa neste funil.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                        <tr>
                          <th className="px-5 py-2 text-left">Etapa</th>
                          <th className="px-5 py-2 text-left">Tipo</th>
                          <th className="px-5 py-2 text-left">Regras</th>
                          <th className="px-5 py-2 text-left w-20">Ordem</th>
                          <th className="px-5 py-2 text-right w-32"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {funil.etapas.map((etapa) => {
                          const tipoConfig = {
                            aberta: 'bg-blue-100 text-blue-700',
                            ganho: 'bg-green-100 text-green-700',
                            perdida: 'bg-red-100 text-red-700',
                            planejamento: 'bg-purple-100 text-purple-700',
                          }[etapa.tipo] || '';

                          return (
                            <tr key={etapa.id} className="hover:bg-slate-50">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: etapa.cor }} />
                                  <span className="font-medium text-slate-800">{etapa.nome}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${tipoConfig}`}>
                                  {etapa.tipo}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-slate-500 text-xs">
                                {etapa.requer_cliente && <span className="mr-2">• Requer cliente</span>}
                                {etapa.requer_documentos && <span>• Requer docs</span>}
                                {!etapa.requer_cliente && !etapa.requer_documentos && '—'}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => handleMoverEtapa(etapa.id, 'cima', funil.etapas)}>
                                    <ArrowUp className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => handleMoverEtapa(etapa.id, 'baixo', funil.etapas)}>
                                    <ArrowDown className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right">
                                {isAdmin && (
                                  <div className="flex items-center justify-end gap-2">
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-blue-600"
                                      onClick={() => {
                                        setSelectedEtapa(etapa);
                                        setSelectedFunilSlug(etapa.produto);
                                        setEtapaForm({
                                          nome: etapa.nome, ordem: etapa.ordem.toString(),
                                          cor: etapa.cor, tipo: etapa.tipo,
                                          requer_cliente: etapa.requer_cliente || false,
                                          requer_documentos: etapa.requer_documentos || false,
                                          status: etapa.status,
                                        });
                                        setEtapaFormOpen(true);
                                      }}>
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    {!['ganho', 'perdida', 'planejamento'].includes(etapa.tipo) && (
                                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-600"
                                        onClick={() => setDeleteEtapaId(etapa.id)}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal editar/criar etapa */}
      <Dialog open={etapaFormOpen} onOpenChange={setEtapaFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedEtapa ? 'Editar Etapa' : 'Nova Etapa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Etapa *</Label>
              <Input value={etapaForm.nome} onChange={e => setEtapaForm({ ...etapaForm, nome: e.target.value })} placeholder="Ex: Lead Recebido" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={etapaForm.ordem} onChange={e => setEtapaForm({ ...etapaForm, ordem: e.target.value })} placeholder={String(etapas.length + 1)} />
              </div>
              <div>
                <Label>Cor</Label>
                <Select value={etapaForm.cor} onValueChange={v => setEtapaForm({ ...etapaForm, cor: v })}>
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: etapaForm.cor }} />
                      <span>{coresDisponiveis.find(c => c.valor === etapaForm.cor)?.nome || etapaForm.cor}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {coresDisponiveis.map(cor => (
                      <SelectItem key={cor.valor} value={cor.valor}>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: cor.valor }} />
                          {cor.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={etapaForm.tipo} onValueChange={v => setEtapaForm({ ...etapaForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="ganho">Ganho (conversão)</SelectItem>
                  <SelectItem value="perdida">Perdida</SelectItem>
                  <SelectItem value="planejamento">Planejamento de Compra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Regras de Movimentação</h4>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Requer cliente vinculado</Label>
                <Switch checked={etapaForm.requer_cliente} onCheckedChange={v => setEtapaForm({ ...etapaForm, requer_cliente: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Requer documentos</Label>
                <Switch checked={etapaForm.requer_documentos} onCheckedChange={v => setEtapaForm({ ...etapaForm, requer_documentos: v })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEtapaFormOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmitEtapa}
                disabled={createEtapaMutation.isPending || updateEtapaMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
                {(createEtapaMutation.isPending || updateEtapaMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedEtapa ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal renomear funil */}
      <Dialog open={!!renameFunil} onOpenChange={() => setRenameFunil(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Renomear Funil</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Novo nome</Label>
              <Input value={renameFunil?.novoNome || ''} onChange={e => setRenameFunil(r => ({ ...r, novoNome: e.target.value }))} placeholder="Ex: Crédito Pessoal" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRenameFunil(null)}>Cancelar</Button>
              <Button onClick={() => { if (!renameFunil?.novoNome?.trim()) { toast.error('Digite um nome'); return; } renameFunilMutation.mutate(renameFunil); }}
                disabled={renameFunilMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
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
            <AlertDialogTitle>Excluir etapa?</AlertDialogTitle>
            <AlertDialogDescription>As oportunidades nesta etapa não serão excluídas, mas ficarão sem etapa vinculada.</AlertDialogDescription>
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
            <AlertDialogDescription>Todas as etapas deste funil serão excluídas. As oportunidades vinculadas não serão removidas, mas perderão a etapa associada.</AlertDialogDescription>
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
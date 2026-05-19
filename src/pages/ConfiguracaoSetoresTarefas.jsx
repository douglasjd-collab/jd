import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Trash2, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoSetoresTarefas() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [setorModal, setSetorModal] = useState(false);
  const [subsetorModal, setSubsetorModal] = useState(false);
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [formSetor, setFormSetor] = useState({ nome: '', descricao: '', status: 'ativo' });
  const [formSubsetor, setFormSubsetor] = useState({ nome: '', descricao: '', ativo: true, setor_id: '' });
  const [setoresExpandidos, setSetoresExpandidos] = useState({});
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const me = await base44.auth.me();
        if (me) {
          setUser(me);
          setEmpresaId(me.empresa_id);
        }
      } catch (e) {
        console.error('Erro ao carregar usuário:', e);
      }
    };
    loadUser();
  }, []);

  const { data: setores = [], isLoading: loadingSetores } = useQuery({
    queryKey: ['setores', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.SetorTarefa.filter({ empresa_id: empresaId }, 'nome', 100),
  });

  const { data: subsetores = [], isLoading: loadingSubsetores } = useQuery({
    queryKey: ['subsetores-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.SubsetorTarefa.filter({ empresa_id: empresaId }, 'setor_nome', 500),
  });

  const criarSetorMutation = useMutation({
    mutationFn: (data) => base44.entities.SetorTarefa.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setores', empresaId] });
      setSetorModal(false);
      setFormSetor({ nome: '', descricao: '', status: 'ativo' });
      toast.success('Setor criado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao criar setor: ' + e.message),
  });

  const atualizarSetorMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SetorTarefa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setores', empresaId] });
      setSetorModal(false);
      setFormSetor({ nome: '', descricao: '', status: 'ativo' });
      setSetorSelecionado(null);
      toast.success('Setor atualizado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao atualizar setor: ' + e.message),
  });

  const deletarSetorMutation = useMutation({
    mutationFn: (id) => base44.entities.SetorTarefa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setores', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa', empresaId] });
      toast.success('Setor deletado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao deletar setor: ' + e.message),
  });

  const criarSubsetorMutation = useMutation({
    mutationFn: (data) => base44.entities.SubsetorTarefa.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa', empresaId] });
      setSubsetorModal(false);
      setFormSubsetor({ nome: '', descricao: '', ativo: true, setor_id: '' });
      toast.success('Subsetor criado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao criar subsetor: ' + e.message),
  });

  const atualizarSubsetorMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SubsetorTarefa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa', empresaId] });
      setSubsetorModal(false);
      setFormSubsetor({ nome: '', descricao: '', ativo: true, setor_id: '' });
      setSetorSelecionado(null);
      toast.success('Subsetor atualizado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao atualizar subsetor: ' + e.message),
  });

  const deletarSubsetorMutation = useMutation({
    mutationFn: (id) => base44.entities.SubsetorTarefa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa', empresaId] });
      toast.success('Subsetor deletado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao deletar subsetor: ' + e.message),
  });

  const salvarSetor = () => {
    if (!formSetor.nome.trim()) { toast.error('Informe o nome do setor'); return; }
    if (setorSelecionado) {
      atualizarSetorMutation.mutate({ id: setorSelecionado.id, data: { ...formSetor, empresa_id: empresaId } });
    } else {
      criarSetorMutation.mutate({ ...formSetor, empresa_id: empresaId });
    }
  };

  const salvarSubsetor = () => {
    if (!formSubsetor.nome.trim()) { toast.error('Informe o nome do subsetor'); return; }
    if (!formSubsetor.setor_id) { toast.error('Selecione um setor'); return; }
    const setor = setores.find(s => s.id === formSubsetor.setor_id);
    if (setorSelecionado?.subsetor_id) {
      atualizarSubsetorMutation.mutate({ 
        id: setorSelecionado.subsetor_id, 
        data: { ...formSubsetor, empresa_id: empresaId, setor_nome: setor?.nome } 
      });
    } else {
      criarSubsetorMutation.mutate({ 
        ...formSubsetor, 
        empresa_id: empresaId, 
        setor_nome: setor?.nome 
      });
    }
  };

  const abrirFormSetor = (setor = null) => {
    if (setor) {
      setFormSetor({ nome: setor.nome, descricao: setor.descricao || '', status: setor.status });
    } else {
      setFormSetor({ nome: '', descricao: '', status: 'ativo' });
    }
    setSetorSelecionado(setor);
    setSetorModal(true);
  };

  const abrirFormSubsetor = (subsetor = null) => {
    if (subsetor) {
      setFormSubsetor({ nome: subsetor.nome, descricao: subsetor.descricao || '', ativo: subsetor.ativo, setor_id: subsetor.setor_id });
    } else {
      setFormSubsetor({ nome: '', descricao: '', ativo: true, setor_id: '' });
    }
    setSetorSelecionado(subsetor ? { subsetor_id: subsetor.id } : null);
    setSubsetorModal(true);
  };

  const subsetoresPorSetor = (setorId) => subsetores.filter(s => s.setor_id === setorId);

  const toggleSetor = (setorId) => {
    setSetoresExpandidos(prev => ({ ...prev, [setorId]: !prev[setorId] }));
  };

  if (!user || !empresaId) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Configuração de Setores e Subsetores</h1>
        <Button onClick={() => abrirFormSetor()} className="gap-2"><Plus className="w-4 h-4" /> Novo Setor</Button>
      </div>

      {/* Lista de Setores com Accordion */}
      <div className="space-y-3">
        {loadingSetores ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : setores.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              Nenhum setor cadastrado. Clique em "Novo Setor" para começar.
            </CardContent>
          </Card>
        ) : (
          setores.map((setor) => {
            const subsetoresDoSetor = subsetoresPorSetor(setor.id);
            const expandido = setoresExpandidos[setor.id];
            
            return (
              <Card key={setor.id} className="overflow-hidden">
                {/* Cabeçalho do Setor (clicável) */}
                <div
                  className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                  onClick={() => toggleSetor(setor.id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${expandido ? 'rotate-90' : ''}`} />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800">{setor.nome}</h3>
                      {setor.descricao && <p className="text-sm text-slate-500 mt-0.5">{setor.descricao}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={setor.status === 'ativo' ? 'default' : 'secondary'} className="text-xs">
                      {subsetoresDoSetor.length} {subsetoresDoSetor.length === 1 ? 'subsetor' : 'subsetores'}
                    </Badge>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0"
                      onClick={(e) => { e.stopPropagation(); abrirFormSetor(setor); }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (confirm('Deletar este setor?')) deletarSetorMutation.mutate(setor.id); 
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* Conteúdo Expandido (Subsetores) */}
                {expandido && (
                  <div className="border-t bg-white">
                    <div className="p-4 space-y-2">
                      {/* Botão Novo Subsetor */}
                      <Button 
                        onClick={() => {
                          setFormSubsetor({ nome: '', descricao: '', ativo: true, setor_id: setor.id });
                          setSetorSelecionado(null);
                          setSubsetorModal(true);
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-2 w-full border-dashed"
                      >
                        <Plus className="w-4 h-4" /> Adicionar Subsetor
                      </Button>

                      {/* Lista de Subsetores */}
                      {subsetoresDoSetor.length > 0 ? (
                        subsetoresDoSetor.map((subsetor) => (
                          <div 
                            key={subsetor.id} 
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm text-slate-800">{subsetor.nome}</p>
                                <Badge variant={subsetor.ativo ? 'default' : 'secondary'} className="text-xs">
                                  {subsetor.ativo ? 'ativo' : 'inativo'}
                                </Badge>
                              </div>
                              {subsetor.descricao && <p className="text-xs text-slate-500 mt-1">{subsetor.descricao}</p>}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0"
                                onClick={() => abrirFormSubsetor(subsetor)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  if (confirm('Deletar este subsetor?')) deletarSubsetorMutation.mutate(subsetor.id);
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400 italic text-center py-4">
                          Nenhum subsetor cadastrado para este setor
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Modal Setor */}
      <Dialog open={setorModal} onOpenChange={setSetorModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{setorSelecionado ? 'Editar Setor' : 'Novo Setor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome do Setor *</Label>
              <Input value={formSetor.nome} onChange={e => setFormSetor({ ...formSetor, nome: e.target.value })} placeholder="Ex: Consórcio" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formSetor.descricao} onChange={e => setFormSetor({ ...formSetor, descricao: e.target.value })} placeholder="Descrição do setor..." rows={3} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formSetor.status} onValueChange={v => setFormSetor({ ...formSetor, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetorModal(false)}>Cancelar</Button>
            <Button onClick={salvarSetor} disabled={criarSetorMutation.isPending || atualizarSetorMutation.isPending}>
              {criarSetorMutation.isPending || atualizarSetorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Subsetor */}
      <Dialog open={subsetorModal} onOpenChange={setSubsetorModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{setorSelecionado?.subsetor_id ? 'Editar Subsetor' : 'Novo Subsetor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Setor *</Label>
              <Select value={formSubsetor.setor_id} onValueChange={v => setFormSubsetor({ ...formSubsetor, setor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar setor" /></SelectTrigger>
                <SelectContent>
                  {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome do Subsetor *</Label>
              <Input value={formSubsetor.nome} onChange={e => setFormSubsetor({ ...formSubsetor, nome: e.target.value })} placeholder="Ex: Análise de Crédito" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formSubsetor.descricao} onChange={e => setFormSubsetor({ ...formSubsetor, descricao: e.target.value })} placeholder="Descrição do subsetor..." rows={3} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formSubsetor.ativo ? 'sim' : 'nao'} onValueChange={v => setFormSubsetor({ ...formSubsetor, ativo: v === 'sim' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Ativo</SelectItem>
                  <SelectItem value="nao">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubsetorModal(false)}>Cancelar</Button>
            <Button onClick={salvarSubsetor} disabled={criarSubsetorMutation.isPending || atualizarSubsetorMutation.isPending}>
              {criarSubsetorMutation.isPending || atualizarSubsetorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
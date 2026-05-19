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
import { Plus, Edit2, Trash2, Loader2, ChevronRight, Search, GripVertical, FolderOpen, Info, ArrowLeft } from 'lucide-react';
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
  const [buscarSubsetor, setBuscarSubsetor] = useState({});

  const cores = ['bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500', 'bg-red-500', 'bg-pink-500'];
  const getCorSetor = (index) => cores[index % cores.length];
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
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          size="sm"
          className="h-auto px-0 py-0 text-sm text-slate-600 hover:text-slate-900 font-medium gap-1 mb-2"
          onClick={() => window.history.back()}
          title="Voltar"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">Configuração de Setores</h1>
            <p className="text-sm text-slate-500 mt-1">Organize e gerencie os setores e os tipos de tarefa do sistema.</p>
          </div>
          <Button onClick={() => abrirFormSetor()} className="gap-2 bg-blue-600 hover:bg-blue-700 flex-shrink-0">
            <Plus className="w-4 h-4" /> Novo Setor
          </Button>
        </div>
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
          setores.map((setor, index) => {
            const subsetoresDoSetor = subsetoresPorSetor(setor.id);
            const expandido = setoresExpandidos[setor.id];
            const corSetor = getCorSetor(index);
            const filtrados = (buscarSubsetor[setor.id] || '').trim() === '' 
              ? subsetoresDoSetor 
              : subsetoresDoSetor.filter(s => 
                  s.nome.toLowerCase().includes((buscarSubsetor[setor.id] || '').toLowerCase())
                );
            
            return (
              <Card key={setor.id} className="overflow-hidden border-0 shadow-sm">
                {/* Cabeçalho do Setor (clicável) */}
                <div
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => toggleSetor(setor.id)}
                >
                  {/* Ícone colorido do setor */}
                  <div className={`${corSetor} w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <FolderOpen className="w-6 h-6 text-white" />
                  </div>

                  {/* Info do setor */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">{setor.nome}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {subsetoresDoSetor.length} {subsetoresDoSetor.length === 1 ? 'tipo de tarefa cadastrado' : 'tipos de tarefa cadastrados'}
                    </p>
                  </div>

                  {/* Seta para expandir */}
                  <ChevronRight className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${expandido ? 'rotate-90' : ''}`} />
                </div>

                {/* Conteúdo Expandido (Subsetores) */}
                {expandido && (
                  <div className="border-t bg-white">
                    <div className="p-4 space-y-4">
                      {/* Cabeçalho: Tipos de tarefa + Busca + Novo */}
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-semibold text-slate-800 text-sm">Tipos de tarefa</h4>
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Buscar tipo de tarefa..."
                              value={buscarSubsetor[setor.id] || ''}
                              onChange={(e) => setBuscarSubsetor(prev => ({ ...prev, [setor.id]: e.target.value }))}
                              className="h-9 w-full pl-8 pr-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <Button 
                            onClick={() => {
                              setFormSubsetor({ nome: '', descricao: '', ativo: true, setor_id: setor.id });
                              setSetorSelecionado(null);
                              setSubsetorModal(true);
                            }}
                            size="sm"
                            className="gap-2 bg-blue-600 hover:bg-blue-700"
                          >
                            <Plus className="w-4 h-4" /> Novo Tipo
                          </Button>
                        </div>
                      </div>

                      {/* Lista de Subsetores */}
                      {filtrados.length > 0 ? (
                        <div className="space-y-2">
                          {filtrados.map((subsetor) => (
                            <div 
                              key={subsetor.id} 
                              className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors group"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab" />
                                <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm text-slate-800">{subsetor.nome}</p>
                                  {subsetor.descricao && <p className="text-xs text-slate-500 mt-0.5 truncate">{subsetor.descricao}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                <Badge variant="outline" className="text-xs font-medium border-green-200 bg-green-50 text-green-700">
                                  {subsetor.ativo ? 'Ativo' : 'Inativo'}
                                </Badge>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => abrirFormSubsetor(subsetor)}
                                >
                                  <Edit2 className="w-4 h-4 text-slate-600" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    if (confirm('Deletar este tipo de tarefa?')) deletarSubsetorMutation.mutate(subsetor.id);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : subsetoresDoSetor.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-6">
                          Nenhum tipo de tarefa cadastrado
                        </p>
                      ) : (
                        <p className="text-sm text-slate-400 italic text-center py-6">
                          Nenhum resultado para "{buscarSubsetor[setor.id]}"
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

      {/* Dica informativa */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg mt-6">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          <strong>Dica:</strong> Arraste os itens para reordenar os tipos de tarefa dentro de cada setor.
        </p>
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
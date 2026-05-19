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
import { Plus, Edit2, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoSetoresTarefas() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [setorModal, setSetorModal] = useState(false);
  const [subsetorModal, setSubsetorModal] = useState(false);
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [formSetor, setFormSetor] = useState({ nome: '', descricao: '', status: 'ativo' });
  const [formSubsetor, setFormSubsetor] = useState({ nome: '', descricao: '', ativo: true, setor_id: '' });
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

  if (!user || !empresaId) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Configuração de Setores e Subsetores</h1>

      {/* Setores */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Setores de Tarefas</CardTitle>
          <Button onClick={() => abrirFormSetor()} className="gap-2"><Plus className="w-4 h-4" /> Novo Setor</Button>
        </CardHeader>
        <CardContent>
          {loadingSetores ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : setores.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Nenhum setor cadastrado</p>
          ) : (
            <div className="space-y-3">
              {setores.map((setor) => (
                <div key={setor.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div>
                    <h3 className="font-semibold">{setor.nome}</h3>
                    {setor.descricao && <p className="text-sm text-slate-500">{setor.descricao}</p>}
                    <p className="text-xs text-slate-400 mt-1">{subsetoresPorSetor(setor.id).length} subsetores</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={setor.status === 'ativo' ? 'default' : 'secondary'}>{setor.status}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => abrirFormSetor(setor)}><Edit2 className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm('Deletar este setor?')) deletarSetorMutation.mutate(setor.id);
                    }}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subsetores por Setor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Subsetores por Setor</CardTitle>
          <Button onClick={() => abrirFormSubsetor()} className="gap-2"><Plus className="w-4 h-4" /> Novo Subsetor</Button>
        </CardHeader>
        <CardContent>
          {loadingSubsetores ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {setores.map((setor) => (
                <div key={setor.id} className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <ChevronDown className="w-4 h-4" /> {setor.nome}
                  </h3>
                  <div className="space-y-2 ml-6">
                    {subsetoresPorSetor(setor.id).map((subsetor) => (
                      <div key={subsetor.id} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{subsetor.nome}</p>
                          {subsetor.descricao && <p className="text-xs text-slate-500">{subsetor.descricao}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={subsetor.ativo ? 'default' : 'secondary'}>{subsetor.ativo ? 'ativo' : 'inativo'}</Badge>
                          <Button size="sm" variant="ghost" onClick={() => abrirFormSubsetor(subsetor)}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            if (confirm('Deletar este subsetor?')) deletarSubsetorMutation.mutate(subsetor.id);
                          }}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </div>
                    ))}
                    {subsetoresPorSetor(setor.id).length === 0 && (
                      <p className="text-xs text-slate-400 italic">Nenhum subsetor cadastrado para este setor</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
              <Label>Ativo</Label>
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
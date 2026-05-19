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
  const [tipoModal, setTipoModal] = useState(false);
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [formSetor, setFormSetor] = useState({ nome: '', descricao: '', status: 'ativo' });
  const [formTipo, setFormTipo] = useState({ nome: '', descricao: '', status: 'ativo', setor_id: '' });
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

  const { data: tipos = [], isLoading: loadingTipos } = useQuery({
    queryKey: ['tipos-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TipoTarefa.filter({ empresa_id: empresaId }, 'setor_nome', 500),
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
      queryClient.invalidateQueries({ queryKey: ['tipos-tarefa', empresaId] });
      toast.success('Setor deletado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao deletar setor: ' + e.message),
  });

  const criarTipoMutation = useMutation({
    mutationFn: (data) => base44.entities.TipoTarefa.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipos-tarefa', empresaId] });
      setTipoModal(false);
      setFormTipo({ nome: '', descricao: '', status: 'ativo', setor_id: '' });
      toast.success('Tipo de tarefa criado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao criar tipo: ' + e.message),
  });

  const atualizarTipoMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TipoTarefa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipos-tarefa', empresaId] });
      setTipoModal(false);
      setFormTipo({ nome: '', descricao: '', status: 'ativo', setor_id: '' });
      setSetorSelecionado(null);
      toast.success('Tipo de tarefa atualizado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao atualizar tipo: ' + e.message),
  });

  const deletarTipoMutation = useMutation({
    mutationFn: (id) => base44.entities.TipoTarefa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipos-tarefa', empresaId] });
      toast.success('Tipo de tarefa deletado com sucesso!');
    },
    onError: (e) => toast.error('Erro ao deletar tipo: ' + e.message),
  });

  const salvarSetor = () => {
    if (!formSetor.nome.trim()) { toast.error('Informe o nome do setor'); return; }
    if (setorSelecionado) {
      atualizarSetorMutation.mutate({ id: setorSelecionado.id, data: { ...formSetor, empresa_id: empresaId } });
    } else {
      criarSetorMutation.mutate({ ...formSetor, empresa_id: empresaId });
    }
  };

  const salvarTipo = () => {
    if (!formTipo.nome.trim()) { toast.error('Informe o nome do tipo'); return; }
    if (!formTipo.setor_id) { toast.error('Selecione um setor'); return; }
    const setor = setores.find(s => s.id === formTipo.setor_id);
    if (setorSelecionado?.tipo_id) {
      atualizarTipoMutation.mutate({ 
        id: setorSelecionado.tipo_id, 
        data: { ...formTipo, empresa_id: empresaId, setor_nome: setor?.nome } 
      });
    } else {
      criarTipoMutation.mutate({ 
        ...formTipo, 
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

  const abrirFormTipo = (tipo = null) => {
    if (tipo) {
      setFormTipo({ nome: tipo.nome, descricao: tipo.descricao || '', status: tipo.ativo ? 'ativo' : 'inativo', setor_id: tipo.setor_id });
    } else {
      setFormTipo({ nome: '', descricao: '', status: 'ativo', setor_id: '' });
    }
    setSetorSelecionado(tipo ? { tipo_id: tipo.id } : null);
    setTipoModal(true);
  };

  const tiposPorSetor = (setorId) => tipos.filter(t => t.setor_id === setorId);

  if (!user || !empresaId) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Configuração de Setores e Tipos de Tarefa</h1>

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
                    <p className="text-xs text-slate-400 mt-1">{tiposPorSetor(setor.id).length} tipos de tarefa</p>
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

      {/* Tipos por Setor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tipos de Tarefa por Setor</CardTitle>
          <Button onClick={() => abrirFormTipo()} className="gap-2"><Plus className="w-4 h-4" /> Novo Tipo</Button>
        </CardHeader>
        <CardContent>
          {loadingTipos ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {setores.map((setor) => (
                <div key={setor.id} className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <ChevronDown className="w-4 h-4" /> {setor.nome}
                  </h3>
                  <div className="space-y-2 ml-6">
                    {tiposPorSetor(setor.id).map((tipo) => (
                      <div key={tipo.id} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{tipo.nome}</p>
                          {tipo.descricao && <p className="text-xs text-slate-500">{tipo.descricao}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={tipo.ativo ? 'default' : 'secondary'}>{tipo.ativo ? 'ativo' : 'inativo'}</Badge>
                          <Button size="sm" variant="ghost" onClick={() => abrirFormTipo(tipo)}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            if (confirm('Deletar este tipo?')) deletarTipoMutation.mutate(tipo.id);
                          }}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </div>
                    ))}
                    {tiposPorSetor(setor.id).length === 0 && (
                      <p className="text-xs text-slate-400 italic">Nenhum tipo cadastrado para este setor</p>
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

      {/* Modal Tipo */}
      <Dialog open={tipoModal} onOpenChange={setTipoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{setorSelecionado?.tipo_id ? 'Editar Tipo de Tarefa' : 'Novo Tipo de Tarefa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Setor *</Label>
              <Select value={formTipo.setor_id} onValueChange={v => setFormTipo({ ...formTipo, setor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar setor" /></SelectTrigger>
                <SelectContent>
                  {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome do Tipo *</Label>
              <Input value={formTipo.nome} onChange={e => setFormTipo({ ...formTipo, nome: e.target.value })} placeholder="Ex: Análise de Crédito" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formTipo.descricao} onChange={e => setFormTipo({ ...formTipo, descricao: e.target.value })} placeholder="Descrição do tipo..." rows={3} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formTipo.status} onValueChange={v => setFormTipo({ ...formTipo, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTipoModal(false)}>Cancelar</Button>
            <Button onClick={salvarTipo} disabled={criarTipoMutation.isPending || atualizarTipoMutation.isPending}>
              {criarTipoMutation.isPending || atualizarTipoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
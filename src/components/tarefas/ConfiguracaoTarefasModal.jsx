import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_PADRAO = [
  { slug: 'a_fazer', nome: 'A Fazer', cor: '#f59e0b', ordem: 1, e_padrao: true },
  { slug: 'em_andamento', nome: 'Em Andamento', cor: '#3b82f6', ordem: 2, e_padrao: true },
  { slug: 'aguardando_cliente', nome: 'Aguardando Cliente', cor: '#8b5cf6', ordem: 3, e_padrao: true },
  { slug: 'aguardando_banco', nome: 'Aguardando Banco', cor: '#f97316', ordem: 4, e_padrao: true },
  { slug: 'concluido', nome: 'Concluído', cor: '#22c55e', ordem: 5, e_padrao: true },
  { slug: 'arquivado', nome: 'Arquivado', cor: '#94a3b8', ordem: 6, e_padrao: true },
];

const TIPOS_PADRAO = [
  'Pendencia',
  'Documentação',
  'Cobrança',
  'Acompanhamento',
  'Reunião',
  'Outros',
];

export default function ConfiguracaoTarefasModal({ open, onOpenChange, empresaId, onStatusChanged }) {
  const [aba, setAba] = useState('status'); // 'status' | 'tipos'
  const [novoStatus, setNovoStatus] = useState({ nome: '', cor: '#3b82f6' });
  const [editStatus, setEditStatus] = useState(null);
  const [novoTipo, setNovoTipo] = useState('');
  const [editTipo, setEditTipo] = useState(null); // { id, nome }
  const queryClient = useQueryClient();

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-tarefa', empresaId],
    enabled: !!empresaId && open,
    queryFn: () => base44.entities.StatusTarefa.filter({ empresa_id: empresaId }),
    select: (data) => (data || []).filter(s => s != null && typeof s === 'object' && s.nome),
  });

  const { data: tiposList = [] } = useQuery({
    queryKey: ['tipos-tarefa', empresaId],
    enabled: !!empresaId && open,
    queryFn: async () => {
      // Buscar tipos únicos de tarefas existentes + custom
      try {
        const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'tipos_tarefa' });
        if (configs.length > 0 && configs[0].valor) {
          return JSON.parse(configs[0].valor);
        }
      } catch {}
      return TIPOS_PADRAO;
    },
  });

  // Status mutations
  const criarStatus = useMutation({
    mutationFn: (data) => base44.entities.StatusTarefa.create({
      ...data,
      empresa_id: empresaId,
      ativo: true,
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

  // Tipos mutations
  const salvarTipos = async (novaLista) => {
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ empresa_id: empresaId, chave: 'tipos_tarefa' });
      if (configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, { valor: JSON.stringify(novaLista) });
      } else {
        await base44.entities.ConfiguracaoSistema.create({ empresa_id: empresaId, chave: 'tipos_tarefa', valor: JSON.stringify(novaLista) });
      }
      queryClient.invalidateQueries({ queryKey: ['tipos-tarefa'] });
    } catch (e) {
      toast.error('Erro ao salvar tipos');
    }
  };

  const adicionarTipo = async () => {
    const nome = novoTipo.trim();
    if (!nome) return toast.error('Informe o nome do tipo');
    if (tiposList.includes(nome)) return toast.error('Tipo já existe');
    await salvarTipos([...tiposList, nome]);
    setNovoTipo('');
    toast.success('Tipo adicionado!');
  };

  const excluirTipo = async (tipo) => {
    if (!confirm(`Excluir tipo "${tipo}"?`)) return;
    await salvarTipos(tiposList.filter(t => t !== tipo));
    toast.success('Tipo excluído!');
  };

  const atualizarTipo = async () => {
    if (!editTipo?.nome?.trim()) return toast.error('Informe o nome');
    const novaLista = tiposList.map(t => t === editTipo.original ? editTipo.nome : t);
    await salvarTipos(novaLista);
    setEditTipo(null);
    toast.success('Tipo atualizado!');
  };

  const statusExibidos = useMemo(() => {
    const raw = Array.isArray(statusList) ? statusList : [];
    const listaFiltrada = raw.filter(s => s != null && typeof s === 'object' && typeof s.nome === 'string' && s.nome.trim().length > 0);
    const lista = listaFiltrada.length > 0 ? listaFiltrada : STATUS_PADRAO.filter(s => s != null);
    return lista.sort((a, b) => (a?.ordem || 0) - (b?.ordem || 0));
  }, [statusList]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⚙️ Configurações de Tarefas
          </DialogTitle>
        </DialogHeader>

        {/* Abas */}
        <div className="flex border-b mb-4">
          <button
            onClick={() => setAba('status')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === 'status' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Status das Tarefas
          </button>
          <button
            onClick={() => setAba('tipos')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === 'tipos' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Tipos de Tarefa
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {/* ABA STATUS */}
          {aba === 'status' && (
            <>
              <div className="space-y-2">
                {statusExibidos.filter(s => s != null && typeof s.nome === 'string').map(s => (
                  <div key={s.slug || s.id || s.nome} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border">
                    <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor || '#3b82f6' }} />
                    {editStatus?.id === s.id ? (
                      <>
                        <Input value={editStatus.nome} onChange={e => setEditStatus({ ...editStatus, nome: e.target.value })} className="flex-1 h-7 text-sm" />
                        <input type="color" value={editStatus.cor} onChange={e => setEditStatus({ ...editStatus, cor: e.target.value })} className="h-7 w-10 rounded border cursor-pointer" />
                        <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700" onClick={() => atualizarStatus.mutate({ id: editStatus.id, data: { nome: editStatus.nome, cor: editStatus.cor } })}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditStatus(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium">{s?.nome ?? ''}</span>
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
                ))}
              </div>

              <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Novo Status</Label>
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

          {/* ABA TIPOS */}
          {aba === 'tipos' && (
            <>
              <div className="space-y-2">
                {tiposList.map((tipo, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border">
                    {editTipo?.original === tipo ? (
                      <>
                        <Input
                          value={editTipo.nome}
                          onChange={e => setEditTipo({ ...editTipo, nome: e.target.value })}
                          className="flex-1 h-7 text-sm"
                          onKeyDown={e => e.key === 'Enter' && atualizarTipo()}
                        />
                        <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700" onClick={atualizarTipo}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTipo(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium">{tipo}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTipo({ original: tipo, nome: tipo })}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => excluirTipo(tipo)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
                {tiposList.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhum tipo cadastrado.</p>}
              </div>

              <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Novo Tipo</Label>
                <div className="flex gap-2">
                  <Input
                    value={novoTipo}
                    onChange={e => setNovoTipo(e.target.value)}
                    placeholder="Ex: Vistoria, Contrato..."
                    className="flex-1 h-8 text-sm"
                    onKeyDown={e => e.key === 'Enter' && adicionarTipo()}
                  />
                  <Button size="sm" onClick={adicionarTipo} className="bg-[#1e3a5f] hover:bg-[#2a4a73] flex-shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { GripVertical, Pencil, Check, X, Plus, Trash2, Loader2 } from 'lucide-react';

const STATUS_COLOR_MAP = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
};

const CORES = [
  { value: 'blue', label: 'Azul' },
  { value: 'green', label: 'Verde' },
  { value: 'red', label: 'Vermelho' },
  { value: 'yellow', label: 'Amarelo' },
  { value: 'purple', label: 'Roxo' },
  { value: 'orange', label: 'Laranja' },
  { value: 'emerald', label: 'Esmeralda' },
  { value: 'slate', label: 'Cinza' },
];

export default function KanbanConfigModal({ open, onOpenChange, empresaId }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [localList, setLocalList] = useState([]);
  const [showNovo, setShowNovo] = useState(false);
  const [novoForm, setNovoForm] = useState({ codigo: '', nome: '', cor: 'blue' });

  const { data: statusList = [], isLoading } = useQuery({
    queryKey: ['status-propostas-emprestimos'],
    queryFn: () => base44.entities.StatusProposta.filter({ ativo: true }),
    enabled: open,
  });

  useEffect(() => {
    if (statusList.length) {
      setLocalList([...statusList].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
    }
  }, [statusList]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StatusProposta.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status-propostas-emprestimos'] }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.StatusProposta.create({ empresa_id: empresaId, ativo: true, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-propostas-emprestimos'] });
      setShowNovo(false);
      setNovoForm({ codigo: '', nome: '', cor: 'blue' });
      toast.success('Status criado!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.StatusProposta.update(id, { ativo: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-propostas-emprestimos'] });
      toast.success('Status removido!');
    },
  });

  const handleDragStart = (e, index) => {
    setDragging(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setDragOver(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragging === null || dragging === dropIndex) return;
    const newList = [...localList];
    const [removed] = newList.splice(dragging, 1);
    newList.splice(dropIndex, 0, removed);
    // Atualizar ordem
    newList.forEach((item, i) => {
      if (item.ordem !== i) {
        updateMutation.mutate({ id: item.id, data: { ordem: i } });
      }
    });
    setLocalList(newList.map((item, i) => ({ ...item, ordem: i })));
    setDragging(null);
    setDragOver(null);
  };

  const startEdit = (status) => {
    setEditingId(status.id);
    setEditForm({ nome: status.nome, cor: status.cor });
  };

  const saveEdit = (id) => {
    updateMutation.mutate({ id, data: editForm }, {
      onSuccess: () => {
        setEditingId(null);
        toast.success('Status atualizado!');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Colunas do Kanban</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500 -mt-2 mb-2">Arraste para reordenar. Clique no lápis para editar.</p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-2">
            {localList.map((status, index) => {
              const colorClass = STATUS_COLOR_MAP[status.cor] || STATUS_COLOR_MAP.slate;
              const isEditing = editingId === status.id;
              return (
                <div
                  key={status.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  className={`flex items-center gap-2 p-3 rounded-lg border bg-white transition-all cursor-grab active:cursor-grabbing
                    ${dragOver === index ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}
                    ${dragging === index ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />

                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <Input
                        value={editForm.nome}
                        onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <div className="flex gap-1 flex-wrap">
                        {CORES.map(c => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setEditForm({ ...editForm, cor: c.value })}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${STATUS_COLOR_MAP[c.value]} ${editForm.cor === c.value ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className={`flex-1 px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>
                      {status.nome}
                    </span>
                  )}

                  <div className="flex gap-1 flex-shrink-0">
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(status.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(status)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteMutation.mutate(status.id)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Novo status */}
            {showNovo ? (
              <div className="p-3 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 space-y-2">
                <Input
                  placeholder="Nome do status"
                  value={novoForm.nome}
                  onChange={(e) => setNovoForm({ ...novoForm, nome: e.target.value, codigo: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  className="h-8 text-sm"
                  autoFocus
                />
                <div className="flex gap-1 flex-wrap">
                  {CORES.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNovoForm({ ...novoForm, cor: c.value })}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${STATUS_COLOR_MAP[c.value]} ${novoForm.cor === c.value ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                      title={c.label}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs bg-[#23BE84] hover:bg-[#1da570]"
                    disabled={!novoForm.nome || createMutation.isPending}
                    onClick={() => createMutation.mutate({ ...novoForm, ordem: localList.length })}
                  >
                    {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNovo(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNovo(true)}
                className="w-full flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-all text-sm"
              >
                <Plus className="w-4 h-4" /> Adicionar status
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
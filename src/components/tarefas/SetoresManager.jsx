import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, FolderTree
} from 'lucide-react';
import { toast } from 'sonner';

export default function SetoresManager({ empresaId, podeEditar = false }) {
  const queryClient = useQueryClient();
  const [novoSetorNome, setNovoSetorNome] = useState('');
  const [criandoSetor, setCriandoSetor] = useState(false);
  const [editandoSetor, setEditandoSetor] = useState(null); // { id, nome, status }
  const [expandido, setExpandido] = useState({});
  const [novoSub, setNovoSub] = useState({}); // { [setorId]: nome }
  const [editandoSub, setEditandoSub] = useState(null); // { id, nome }

  const { data: setores = [] } = useQuery({
    queryKey: ['setores-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.SetorTarefa.filter({ empresa_id: empresaId }, 'nome', 500),
  });

  const { data: subsetores = [] } = useQuery({
    queryKey: ['subsetores-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.SubsetorTarefa.filter({ empresa_id: empresaId }, 'nome', 1000),
  });

  const subsDoSetor = (setorId) => subsetores.filter(s => s.setor_id === setorId);

  // ── Setor CRUD ──
  const criarSetor = useMutation({
    mutationFn: (nome) => base44.entities.SetorTarefa.create({ empresa_id: empresaId, nome: nome.trim(), status: 'ativo' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['setores-tarefa'] }); setNovoSetorNome(''); setCriandoSetor(false); toast.success('Setor criado!'); },
    onError: (e) => toast.error('Erro ao criar setor: ' + (e.message || '')),
  });

  const atualizarSetor = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SetorTarefa.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['setores-tarefa'] }); setEditandoSetor(null); toast.success('Setor atualizado!'); },
    onError: (e) => toast.error('Erro ao atualizar: ' + (e.message || '')),
  });

  const excluirSetor = useMutation({
    mutationFn: async (setor) => {
      const subs = subsDoSetor(setor.id);
      await Promise.all(subs.map(s => base44.entities.SubsetorTarefa.delete(s.id).catch(() => {})));
      return base44.entities.SetorTarefa.delete(setor.id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['setores-tarefa'] }); queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa'] }); toast.success('Setor e subcategorias excluídos!'); },
    onError: (e) => toast.error('Erro ao excluir: ' + (e.message || '')),
  });

  // ── Subsetor CRUD ──
  const criarSub = useMutation({
    mutationFn: ({ setorId, setorNome, nome }) => base44.entities.SubsetorTarefa.create({
      empresa_id: empresaId, setor_id: setorId, setor_nome: setorNome, nome: nome.trim(), ativo: true,
    }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa'] });
      setNovoSub(prev => ({ ...prev, [vars.setorId]: '' }));
      toast.success('Subcategoria criada!');
    },
    onError: (e) => toast.error('Erro ao criar subcategoria: ' + (e.message || '')),
  });

  const atualizarSub = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SubsetorTarefa.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa'] }); setEditandoSub(null); toast.success('Subcategoria atualizada!'); },
    onError: (e) => toast.error('Erro ao atualizar: ' + (e.message || '')),
  });

  const excluirSub = useMutation({
    mutationFn: (id) => base44.entities.SubsetorTarefa.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subsetores-tarefa'] }); toast.success('Subcategoria excluída!'); },
    onError: (e) => toast.error('Erro ao excluir: ' + (e.message || '')),
  });

  const toggleExpandido = (id) => setExpandido(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold text-slate-700">Setores e Subcategorias</span>
          <Badge variant="secondary" className="text-xs">{setores.length}</Badge>
        </div>
        {podeEditar && !criandoSetor && (
          <Button size="sm" variant="outline" onClick={() => setCriandoSetor(true)} className="h-7 text-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Setor
          </Button>
        )}
      </div>

      {/* Criar setor */}
      {criandoSetor && (
        <div className="flex gap-2 items-center p-2 rounded-lg border bg-slate-50">
          <Input
            value={novoSetorNome}
            autoFocus
            onChange={e => setNovoSetorNome(e.target.value)}
            placeholder="Nome do novo setor (ex: Consórcio, Cobrança...)"
            className="flex-1 h-8 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && novoSetorNome.trim()) criarSetor.mutate(novoSetorNome);
              if (e.key === 'Escape') { setCriandoSetor(false); setNovoSetorNome(''); }
            }}
          />
          <Button size="icon" className="h-8 w-8 bg-[#1e3a5f] hover:bg-[#2a4a73]" onClick={() => novoSetorNome.trim() && criarSetor.mutate(novoSetorNome)} disabled={criarSetor.isPending}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setCriandoSetor(false); setNovoSetorNome(''); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Lista de setores */}
      {setores.length === 0 && !criandoSetor ? (
        <p className="text-xs text-slate-400 text-center py-4">Nenhum setor cadastrado. Clique em "Novo Setor" para começar.</p>
      ) : (
        <div className="space-y-2">
          {setores.map(setor => {
            const subs = subsDoSetor(setor.id);
            const isOpen = !!expandido[setor.id];
            const isEdit = editandoSetor?.id === setor.id;
            return (
              <div key={setor.id} className="border rounded-lg overflow-hidden">
                {/* Linha do setor */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white">
                  <button onClick={() => toggleExpandido(setor.id)} className="p-0.5 text-slate-400 hover:text-slate-700">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {isEdit ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editandoSetor.nome}
                        autoFocus
                        onChange={e => setEditandoSetor({ ...editandoSetor, nome: e.target.value })}
                        className="flex-1 h-7 text-sm"
                        onKeyDown={e => {
                          if (e.key === 'Enter') atualizarSetor.mutate({ id: setor.id, data: { nome: editandoSetor.nome.trim() } });
                          if (e.key === 'Escape') setEditandoSetor(null);
                        }}
                      />
                      <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700" onClick={() => atualizarSetor.mutate({ id: setor.id, data: { nome: editandoSetor.nome.trim() } })}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoSetor(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleExpandido(setor.id)} className="text-sm font-semibold text-slate-800 hover:text-[#1e3a5f] truncate text-left">
                          {setor.nome}
                        </button>
                        <Badge variant="outline" className="text-[10px] py-0">{subs.length} sub</Badge>
                        {setor.status === 'inativo' && <Badge variant="outline" className="text-[10px] py-0 text-slate-400">Inativo</Badge>}
                      </div>
                    </div>
                  )}

                  {!isEdit && podeEditar && (
                    <div className="flex items-center gap-0.5">
                      <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer" title="Ativar/Desativar setor">
                        <Switch
                          checked={setor.status !== 'inativo'}
                          onCheckedChange={(v) => atualizarSetor.mutate({ id: setor.id, data: { status: v ? 'ativo' : 'inativo' } })}
                          className="scale-75"
                        />
                      </label>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoSetor({ id: setor.id, nome: setor.nome })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => {
                          if (subs.length > 0) {
                            if (!confirm(`Excluir "${setor.nome}" e suas ${subs.length} subcategoria(s)?`)) return;
                          } else {
                            if (!confirm(`Excluir o setor "${setor.nome}"?`)) return;
                          }
                          excluirSetor.mutate(setor);
                        }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Subcategorias */}
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 bg-slate-50 border-t">
                    {subs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">Nenhuma subcategoria. Adicione abaixo.</p>
                    ) : (
                      <div className="space-y-1 mt-2">
                        {subs.map(sub => {
                          const isEditSub = editandoSub?.id === sub.id;
                          return (
                            <div key={sub.id} className="flex items-center gap-2 p-1.5 bg-white rounded-md border text-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#1e3a5f] flex-shrink-0" />
                              {isEditSub ? (
                                <>
                                  <Input
                                    value={editandoSub.nome}
                                    autoFocus
                                    onChange={e => setEditandoSub({ ...editandoSub, nome: e.target.value })}
                                    className="flex-1 h-6 text-xs"
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') atualizarSub.mutate({ id: sub.id, data: { nome: editandoSub.nome.trim() } });
                                      if (e.key === 'Escape') setEditandoSub(null);
                                    }}
                                  />
                                  <Button size="icon" className="h-6 w-6 bg-green-600 hover:bg-green-700" onClick={() => atualizarSub.mutate({ id: sub.id, data: { nome: editandoSub.nome.trim() } })}>
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditandoSub(null)}>
                                    <X className="w-3 h-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-xs text-slate-700">{sub.nome}</span>
                                  <Switch
                                    checked={sub.ativo !== false}
                                    onCheckedChange={(v) => atualizarSub.mutate({ id: sub.id, data: { ativo: v } })}
                                    className="scale-50"
                                  />
                                  {podeEditar && (
                                    <>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditandoSub({ id: sub.id, nome: sub.nome })}>
                                        <Pencil className="w-3 h-3" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => { if (confirm('Excluir subcategoria?')) excluirSub.mutate(sub.id); }}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Adicionar subcategoria */}
                    {podeEditar && (
                      <div className="flex gap-1.5 mt-2 items-center">
                        <Input
                          value={novoSub[setor.id] || ''}
                          onChange={e => setNovoSub(prev => ({ ...prev, [setor.id]: e.target.value }))}
                          placeholder="Nova subcategoria..."
                          className="flex-1 h-7 text-xs"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (novoSub[setor.id] || '').trim()) criarSub.mutate({ setorId: setor.id, setorNome: setor.nome, nome: novoSub[setor.id] });
                          }}
                        />
                        <Button size="icon" className="h-7 w-7 bg-[#1e3a5f] hover:bg-[#2a4a73]"
                          onClick={() => { const v = (novoSub[setor.id] || '').trim(); if (v) criarSub.mutate({ setorId: setor.id, setorNome: setor.nome, nome: v }); }}
                          disabled={criarSub.isPending}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
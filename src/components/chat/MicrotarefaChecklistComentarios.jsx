import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Check, Plus, Trash2, MessageSquare, Loader2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const parseChecklist = (jsonStr) => {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function MicrotarefaChecklistComentarios({ tarefa, empresaId, user }) {
  const [checklist, setChecklist] = useState([]);
  const [novoItem, setNovoItem] = useState('');
  const [salvandoChecklist, setSalvandoChecklist] = useState(false);
  const [comentarios, setComentarios] = useState([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [salvandoComentario, setSalvandoComentario] = useState(false);
  const [carregandoComentarios, setCarregandoComentarios] = useState(true);
  const [aba, setAba] = useState('checklist'); // 'checklist' | 'comentarios'

  useEffect(() => {
    setChecklist(parseChecklist(tarefa?.checklist));
  }, [tarefa?.id, tarefa?.checklist]);

  const carregarComentarios = useCallback(async () => {
    if (!tarefa?.id || !empresaId) return;
    setCarregandoComentarios(true);
    try {
      const resp = await base44.entities.ComentarioTarefa.filter(
        { tarefa_id: tarefa.id, empresa_id: empresaId },
        'created_date',
        200
      );
      setComentarios(resp || []);
    } catch (e) {
      console.error('Erro ao carregar comentários:', e);
    } finally {
      setCarregandoComentarios(false);
    }
  }, [tarefa?.id, empresaId]);

  useEffect(() => {
    carregarComentarios();
  }, [carregarComentarios]);

  const salvarChecklist = async (novaLista) => {
    setSalvandoChecklist(true);
    try {
      await base44.entities.Tarefa.update(tarefa.id, {
        checklist: JSON.stringify(novaLista),
      });
      setChecklist(novaLista);
    } catch (e) {
      console.error('Erro ao salvar checklist:', e);
    } finally {
      setSalvandoChecklist(false);
    }
  };

  const adicionarItem = () => {
    if (!novoItem.trim()) return;
    const novaLista = [...checklist, { id: Date.now().toString(), texto: novoItem.trim(), checked: false }];
    salvarChecklist(novaLista);
    setNovoItem('');
  };

  const toggleItem = (id) => {
    const novaLista = checklist.map(item => item.id === id ? { ...item, checked: !item.checked } : item);
    salvarChecklist(novaLista);
  };

  const removerItem = (id) => {
    const novaLista = checklist.filter(item => item.id !== id);
    salvarChecklist(novaLista);
  };

  const adicionarComentario = async () => {
    if (!novoComentario.trim()) return;
    setSalvandoComentario(true);
    try {
      const comentario = await base44.entities.ComentarioTarefa.create({
        tarefa_id: tarefa.id,
        empresa_id: empresaId,
        usuario_id: user?.id || user?.auth_id || '',
        usuario_nome: user?.nome_perfil || user?.full_name || user?.email || 'Atendente',
        mensagem: novoComentario.trim(),
        tipo: 'comentario',
      });
      setComentarios(prev => [...prev, comentario]);
      setNovoComentario('');
    } catch (e) {
      console.error('Erro ao salvar comentário:', e);
    } finally {
      setSalvandoComentario(false);
    }
  };

  const itensConcluidos = checklist.filter(i => i.checked).length;
  const totalItens = checklist.length;

  return (
    <div className="mt-2 border-t border-black/5 pt-2">
      {/* Abas */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setAba('checklist')}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
            aba === 'checklist' ? 'bg-amber-100 text-amber-900' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <ListChecks className="h-3 w-3" />
          Checklist
          {totalItens > 0 && (
            <span className={`rounded-full px-1 text-[9px] ${itensConcluidos === totalItens ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-700'}`}>
              {itensConcluidos}/{totalItens}
            </span>
          )}
        </button>
        <button
          onClick={() => setAba('comentarios')}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
            aba === 'comentarios' ? 'bg-amber-100 text-amber-900' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="h-3 w-3" />
          Comentários
          {comentarios.length > 0 && (
            <span className="rounded-full bg-slate-300 px-1 text-[9px] text-slate-700">{comentarios.length}</span>
          )}
        </button>
      </div>

      {/* Checklist */}
      {aba === 'checklist' && (
        <div className="space-y-1.5">
          {checklist.length === 0 && (
            <p className="text-[11px] text-slate-400 py-1">Nenhum item no checklist ainda.</p>
          )}
          {checklist.map(item => (
            <div key={item.id} className="group flex items-center gap-2 rounded-md bg-white/60 px-2 py-1.5">
              <button
                onClick={() => toggleItem(item.id)}
                disabled={salvandoChecklist}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                  item.checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-amber-400'
                }`}
              >
                {item.checked && <Check className="h-2.5 w-2.5" />}
              </button>
              <span className={`flex-1 text-[11px] ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                {item.texto}
              </span>
              <button
                onClick={() => removerItem(item.id)}
                disabled={salvandoChecklist}
                className="text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex gap-1.5">
            <Input
              value={novoItem}
              onChange={e => setNovoItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionarItem()}
              placeholder="Adicionar item ao checklist..."
              className="h-7 flex-1 text-[11px]"
              disabled={salvandoChecklist}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={adicionarItem}
              disabled={salvandoChecklist || !novoItem.trim()}
            >
              {salvandoChecklist ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {/* Comentários */}
      {aba === 'comentarios' && (
        <div className="space-y-1.5">
          {carregandoComentarios ? (
            <div className="flex justify-center py-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /></div>
          ) : (
            <>
              {comentarios.length === 0 && (
                <p className="text-[11px] text-slate-400 py-1">Nenhum comentário ainda.</p>
              )}
              <div className="max-h-32 space-y-1.5 overflow-y-auto">
                {comentarios.map(c => (
                  <div key={c.id} className="rounded-md bg-white/60 px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-600">{c.usuario_nome || 'Atendente'}</span>
                    </div>
                    <p className="text-[11px] text-slate-700 mt-0.5">{c.mensagem}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={novoComentario}
                  onChange={e => setNovoComentario(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarComentario()}
                  placeholder="Escrever comentário..."
                  className="h-7 flex-1 text-[11px]"
                  disabled={salvandoComentario}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={adicionarComentario}
                  disabled={salvandoComentario || !novoComentario.trim()}
                >
                  {salvandoComentario ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
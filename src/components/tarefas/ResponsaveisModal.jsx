import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Search } from 'lucide-react';

function Iniciais({ nome, foto, size = 'md' }) {
  const initials = (nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-12 h-12 text-sm';
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length];
  if (foto) {
    return (
      <img src={foto} alt={nome} className={`${sz} rounded-full object-cover`} />
    );
  }
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold`}>
      {initials}
    </div>
  );
}

export default function ResponsaveisModal({ open, onOpenChange, tarefa, colaboradores = [], onUpdate }) {
  const [showAdicionarMenu, setShowAdicionarMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  if (!tarefa) return null;

  let responsaveisIds = [];
  try {
    responsaveisIds = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : [];
  } catch {}

  if (tarefa.responsavel_principal_id && !responsaveisIds.includes(tarefa.responsavel_principal_id)) {
    responsaveisIds = [tarefa.responsavel_principal_id, ...responsaveisIds];
  }

  const responsaveis = responsaveisIds
    .map(id => colaboradores.find(c => c.id === id))
    .filter(Boolean);

  const naoAtribuidos = colaboradores.filter(c => !responsaveisIds.includes(c.id));

  const naoAtribuidosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return naoAtribuidos;
    const term = searchTerm.toLowerCase();
    return naoAtribuidos.filter(c => c.nome?.toLowerCase().includes(term));
  }, [naoAtribuidos, searchTerm]);

  const handleAdicionarResponsavel = async (colaboradorId) => {
    const novaLista = [...responsaveisIds, colaboradorId];
    await onUpdate(tarefa.id, { responsaveis_ids: JSON.stringify(novaLista) });
    setShowAdicionarMenu(false);
  };

  const handleRemoverResponsavel = async (colaboradorId) => {
    const novaLista = responsaveisIds.filter(id => id !== colaboradorId);
    await onUpdate(tarefa.id, { responsaveis_ids: JSON.stringify(novaLista) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Responsáveis</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {responsaveis.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum responsável atribuído.</p>
          )}

          {responsaveis.map((colab, idx) => (
            <div key={colab.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
              <Iniciais nome={colab.nome} foto={colab.foto_perfil} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm truncate">{colab.nome}</p>
                <p className="text-xs text-slate-500 capitalize">{colab.perfil || 'Colaborador'}</p>
              </div>
              {idx === 0 && responsaveisIds.length > 1 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold flex-shrink-0">Principal</span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-slate-400 hover:text-red-500"
                onClick={() => handleRemoverResponsavel(colab.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}

          {showAdicionarMenu ? (
            <div className="border rounded-lg bg-slate-50 overflow-y-auto max-h-48" style={{ scrollbarWidth: 'auto', scrollbarColor: '#cbd5e1 transparent' }}>
              <style>{`
                div::-webkit-scrollbar {
                  width: 8px;
                }
                div::-webkit-scrollbar-track {
                  background: transparent;
                }
                div::-webkit-scrollbar-thumb {
                  background-color: #cbd5e1;
                  border-radius: 4px;
                  border: 2px solid transparent;
                  background-clip: content-box;
                }
                div::-webkit-scrollbar-thumb:hover {
                  background-color: #94a3b8;
                }
              `}</style>
              <div className="space-y-1 p-2">
                {naoAtribuidos.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">Todos os colaboradores já estão atribuídos.</p>
                ) : (
                  naoAtribuidos.map(colab => (
                    <button
                      key={colab.id}
                      onClick={() => handleAdicionarResponsavel(colab.id)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-200 rounded transition-colors text-left"
                    >
                      <Iniciais nome={colab.nome} foto={colab.foto_perfil} size="sm" />
                      <span className="text-xs font-medium truncate">{colab.nome}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAdicionarMenu(true)}
              variant="outline"
              className="w-full gap-2 text-xs"
              disabled={naoAtribuidos.length === 0}
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Responsável
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
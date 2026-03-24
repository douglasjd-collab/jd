import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

function Iniciais({ nome, foto, size = 'sm' }) {
  const initials = (nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length];
  if (foto) {
    return (
      <img src={foto} alt={nome} className={`${sz} rounded-full object-cover flex-shrink-0`} />
    );
  }
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

export default function SelecionarStatusResponsaveisModal({
  open,
  onOpenChange,
  tarefa,
  statusList,
  colaboradores,
  onUpdate,
}) {
  const [statusSelecionado, setStatusSelecionado] = useState(tarefa?.status);
  const [responsaveisSelecionados, setResponsaveisSelecionados] = useState(() => {
    let ids = [];
    try {
      ids = tarefa?.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : [];
    } catch {}
    if (ids.length === 0 && tarefa?.responsavel_principal_id) {
      return [tarefa.responsavel_principal_id];
    }
    return ids;
  });

  const handleSalvar = () => {
    const updates = { status: statusSelecionado };
    if (responsaveisSelecionados.length > 0) {
      const nomes = responsaveisSelecionados.map(
        id => colaboradores.find(c => c.id === id)?.nome || ''
      );
      updates.responsaveis_ids = JSON.stringify(responsaveisSelecionados);
      updates.responsaveis_nomes = JSON.stringify(nomes);
      updates.responsavel_principal_id = responsaveisSelecionados[0];
      updates.responsavel_principal_nome = nomes[0];
    } else {
      updates.responsavel_principal_id = null;
      updates.responsavel_principal_nome = null;
      updates.responsaveis_ids = JSON.stringify([]);
      updates.responsaveis_nomes = JSON.stringify([]);
    }
    onUpdate(tarefa.id, updates);
    onOpenChange(false);
  };

  const toggleResponsavel = (colab) => {
    setResponsaveisSelecionados(prev => {
      if (prev.includes(colab.id)) {
        return prev.filter(id => id !== colab.id);
      } else {
        return [...prev, colab.id];
      }
    });
  };

  if (!tarefa) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Editar Status e Responsáveis</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status */}
          <div>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-3">Status</h3>
            <div className="space-y-2">
              {statusList.map(s => (
                <button
                  key={s.slug || s.id}
                  onClick={() => setStatusSelecionado(s.slug)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all hover:bg-slate-50"
                  style={{
                    borderColor: statusSelecionado === s.slug ? s.cor : '#e2e8f0',
                    backgroundColor: statusSelecionado === s.slug ? `${s.cor}10` : 'transparent',
                  }}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                  <span className="flex-1 text-sm font-medium text-slate-700">{s.nome}</span>
                  {statusSelecionado === s.slug && <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Responsáveis */}
          <div>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-3">Responsáveis</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {colaboradores.map(colab => {
                const isSelected = responsaveisSelecionados.includes(colab.id);
                return (
                  <button
                    key={colab.id}
                    onClick={() => toggleResponsavel(colab)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all hover:bg-slate-50"
                    style={{
                      borderColor: isSelected ? '#3b82f6' : '#e2e8f0',
                      backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                    }}
                  >
                    <Iniciais nome={colab.nome} foto={colab.foto_perfil} size="sm" />
                    <span className="flex-1 text-sm font-medium text-slate-700 truncate">{colab.nome}</span>
                    {isSelected && <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                  </button>
                );
              })}
              {colaboradores.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum colaborador</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="bg-[#1e3a5f] hover:bg-[#162d4a]" onClick={handleSalvar}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

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

export default function ResponsaveisModal({ open, onOpenChange, tarefa, colaboradores = [] }) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Responsáveis</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {responsaveis.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum responsável atribuído.</p>
          )}

          {responsaveis.map((colab, idx) => (
            <div key={colab.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
              <Iniciais nome={colab.nome} foto={colab.foto_perfil} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm truncate">{colab.nome}</p>
                <p className="text-xs text-slate-500 capitalize">{colab.perfil || 'Colaborador'}</p>
              </div>
              {idx === 0 && responsaveisIds.length > 1 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">Principal</span>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
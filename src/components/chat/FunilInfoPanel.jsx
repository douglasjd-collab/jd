import React from 'react';
import { Button } from '@/components/ui/button';

export default function FunilInfoPanel({ oportunidade, onMoverClick }) {
  if (!oportunidade) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">Funil de Vendas</span>
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-5 text-[9px] px-1.5 text-blue-600 hover:bg-blue-50"
          onClick={onMoverClick}
        >
          Mover
        </Button>
      </div>
      
      {/* Funil */}
      <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
        <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">Funil</p>
        <p className="text-[12px] font-bold text-blue-900 capitalize mt-0.5">{oportunidade.produto}</p>
      </div>
      
      {/* Etapa Atual */}
      <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200">
        <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">Coluna Atual</p>
        <p className="text-[12px] font-bold text-emerald-900 mt-0.5">{oportunidade.etapa_nome}</p>
      </div>
      
      {/* Título */}
      {oportunidade.titulo && (
        <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Oportunidade</p>
          <p className="text-[12px] text-slate-700 mt-0.5">{oportunidade.titulo}</p>
        </div>
      )}
    </div>
  );
}
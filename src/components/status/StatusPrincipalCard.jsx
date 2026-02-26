import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Plus } from 'lucide-react';

const COR_MAP = {
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-800' },
  green:   { bg: 'bg-green-100',   text: 'text-green-800' },
  red:     { bg: 'bg-red-100',     text: 'text-red-800' },
  yellow:  { bg: 'bg-yellow-100',  text: 'text-yellow-800' },
  purple:  { bg: 'bg-purple-100',  text: 'text-purple-800' },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-800' },
  teal:    { bg: 'bg-teal-100',    text: 'text-teal-800' },
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-800' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  slate:   { bg: 'bg-slate-100',   text: 'text-slate-800' },
};

const FUNCAO_LABEL = {
  em_digitacao: 'Em Digitação',
  em_analise:   'Em Análise',
  aprovado:     'Aprovado',
  reprovado:    'Reprovado',
  finalizado:   'Finalizado',
  cancelado:    'Cancelado',
  pendente:     'Pendente',
};

const FUNCAO_COLOR = {
  em_digitacao: 'bg-slate-100 text-slate-700',
  em_analise:   'bg-blue-100 text-blue-700',
  aprovado:     'bg-green-100 text-green-700',
  reprovado:    'bg-red-100 text-red-700',
  finalizado:   'bg-emerald-100 text-emerald-700',
  cancelado:    'bg-red-100 text-red-700',
  pendente:     'bg-yellow-100 text-yellow-700',
};

export default function StatusPrincipalCard({ principal, substatus, onEditPrincipal, onDeletePrincipal, onAddSubstatus, onEditSubstatus, onDeleteSubstatus }) {
  const cor = COR_MAP[principal.cor] || COR_MAP.slate;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: getBorderColor(principal.cor) }}>
      <CardContent className="p-0">
        {/* Status Principal */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
          <div className="flex items-center gap-3">
            <Badge className={`${cor.bg} ${cor.text} font-semibold`}>{principal.nome}</Badge>
            {principal.funcao_fluxo && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FUNCAO_COLOR[principal.funcao_fluxo] || 'bg-slate-100 text-slate-600'}`}>
                {FUNCAO_LABEL[principal.funcao_fluxo] || principal.funcao_fluxo}
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="ghost" size="sm" onClick={() => onAddSubstatus(principal)}>
              <Plus className="w-4 h-4 mr-1" />
              <span className="text-xs">Substatus</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEditPrincipal(principal)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDeletePrincipal(principal)}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </div>

        {/* Substatus */}
        {substatus.length > 0 && (
          <div className="divide-y">
            {substatus.map(sub => {
              const subCor = COR_MAP[sub.cor || principal.cor] || COR_MAP.slate;
              return (
                <div key={sub.id} className="flex items-center justify-between px-6 py-2 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-300 text-xs">└</span>
                    <Badge variant="outline" className={`${subCor.bg} ${subCor.text} text-xs`}>{sub.nome}</Badge>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${FUNCAO_COLOR[principal.funcao_fluxo] || 'bg-slate-100 text-slate-600'}`}>
                      {FUNCAO_LABEL[principal.funcao_fluxo] || 'Herdado'}
                    </span>
                    {sub.origem === 'importacao' && (
                      <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded">importado</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEditSubstatus(sub)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDeleteSubstatus(sub)}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {substatus.length === 0 && (
          <div className="px-6 py-2 text-xs text-slate-400 italic">Nenhum substatus</div>
        )}
      </CardContent>
    </Card>
  );
}

function getBorderColor(cor) {
  const colors = {
    blue: '#3b82f6', green: '#22c55e', red: '#ef4444', yellow: '#eab308',
    purple: '#a855f7', orange: '#f97316', teal: '#14b8a6', indigo: '#6366f1',
    emerald: '#10b981', slate: '#94a3b8',
  };
  return colors[cor] || colors.slate;
}
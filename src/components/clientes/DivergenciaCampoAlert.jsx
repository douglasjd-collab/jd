import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Alerta inline exibido sob um campo do formulário quando a informação lida
 * no documento é DIFERENTE da que já está cadastrada. Nenhuma alteração é feita
 * automaticamente — o usuário precisa revisar manualmente.
 */
export default function DivergenciaCampoAlert({ divergencias }) {
  if (!divergencias || divergencias.length === 0) return null;

  return (
    <div className="col-span-2 space-y-2 mt-1">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-900">
          <p className="font-semibold mb-1">A informação encontrada no documento é diferente da informação cadastrada. Nenhuma alteração foi realizada.</p>
          <div className="space-y-1.5">
            {divergencias.map((d, i) => (
              <div key={i} className="border-l-2 border-amber-400 pl-2">
                <p className="font-medium">{d.label}</p>
                <p>Atual: <span className="font-mono">{d.valorAtual || '—'}</span></p>
                <p>Documento: <span className="font-mono">{d.valorNovo || '—'}</span></p>
                <p className="text-amber-700">Origem: {d.origem}</p>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-amber-700">Caso seja necessário alterar, faça manualmente.</p>
        </div>
      </div>
    </div>
  );
}
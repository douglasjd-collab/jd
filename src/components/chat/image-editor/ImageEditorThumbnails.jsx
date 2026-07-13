import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

export default function ImageEditorThumbnails({
  paginas, indiceAtual, setIndiceAtual, onRemover, onAdicionarMais, legenda, setLegenda, fileInputRef,
}) {
  return (
    <div className="bg-slate-900 border-t border-slate-800 px-3 py-2">
      {paginas.length > 1 && (
        <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
          {paginas.map((p, i) => (
            <div key={p.id} className="relative flex-shrink-0">
              <button
                onClick={() => setIndiceAtual(i)}
                className={`w-14 h-14 rounded-lg overflow-hidden border-2 ${i === indiceAtual ? 'border-blue-500' : 'border-slate-700'}`}
              >
                <img src={p.preview || p.url} alt={`Imagem ${i + 1}`} className="w-full h-full object-cover" />
              </button>
              <button
                onClick={() => onRemover(i)}
                className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 rounded-full w-4 h-4 flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          ))}
          <button onClick={onAdicionarMais} className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center flex-shrink-0 hover:border-blue-500">
            <Plus className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        {paginas.length === 1 && (
          <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-slate-800 flex-shrink-0" onClick={onAdicionarMais} title="Adicionar mais imagens">
            <Plus className="w-4 h-4" />
          </Button>
        )}
        <Input
          value={legenda}
          onChange={(e) => setLegenda(e.target.value)}
          placeholder="Digite uma mensagem"
          className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
        />
      </div>
    </div>
  );
}
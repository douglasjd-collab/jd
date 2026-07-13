import React from 'react';
import { Button } from '@/components/ui/button';
import {
  MousePointer2, Pencil, Highlighter, Circle, Square, ArrowUpRight, Minus, Type,
  ListOrdered, Eraser, Crop, Droplets, Grid3x3,
} from 'lucide-react';
import { CORES_PALETA, ESPESSURAS, OPACIDADES, STAMPS, EMOJIS_RAPIDOS } from './imageEditorHelpers';

const FERRAMENTAS = [
  { id: 'select', icon: MousePointer2, label: 'Selecionar' },
  { id: 'pen', icon: Pencil, label: 'Desenho livre' },
  { id: 'highlighter', icon: Highlighter, label: 'Marca-texto' },
  { id: 'rect', icon: Square, label: 'Retângulo' },
  { id: 'circle', icon: Circle, label: 'Círculo' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Seta' },
  { id: 'line', icon: Minus, label: 'Linha' },
  { id: 'text', icon: Type, label: 'Texto' },
  { id: 'numero', icon: ListOrdered, label: 'Numeração' },
  { id: 'ocultar', icon: Droplets, label: 'Ocultar dados' },
  { id: 'crop', icon: Crop, label: 'Recortar' },
];

export default function ImageEditorToolbar({
  tool, setTool, cor, setCor, espessura, setEspessura, opacidade, setOpacidade,
  onInserirEmoji, onInserirStamp, modoOcultar, setModoOcultar,
}) {
  return (
    <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        {FERRAMENTAS.map((f) => (
          <Button
            key={f.id}
            size="icon"
            variant={tool === f.id ? 'default' : 'ghost'}
            className={tool === f.id ? 'bg-blue-600 hover:bg-blue-700' : 'text-slate-300 hover:bg-slate-800'}
            title={f.label}
            onClick={() => setTool(f.id)}
          >
            <f.icon className="w-4 h-4" />
          </Button>
        ))}
      </div>

      {tool === 'ocultar' && (
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          <Button size="sm" variant={modoOcultar === 'borrar' ? 'default' : 'ghost'} className="text-xs h-7" onClick={() => setModoOcultar('borrar')}>Desfoque</Button>
          <Button size="sm" variant={modoOcultar === 'pixelizar' ? 'default' : 'ghost'} className="text-xs h-7" onClick={() => setModoOcultar('pixelizar')}>
            <Grid3x3 className="w-3.5 h-3.5 mr-1" /> Pixelizar
          </Button>
        </div>
      )}

      <div className="w-px h-6 bg-slate-700" />

      {/* Paleta de cores */}
      <div className="flex items-center gap-1">
        {CORES_PALETA.map((c) => (
          <button
            key={c}
            onClick={() => setCor(c)}
            className={`w-5 h-5 rounded-full border-2 ${cor === c ? 'border-blue-400' : 'border-slate-600'}`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent" title="Cor personalizada" />
      </div>

      <div className="w-px h-6 bg-slate-700" />

      {/* Espessura */}
      <select value={espessura} onChange={(e) => setEspessura(Number(e.target.value))} className="bg-slate-800 text-slate-200 text-xs rounded px-1.5 py-1 border border-slate-700">
        {ESPESSURAS.map((e) => <option key={e} value={e}>{e}px</option>)}
      </select>

      {/* Opacidade */}
      <select value={opacidade} onChange={(e) => setOpacidade(Number(e.target.value))} className="bg-slate-800 text-slate-200 text-xs rounded px-1.5 py-1 border border-slate-700">
        {OPACIDADES.map((o) => <option key={o} value={o}>{Math.round(o * 100)}%</option>)}
      </select>

      <div className="w-px h-6 bg-slate-700" />

      {/* Emojis rápidos */}
      <div className="flex items-center gap-0.5">
        {EMOJIS_RAPIDOS.map((e) => (
          <button key={e} onClick={() => onInserirEmoji(e)} className="text-base hover:scale-125 transition-transform" title="Inserir">{e}</button>
        ))}
      </div>

      <div className="w-px h-6 bg-slate-700" />

      {/* Carimbos rápidos */}
      <div className="flex items-center gap-1 flex-wrap max-w-xs">
        {STAMPS.slice(0, 4).map((s) => (
          <button key={s} onClick={() => onInserirStamp(s)} className="text-[10px] font-bold text-slate-300 border border-slate-700 rounded px-1.5 py-0.5 hover:bg-slate-800">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Undo2, Redo2, RotateCcw, Save, Download, Send, Loader2, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react';

export default function ImageEditorHeader({
  nomeCliente, onClose, onUndo, onRedo, canUndo, canRedo, onRestaurar,
  onSalvarRascunho, onBaixar, onEnviar, enviando, salvando,
  onRotateLeft, onRotateRight, onFlipH, onFlipV, qualidade, setQualidade,
}) {
  return (
    <div className="bg-slate-900 text-white border-b border-slate-800">
      {/* Linha 1: sempre visível — para quem está enviando + ações principais */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800 gap-1.5 text-xs flex-shrink-0" onClick={onClose} title="Fechar e voltar para o bate-papo">
          <X className="w-4 h-4" /> Fechar
        </Button>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[11px] text-slate-400 flex-shrink-0">Enviando para:</span>
          <span className="text-sm font-semibold truncate">{nomeCliente || 'Contato'}</span>
        </div>

        <select value={qualidade} onChange={(e) => setQualidade(e.target.value)} className="bg-slate-800 text-slate-200 text-xs rounded px-1.5 py-1.5 border border-slate-700 flex-shrink-0" title="Qualidade da imagem">
          <option value="alta">Alta qualidade</option>
          <option value="automatica">Qualidade automática</option>
          <option value="reduzida">Tamanho reduzido</option>
        </select>

        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800 gap-1.5 text-xs flex-shrink-0" onClick={onSalvarRascunho} disabled={salvando}>
          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Rascunho
        </Button>
        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800 gap-1.5 text-xs flex-shrink-0" onClick={onBaixar}>
          <Download className="w-3.5 h-3.5" /> Baixar
        </Button>
        <Button size="sm" className="bg-[#23BE84] hover:bg-[#1da570] gap-1.5 text-xs flex-shrink-0" onClick={onEnviar} disabled={enviando}>
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Enviar
        </Button>
      </div>

      {/* Linha 2: ferramentas de edição */}
      <div className="px-4 py-1.5 flex items-center gap-1 flex-wrap border-t border-slate-800/60">
        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800 gap-1.5 text-xs" onClick={onUndo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
          <Undo2 className="w-4 h-4" /> Desfazer
        </Button>
        <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-slate-800" onClick={onRedo} disabled={!canRedo} title="Refazer (Ctrl+Y)">
          <Redo2 className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-slate-800" onClick={onRotateLeft} title="Girar à esquerda">
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-slate-800" onClick={onRotateRight} title="Girar à direita">
          <RotateCw className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-slate-800" onClick={onFlipH} title="Espelhar horizontal">
          <FlipHorizontal className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-slate-800" onClick={onFlipV} title="Espelhar vertical">
          <FlipVertical className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800 gap-1.5 text-xs" onClick={onRestaurar} title="Restaurar imagem original">
          Restaurar original
        </Button>
      </div>
    </div>
  );
}
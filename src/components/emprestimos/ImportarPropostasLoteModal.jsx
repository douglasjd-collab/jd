import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportarPropostasLoteModal({ open, onOpenChange }) {
  const [arquivo, setArquivo] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    const extensao = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(extensao)) {
      toast.error('Apenas arquivos Excel (.xlsx ou .xls) são aceitos');
      return;
    }
    setArquivo(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleClose = () => {
    setArquivo(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Importar Propostas em Lote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">
            Selecione um arquivo Excel (.xlsx ou .xls) com as propostas para importar em lote.
          </p>

          {/* Área de upload */}
          {!arquivo ? (
            <div
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                dragging ? 'border-green-500 bg-green-50' : 'border-slate-300 hover:border-green-400 hover:bg-slate-50'
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-10 h-10 text-slate-400" />
              <div className="text-center">
                <p className="font-medium text-slate-700">Clique para selecionar ou arraste o arquivo</p>
                <p className="text-sm text-slate-400 mt-1">Formato aceito: .xlsx, .xls</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="border-2 border-green-400 bg-green-50 rounded-xl p-5 flex items-center gap-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-green-900 truncate">{arquivo.name}</p>
                <p className="text-sm text-green-700">{(arquivo.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setArquivo(null)}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              disabled={!arquivo}
              className="bg-green-600 hover:bg-green-700 gap-2"
              onClick={() => toast.info('Funcionalidade de importação será configurada em breve.')}
            >
              <Upload className="w-4 h-4" />
              Importar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
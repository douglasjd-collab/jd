import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Download, Loader2 } from 'lucide-react';

export default function ImportarPlanosCSV({ open, onOpenChange }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleDownloadTemplate = () => {
    const template = `plano,produto,nome_bem,reajuste_tipo,sem_reserva,valor_bem,prazo_meses,parcela
Plano Auto 120,Automóvel,Automóvel Básico,IPCA,false,50000,120,500
Plano Imóvel 180,Imóvel,Imóvel Residencial,FABRICANTE,false,300000,180,2000`;
    
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_planos.csv';
    link.click();
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Selecione um arquivo CSV');
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      const response = await base44.functions.invoke('importarPlanosCSV', {
        csv_data: text
      });

      if (response.data.success) {
        toast.success(
          `Importação concluída: ${response.data.criados} criados, ${response.data.atualizados} atualizados`
        );
        setFile(null);
        onOpenChange(false);
      } else {
        toast.error(response.data.error || 'Erro ao importar');
      }
    } catch (error) {
      toast.error('Erro ao processar arquivo: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Planos via CSV</DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo CSV com os dados dos planos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id="csv-input"
            />
            <label htmlFor="csv-input" className="cursor-pointer">
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-medium">{file?.name || 'Clique para selecionar o CSV'}</p>
              <p className="text-xs text-slate-500 mt-1">ou arraste aqui</p>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadTemplate}
              className="flex-1 gap-2"
            >
              <Download className="w-4 h-4" />
              Template
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || uploading}
              className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              Importar
            </Button>
          </div>

          <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded">
            <strong>Colunas esperadas:</strong> plano, produto, nome_bem, reajuste_tipo, sem_reserva, valor_bem, prazo_meses, parcela
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
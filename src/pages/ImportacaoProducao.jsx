import React, { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportacaoProducao() {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    toast.info('Funcionalidade em desenvolvimento');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação de Produção"
        subtitle="Importe dados de produção e vendas"
        backTo="Importacao"
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-6">
          <div>
            <Label>Arquivo de Produção *</Label>
            <div className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                    <span className="text-slate-500">Processando arquivo...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400" />
                    <span className="text-slate-500">
                      {file ? file.name : 'Clique para selecionar arquivo'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Formatos aceitos: CSV, Excel
                    </span>
                  </div>
                )}
              </label>
            </div>
          </div>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Funcionalidade em Desenvolvimento</p>
                <p className="mt-1">A importação de produção será implementada em breve.</p>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
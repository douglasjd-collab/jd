import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportarPlanosCanopusPDF({ open, onOpenChange, standalone = false }) {
  const [file, setFile] = useState(null);
  const [produtoId, setProdutoId] = useState('101');
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo PDF');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('produto_id', produtoId);

      // Chamar a função diretamente via fetch
      const user = await base44.auth.me();
      const response = await fetch('/api/apps/6950a9860c8af0e2ff10fc9e/functions/importPlanosCanopusPDF', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao importar PDF');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['planos-canopus'] });
      toast.success(`Importação concluída! ${data.criados} criados, ${data.atualizados} atualizados`);
      setFile(null);
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err.message || 'Erro ao importar PDF';
      toast.error(msg);
    }
  });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
    } else {
      toast.error('Por favor, selecione um arquivo PDF válido');
    }
  };

  const handleImport = () => {
    importMutation.mutate();
  };

  if (standalone) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Upload do PDF</h2>
            <p className="text-sm text-slate-600 mb-6">
              Envie um PDF com a tabela de planos para importação automática
            </p>
          </div>

          <div className="space-y-4">
          <div>
            <Label>Tipo de Produto</Label>
            <Select value={produtoId} onValueChange={setProdutoId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="101">Automóveis (101)</SelectItem>
                <SelectItem value="102">Imóveis (102)</SelectItem>
                <SelectItem value="103">Motocicletas (103)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Arquivo PDF</Label>
            <div className="mt-2">
              <label
                htmlFor="pdf-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-8 h-8 text-emerald-600" />
                    <p className="text-sm text-slate-600">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400" />
                    <p className="text-sm text-slate-600">
                      Clique para selecionar um PDF
                    </p>
                    <p className="text-xs text-slate-400">
                      Tamanho máximo: 10MB
                    </p>
                  </div>
                )}
                <input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-blue-800">
                <p className="font-medium">Formato esperado:</p>
                <ul className="mt-1 space-y-1 text-xs">
                  <li>• Tabela com colunas: Código, Descrição, Crédito, Prazos</li>
                  <li>• Valores de parcelas para diferentes prazos (36, 48, 60, 72, 96 meses)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleImport}
              disabled={!file || importMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Importando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Importar Planos
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Planos do PDF</DialogTitle>
          <DialogDescription>
            Envie um PDF com a tabela de planos para importação automática
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Tipo de Produto</Label>
            <Select value={produtoId} onValueChange={setProdutoId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="101">Automóveis (101)</SelectItem>
                <SelectItem value="102">Imóveis (102)</SelectItem>
                <SelectItem value="103">Motocicletas (103)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Arquivo PDF</Label>
            <div className="mt-2">
              <label
                htmlFor="pdf-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-8 h-8 text-emerald-600" />
                    <p className="text-sm text-slate-600">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400" />
                    <p className="text-sm text-slate-600">
                      Clique para selecionar um PDF
                    </p>
                    <p className="text-xs text-slate-400">
                      Tamanho máximo: 10MB
                    </p>
                  </div>
                )}
                <input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-blue-800">
                <p className="font-medium">Formato esperado:</p>
                <ul className="mt-1 space-y-1 text-xs">
                  <li>• Tabela com múltiplas opções de prazo/parcela por bem</li>
                  <li>• Ao clicar, cada bem mostra variações de prazo (36-96 meses)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || importMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Importando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Importar Planos
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function ImportarPropostasLoteModal({ open, onOpenChange, onSuccess }) {
  const [arquivo, setArquivo] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    const extensao = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(extensao)) {
      toast.error('Apenas arquivos Excel (.xlsx, .xls) ou CSV são aceitos');
      return;
    }
    setArquivo(file);
    setResultado(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleClose = () => {
    setArquivo(null);
    setResultado(null);
    onOpenChange(false);
  };

  const handleImportar = async () => {
    if (!arquivo) return;
    setLoading(true);
    try {
      // 1. Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file: arquivo });

      // 2. Processar via backend
      const resp = await base44.functions.invoke('importarPropostasEmprestimo', { file_url });
      const data = resp.data;

      if (data.error) {
        toast.error(data.error);
        setResultado({ erro: data.error });
      } else {
        setResultado(data);
        toast.success(`${data.criadas} proposta(s) importada(s) com sucesso!`);
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      toast.error('Erro ao importar: ' + (err?.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
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
          {!resultado ? (
            <>
              <p className="text-sm text-slate-500">
                Selecione um arquivo Excel (.xlsx, .xls) ou CSV com as propostas para importar. As colunas serão detectadas automaticamente.
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
                    <p className="text-sm text-slate-400 mt-1">Formatos aceitos: .xlsx, .xls, .csv</p>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                </div>
              ) : (
                <div className="border-2 border-green-400 bg-green-50 rounded-xl p-5 flex items-center gap-4">
                  <FileText className="w-8 h-8 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-green-900 truncate">{arquivo.name}</p>
                    <p className="text-sm text-green-700">{(arquivo.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setArquivo(null)} disabled={loading}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-700">Colunas sugeridas (em qualquer ordem):</p>
                <p>Nome/Cliente, CPF, Banco, Convênio, Tipo, Valor, Prazo, ADE, Benefício, Data, Vendedor, Status</p>
              </div>
            </>
          ) : (
            /* Resultado */
            <div className="space-y-4">
              {resultado.erro ? (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800">Erro na importação</p>
                    <p className="text-sm text-red-700 mt-1">{resultado.erro}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800">Importação concluída!</p>
                      <p className="text-sm text-green-700 mt-1">
                        <strong>{resultado.criadas}</strong> proposta(s) importada(s)
                        {resultado.ignoradas > 0 && `, ${resultado.ignoradas} ignorada(s)`}
                      </p>
                    </div>
                  </div>

                  {resultado.erros?.length > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs font-semibold text-yellow-800 mb-1">Avisos:</p>
                      {resultado.erros.map((e, i) => (
                        <p key={i} className="text-xs text-yellow-700">{e}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              {resultado ? 'Fechar' : 'Cancelar'}
            </Button>
            {!resultado && (
              <Button
                disabled={!arquivo || loading}
                className="bg-green-600 hover:bg-green-700 gap-2"
                onClick={handleImportar}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loading ? 'Importando...' : 'Importar'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
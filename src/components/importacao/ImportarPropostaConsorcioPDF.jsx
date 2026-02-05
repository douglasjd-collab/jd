import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportarPropostaConsorcioPDF({ onSuccess }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Por favor, selecione um arquivo PDF');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // 1) Upload do arquivo
      toast.message('Fazendo upload do PDF...');
      const uploaded = await base44.integrations.Core.UploadFile({ file });
      const file_url = uploaded?.file_url;

      if (!file_url) {
        throw new Error('Upload não retornou URL do arquivo');
      }

      // 2) Chamar função de importação
      toast.message('Extraindo dados do PDF...');
      const resp = await base44.functions.invoke('importarPropostaConsorcioPDF', {
        file_url,
      });

      if (resp?.data?.ok) {
        setResult({
          success: true,
          data: resp.data
        });
        toast.success('✅ Proposta importada com sucesso!');
        
        if (onSuccess) {
          onSuccess(resp.data);
        }
      } else {
        const errorMsg = resp?.data?.error || resp?.error || 'Falha ao importar proposta';
        setResult({
          success: false,
          error: errorMsg,
          detail: resp?.data?.extracted
        });
        toast.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.message || String(err);
      setResult({
        success: false,
        error: errorMsg
      });
      toast.error('Erro: ' + errorMsg);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
  };

  return (
    <>
      <Button 
        onClick={() => setOpen(true)}
        className="gap-2"
        variant="outline"
      >
        <Upload className="w-4 h-4" />
        Importar Proposta PDF
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Proposta de Consórcio (PDF)</DialogTitle>
            <DialogDescription>
              Faça upload do PDF da proposta Canopus para extrair os dados automaticamente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Upload Area */}
            <Card 
              className="border-2 border-dashed border-slate-300 hover:border-[#23BE84] transition-colors cursor-pointer"
              onClick={() => document.getElementById('pdfPropostaInput').click()}
            >
              <div className="p-8 text-center">
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-[#23BE84] animate-spin" />
                    <p className="text-sm text-slate-600">Processando PDF...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <FileText className="w-12 h-12 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">Clique para selecionar PDF</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Arquivo PDF da proposta Canopus
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <input
              id="pdfPropostaInput"
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handlePickFile}
              disabled={loading}
            />

            {/* Result Display */}
            {result && (
              <Card className={result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {result.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                        {result.success ? 'Importação bem-sucedida!' : 'Erro na importação'}
                      </p>
                      
                      {result.success ? (
                        <div className="mt-2 text-sm text-green-800 space-y-1">
                          {result.data?.extraido && (
                            <>
                              <p><strong>Proposta:</strong> {result.data.extraido.numero_proposta || '-'}</p>
                              <p><strong>Cliente:</strong> {result.data.extraido.nome || '-'}</p>
                              <p><strong>CPF:</strong> {result.data.extraido.cpf || '-'}</p>
                              <p><strong>Plano:</strong> {result.data.extraido.plano || '-'}</p>
                              <p><strong>Valor:</strong> {result.data.extraido.valor_credito?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-'}</p>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-red-800">
                          <p>{result.error}</p>
                          {result.detail && (
                            <div className="mt-2 p-2 bg-red-100 rounded">
                              <p className="font-medium">Dados extraídos:</p>
                              <pre className="text-xs mt-1 whitespace-pre-wrap">
                                {JSON.stringify(result.detail, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Info */}
            <div className="text-xs text-slate-500 space-y-1">
              <p>ℹ️ O sistema irá extrair automaticamente:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>Dados do cliente (nome, CPF, telefone, email)</li>
                <li>Informações da proposta (número, grupo, valor, prazo)</li>
                <li>Detalhes do plano (código, taxa de administração)</li>
              </ul>
              <p className="mt-2">
                ⚠️ PDFs escaneados (imagem) não são suportados. Use apenas PDFs com texto.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
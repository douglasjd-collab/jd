import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function LogoUploader({ open, onOpenChange, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Selecione uma imagem');
      return;
    }

    setUploading(true);
    try {
      // Upload da imagem
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Salvar na configuração do sistema
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
      
      if (configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, {
          valor: file_url
        });
      } else {
        await base44.entities.ConfiguracaoSistema.create({
          chave: 'logo_url',
          valor: file_url,
          descricao: 'Logo principal do sistema',
          tipo: 'url'
        });
      }

      toast.success('Logo atualizada com sucesso!');
      onSuccess?.(file_url);
      onOpenChange(false);
      setPreview(null);
      setFile(null);
    } catch (error) {
      toast.error('Erro ao fazer upload da logo');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Logo do Sistema</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Imagem da Logo</Label>
            <div className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="logo-upload"
              />
              <label htmlFor="logo-upload" className="cursor-pointer">
                {preview ? (
                  <div className="flex flex-col items-center gap-3">
                    <img src={preview} alt="Preview" className="max-h-32 rounded-lg" />
                    <span className="text-sm text-slate-500">Clique para alterar</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon className="w-12 h-12 text-slate-400" />
                    <span className="text-slate-500">Clique para selecionar</span>
                    <span className="text-xs text-slate-400">PNG, JPG ou GIF (máx. 5MB)</span>
                  </div>
                )}
              </label>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              <strong>Importante:</strong> A logo será exibida no cabeçalho do sistema. 
              Recomendamos uma imagem com fundo transparente.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                onOpenChange(false);
                setPreview(null);
                setFile(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Salvar Logo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
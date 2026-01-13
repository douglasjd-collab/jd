import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Loader2, Save, User } from 'lucide-react';
import { toast } from 'sonner';

export default function EditarPerfilModal({ open, onOpenChange, user, onSuccess }) {
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fotoUrl, setFotoUrl] = useState('');

  useEffect(() => {
    if (user) {
      setFotoUrl(user.foto_perfil || '');
    }
  }, [user]);

  const handleFotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    setUploadingFoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFotoUrl(file_url);
      toast.success('Foto carregada! Clique em "Salvar Foto" para confirmar.');
    } catch (error) {
      toast.error('Erro ao fazer upload da foto');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleSalvar = async () => {
    if (!fotoUrl) {
      toast.error('Nenhuma alteração para salvar');
      return;
    }

    setSalvando(true);
    try {
      // Atualizar foto no Colaborador
      if (user.colaborador_id) {
        await base44.entities.Colaborador.update(user.colaborador_id, {
          foto_perfil: fotoUrl
        });
      }

      toast.success('Foto de perfil atualizada com sucesso!');
      
      if (onSuccess) {
        await onSuccess();
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao atualizar foto:', error);
      toast.error('Erro ao atualizar foto: ' + (error.message || 'Tente novamente'));
    } finally {
      setSalvando(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Alterar Foto de Perfil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Foto de Perfil */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {fotoUrl ? (
                <img 
                  src={fotoUrl} 
                  alt="Foto de perfil" 
                  className="w-28 h-28 rounded-full object-cover border-4 border-slate-100 shadow-lg"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg border-4 border-slate-100">
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoUpload}
                className="hidden"
                id="editar-foto-perfil"
                disabled={uploadingFoto}
              />
              <label
                htmlFor="editar-foto-perfil"
                className="absolute bottom-0 right-0 w-10 h-10 bg-[#1e3a5f] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2a4a73] transition-colors shadow-lg border-2 border-white"
              >
                {uploadingFoto ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </label>
            </div>
            <p className="text-sm text-slate-500 text-center">
              Clique no ícone da câmera para alterar a foto
            </p>
          </div>

          {/* Informações do perfil (apenas leitura) */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Nome:</span>
              <span className="font-medium">{user.full_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Email:</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Perfil:</span>
              <span className="font-medium capitalize">{user.perfil}</span>
            </div>
            {user.cpf && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">CPF:</span>
                <span className="font-medium">{user.cpf}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 text-center border-t pt-4">
            Para alterar nome, email ou outros dados pessoais, entre em contato com o administrador do sistema.
          </p>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={salvando || !fotoUrl || fotoUrl === user.foto_perfil}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-2"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Foto
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
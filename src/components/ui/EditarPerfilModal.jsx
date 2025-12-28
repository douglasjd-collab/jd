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
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');

  useEffect(() => {
    if (user) {
      setNomeCompleto(user.full_name || '');
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
      toast.success('Foto carregada! Clique em "Salvar Alterações" para confirmar.');
    } catch (error) {
      toast.error('Erro ao fazer upload da foto');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleSalvar = async () => {
    if (!nomeCompleto.trim()) {
      toast.error('Digite um nome válido');
      return;
    }

    setSalvando(true);
    try {
      // Atualizar nome e foto no registro do usuário usando updateMe
      const dataToUpdate = { 
        full_name: nomeCompleto.trim()
      };
      
      // Só adiciona foto_perfil se houver uma URL válida
      if (fotoUrl) {
        dataToUpdate.foto_perfil = fotoUrl;
      }

      // Usar updateMe para atualizar o próprio perfil do usuário logado
      await base44.auth.updateMe(dataToUpdate);

      toast.success('Perfil atualizado com sucesso!');
      
      // Fechar o modal primeiro
      onOpenChange(false);
      
      // Aguardar um momento e forçar reload do usuário
      setTimeout(async () => {
        if (onSuccess) {
          await onSuccess();
        }
        // Forçar recarregamento da página para garantir atualização completa
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Erro detalhado ao atualizar perfil:', error);
      toast.error('Erro ao atualizar perfil: ' + (error.message || 'Tente novamente'));
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
            <User className="w-5 h-5" />
            Editar Perfil
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
                  {nomeCompleto?.charAt(0).toUpperCase() || user.full_name?.charAt(0).toUpperCase()}
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

          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome-completo">Nome de Exibição *</Label>
            <Input
              id="nome-completo"
              value={nomeCompleto}
              onChange={(e) => setNomeCompleto(e.target.value)}
              placeholder="Seu nome completo"
              className="text-base"
            />
          </div>

          {/* Informações fixas */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-xl">
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
              disabled={salvando || (!nomeCompleto.trim())}
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
                  Salvar Alterações
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
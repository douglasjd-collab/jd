import React, { useState } from 'react';import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ConfirmarExclusaoUsuarioModal({ 
  open, 
  onOpenChange, 
  usuario,
  onConfirm 
}) {
  const [senha, setSenha] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);

  const handleEsqueciSenha = async () => {
    setEnviandoReset(true);
    try {
      const user = await base44.auth.me();
      // Reenvia o email de acesso ao app, que permite redefinir a senha
      await base44.users.inviteUser(user.email, user.role || 'user');
      toast.success(`Email de acesso enviado para ${user.email}. Use o link para redefinir sua senha.`);
    } catch (e) {
      toast.error('Erro ao enviar email de recuperação: ' + (e.message || ''));
    } finally {
      setEnviandoReset(false);
    }
  };

  const handleConfirm = async () => {
    if (!senha) {
      toast.error('Digite sua senha para confirmar');
      return;
    }

    setIsValidating(true);

    try {
      const user = await base44.auth.me();
      
      // Tentar fazer login com a senha fornecida para validar
      const validation = await base44.auth.login(user.email, senha);
      
      if (!validation) {
        toast.error('Senha incorreta');
        setIsValidating(false);
        return;
      }

      // Senha correta, confirmar exclusão
      onConfirm();
      setSenha('');
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao validar senha:', error);
      toast.error('Senha incorreta');
    } finally {
      setIsValidating(false);
    }
  };

  const handleCancel = () => {
    setSenha('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">Excluir Usuário</DialogTitle>
              <DialogDescription>
                Esta ação não pode ser desfeita
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-900 font-medium mb-1">
              Você está prestes a excluir:
            </p>
            <p className="text-sm text-red-700">
              <strong>{usuario?.nome}</strong>
            </p>
            <p className="text-xs text-red-600">
              {usuario?.email}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha" className="text-slate-700">
              Digite sua senha para confirmar
            </Label>
            <Input
              id="senha"
              type="password"
              placeholder="Sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirm();
                }
              }}
              className="border-red-300 focus:border-red-500 focus:ring-red-500"
              autoFocus
            />
            <button
              type="button"
              onClick={handleEsqueciSenha}
              disabled={enviandoReset}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50 text-left mt-1"
            >
              {enviandoReset ? 'Enviando...' : 'Esqueci minha senha — enviar email de redefinição'}
            </button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isValidating}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isValidating || !senha}
          >
            {isValidating ? 'Validando...' : 'Confirmar Exclusão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
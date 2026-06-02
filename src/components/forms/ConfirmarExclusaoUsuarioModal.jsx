import React, { useState } from 'react';
import {
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
  const [confirmacao, setConfirmacao] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);

  const emailEsperado = usuario?.email || '';
  const confirmacaoCorreta = confirmacao.trim().toLowerCase() === emailEsperado.trim().toLowerCase();

  const handleEsqueciSenha = async () => {
    setEnviandoReset(true);
    try {
      const user = await base44.auth.me();
      await base44.auth.resetPasswordRequest(user.email);
      toast.success(`Email de redefinição enviado para ${user.email}. Verifique sua caixa de entrada.`);
    } catch (e) {
      toast.error('Erro ao enviar email: ' + (e.message || ''));
    } finally {
      setEnviandoReset(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmacaoCorreta) {
      toast.error('O email digitado não confere');
      return;
    }

    setIsValidating(true);
    try {
      onConfirm();
      setConfirmacao('');
      onOpenChange(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCancel = () => {
    setConfirmacao('');
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
            <Label htmlFor="confirmacao" className="text-slate-700">
              Digite o email do usuário para confirmar
            </Label>
            <p className="text-xs text-slate-500">
              Para confirmar, digite: <strong>{emailEsperado}</strong>
            </p>
            <Input
              id="confirmacao"
              type="text"
              placeholder={emailEsperado}
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              className="border-red-300 focus:border-red-500 focus:ring-red-500"
              autoFocus
            />
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
            disabled={isValidating || !confirmacaoCorreta}
          >
            {isValidating ? 'Excluindo...' : 'Confirmar Exclusão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
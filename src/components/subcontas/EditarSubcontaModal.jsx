import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, KeyRound, Send, RefreshCw } from 'lucide-react';

export default function EditarSubcontaModal({ open, onOpenChange, empresa, onSuccess }) {
  const [formData, setFormData] = useState({
    nome: empresa?.nome || '',
    email: empresa?.email || '',
    telefone: empresa?.telefone || '',
    tipo_licenca: empresa?.tipo_licenca || 'basica',
    limite_usuarios: empresa?.limite_usuarios || 5,
    nome_admin: empresa?.nome_admin || '',
    valor_mensal: empresa?.valor_mensal || '',
    observacoes: empresa?.observacoes || '',
  });

  const [enviandoAcesso, setEnviandoAcesso] = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);

  const handleReenviarAcesso = async () => {
    const emailLogin = formData.email || empresa?.email;
    if (!emailLogin) { toast.error('Email da empresa não encontrado'); return; }
    setEnviandoReset(true);
    try {
      const resp = await base44.functions.invoke('enviarResetSenha', {
        email: emailLogin,
        empresa_id: empresa.id,
        nome: formData.nome_admin || formData.nome,
      });
      if (resp.data?.success) {
        toast.success(`✅ Email de acesso reenviado para ${emailLogin}! O usuário poderá definir uma nova senha pelo link.`);
      } else {
        toast.error(resp.data?.error || 'Erro ao reenviar email');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setEnviandoReset(false);
    }
  };

  const handleEnviarAcesso = async () => {
    const emailLogin = formData.email || empresa?.email;
    if (!emailLogin) { toast.error('Email da empresa não encontrado'); return; }

    setEnviandoAcesso(true);
    try {
      const resp = await base44.functions.invoke('definirSenhaAdmin', {
        email: emailLogin,
        empresa_id: empresa.id,
        nome: formData.nome_admin || formData.nome,
      });
      if (resp.data?.success) {
        if (resp.data?.ja_existia) {
          toast.success(`✅ Acesso à subconta configurado para ${emailLogin}`);
        } else {
          toast.success(`✅ Convite enviado para ${emailLogin}! O usuário receberá um email para acessar.`);
        }
      } else {
        toast.error(resp.data?.error || 'Erro ao configurar acesso');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setEnviandoAcesso(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: (data) => base44.asServiceRole.entities.Empresa.update(empresa.id, data),
    onSuccess: () => {
      toast.success('Subconta atualizada com sucesso!');
      onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Subconta</DialogTitle>
          <DialogDescription>Atualize as informações da subconta</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações Básicas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome da Empresa *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Empresa LTDA"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contato@empresa.com"
              />
            </div>
            <div>
              <Label>Telefone *</Label>
              <Input
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div>
              <Label>Nome do Admin</Label>
              <Input
                value={formData.nome_admin}
                onChange={(e) => setFormData({ ...formData, nome_admin: e.target.value })}
                placeholder="Ex: João Silva"
              />
              <p className="text-xs text-slate-400 mt-1">Login: {formData.email || empresa?.email || '—'}</p>
            </div>
          </div>

          {/* Licença */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-4">Configurações de Licença</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Tipo de Licença</Label>
                <Select
                  value={formData.tipo_licenca}
                  onValueChange={(value) => setFormData({ ...formData, tipo_licenca: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gratuita">Gratuita</SelectItem>
                    <SelectItem value="basica">Básica</SelectItem>
                    <SelectItem value="profissional">Profissional</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Limite de Usuários</Label>
                <Input
                  type="number"
                  value={formData.limite_usuarios}
                  onChange={(e) => setFormData({ ...formData, limite_usuarios: parseInt(e.target.value) })}
                  min="1"
                />
              </div>
              <div>
                <Label>Valor Mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_mensal}
                  onChange={(e) => setFormData({ ...formData, valor_mensal: parseFloat(e.target.value) || '' })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Enviar Acesso ao Admin */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-500" />
              Acesso à Subconta
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Usuário de acesso: <span className="font-semibold text-slate-700">{formData.email || empresa?.email || '—'}</span>
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Se o usuário ainda não existe no sistema, um convite será enviado para o email acima para que ele defina sua senha. Se já existe, o acesso à subconta será configurado automaticamente.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enviandoAcesso}
                onClick={handleEnviarAcesso}
              >
                {enviandoAcesso
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Aguarde...</>
                  : <><Send className="w-4 h-4 mr-2" />Enviar Convite / Configurar Acesso</>}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enviandoReset}
                onClick={handleReenviarAcesso}
                className="text-amber-600 border-amber-300 hover:bg-amber-50"
              >
                {enviandoReset
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
                  : <><RefreshCw className="w-4 h-4 mr-2" />Reenviar Email de Acesso</>}
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              💡 Use "Reenviar Email de Acesso" para que o usuário receba um novo link e possa definir/redefinir sua senha.
            </p>
          </div>

          {/* Observações */}
          <div className="border-t pt-4">
            <Label>Observações</Label>
            <textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Notas adicionais sobre a subconta..."
              rows="3"
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
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
import { Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';

export default function EditarSubcontaModal({ open, onOpenChange, empresa, onSuccess }) {
  const [formData, setFormData] = useState({
    nome: empresa?.nome || '',
    email: empresa?.email || '',
    telefone: empresa?.telefone || '',
    tipo_licenca: empresa?.tipo_licenca || 'basica',
    limite_usuarios: empresa?.limite_usuarios || 5,
    email_admin: empresa?.email_admin || '',
    valor_mensal: empresa?.valor_mensal || '',
    observacoes: empresa?.observacoes || '',
  });

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [definindoSenha, setDefinindoSenha] = useState(false);

  const handleDefinirSenha = async () => {
    const emailLogin = formData.email || empresa?.email;
    if (!emailLogin) { toast.error('Email da empresa não encontrado'); return; }
    if (!novaSenha || novaSenha.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres'); return; }
    if (novaSenha !== confirmarSenha) { toast.error('As senhas não coincidem'); return; }

    setDefinindoSenha(true);
    try {
      const resp = await base44.functions.invoke('definirSenhaAdmin', {
        email: emailLogin,
        senha: novaSenha,
        empresa_id: empresa.id,
        nome: formData.email_admin || formData.nome,
      });
      if (resp.data?.success) {
        toast.success(`✅ Senha definida com sucesso para ${emailLogin}`);
        setNovaSenha('');
        setConfirmarSenha('');
      } else {
        toast.error(resp.data?.error || 'Erro ao definir senha');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setDefinindoSenha(false);
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
                value={formData.email_admin}
                onChange={(e) => setFormData({ ...formData, email_admin: e.target.value })}
                placeholder="Ex: João Silva"
              />
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

          {/* Definir Senha do Admin */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-500" />
              Definir Senha de Acesso
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Login: <span className="font-medium text-slate-600">{formData.email || empresa?.email || '—'}</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Nova Senha</Label>
                <div className="relative">
                  <Input
                    type={showSenha ? 'text' : 'password'}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button type="button" className="absolute right-3 top-2 text-slate-400 hover:text-slate-600" onClick={() => setShowSenha(!showSenha)}>
                    {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Confirmar Senha</Label>
                <Input
                  type={showSenha ? 'text' : 'password'}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Repita a senha"
                />
                {confirmarSenha && novaSenha !== confirmarSenha && (
                  <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={definindoSenha || !novaSenha || novaSenha !== confirmarSenha}
              onClick={handleDefinirSenha}
            >
              {definindoSenha
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Definindo...</>
                : <><KeyRound className="w-4 h-4 mr-2" />Definir Senha</>}
            </Button>
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
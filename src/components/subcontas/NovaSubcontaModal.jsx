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
import { Loader2, Eye, EyeOff } from 'lucide-react';

const INITIAL_FORM = {
  nome: '',
  email: '',
  nome_admin: '',
  senha: '',
  tipo_licenca: 'basica',
  limite_usuarios: 5,
};

export default function NovaSubcontaModal({ open, onOpenChange, onSuccess }) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [showSenha, setShowSenha] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('createEmpresa', { empresaData: data }),
    onSuccess: () => {
      toast.success('Subconta criada com sucesso! O admin receberá um convite por email.');
      resetModal();
      onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome || !formData.email || !formData.nome_admin) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    createMutation.mutate({
      ...formData,
      telefone: '-',
      endereco_rua: '-',
      endereco_numero: '-',
      endereco_cep: '-',
      endereco_cidade: '-',
      endereco_estado: '-',
      cpf_cnpj: '',
      status: 'ativa',
      status_licenca: 'trial',
      usuarios_ativos: 0,
      total_clientes: 0,
      total_vendas: 0,
      whatsapp_conectado: false,
      data_criacao: new Date().toISOString(),
    });
  };

  const resetModal = () => {
    setFormData(INITIAL_FORM);
    setShowSenha(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetModal(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Subconta</DialogTitle>
          <DialogDescription>Preencha os dados essenciais para criar a subconta</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>Nome da Empresa *</Label>
            <Input
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: Empresa LTDA"
              autoFocus
            />
          </div>

          <div>
            <Label>Email do Admin *</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@empresa.com"
            />
            <p className="text-xs text-slate-400 mt-1">Será usado como login de acesso</p>
          </div>

          <div>
            <Label>Nome do Usuário Admin *</Label>
            <Input
              value={formData.nome_admin}
              onChange={(e) => setFormData({ ...formData, nome_admin: e.target.value })}
              placeholder="Ex: João Silva"
            />
          </div>

          <div>
            <Label>Senha para Login</Label>
            <div className="relative">
              <Input
                type={showSenha ? 'text' : 'password'}
                value={formData.senha}
                onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                placeholder="Senha de acesso (opcional)"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSenha(!showSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Se não informada, o admin define via email de convite</p>
          </div>

          <div className="border-t pt-4 grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Licença</Label>
              <Select value={formData.tipo_licenca} onValueChange={(value) => setFormData({ ...formData, tipo_licenca: value })}>
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
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => { resetModal(); onOpenChange(false); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-[#23BE84] hover:bg-[#1da570]">
              {createMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Criando...</>
                : 'Criar Subconta →'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
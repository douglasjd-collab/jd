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

export default function NovaSubcontaModal({ open, onOpenChange, onSuccess }) {
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    email: '',
    cpf_cnpj: '',
    telefone: '',
    endereco_rua: '',
    endereco_numero: '',
    endereco_cep: '',
    endereco_cidade: '',
    endereco_estado: '',
    tipo_licenca: 'basica',
    limite_usuarios: 5,
    email_admin: '',
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.asServiceRole.entities.Empresa.create(data),
    onSuccess: () => {
      toast.success('Subconta criada com sucesso!');
      onSuccess();
      setFormData({
        codigo: '',
        nome: '',
        email: '',
        cpf_cnpj: '',
        telefone: '',
        endereco_rua: '',
        endereco_numero: '',
        endereco_cep: '',
        endereco_cidade: '',
        endereco_estado: '',
        tipo_licenca: 'basica',
        limite_usuarios: 5,
        email_admin: '',
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome || !formData.email || !formData.telefone) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    createMutation.mutate({
      ...formData,
      status: 'ativa',
      status_licenca: 'trial',
      usuarios_ativos: 0,
      total_clientes: 0,
      total_vendas: 0,
      whatsapp_conectado: false,
      data_criacao: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Subconta</DialogTitle>
          <DialogDescription>Crie uma nova licença de usuário no sistema</DialogDescription>
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
              <Label>CPF/CNPJ</Label>
              <Input
                value={formData.cpf_cnpj}
                onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
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
          </div>

          {/* Endereço */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-4">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Rua *</Label>
                <Input
                  value={formData.endereco_rua}
                  onChange={(e) => setFormData({ ...formData, endereco_rua: e.target.value })}
                  placeholder="Av. Principal"
                />
              </div>
              <div>
                <Label>Número *</Label>
                <Input
                  value={formData.endereco_numero}
                  onChange={(e) => setFormData({ ...formData, endereco_numero: e.target.value })}
                  placeholder="123"
                />
              </div>
              <div>
                <Label>CEP *</Label>
                <Input
                  value={formData.endereco_cep}
                  onChange={(e) => setFormData({ ...formData, endereco_cep: e.target.value })}
                  placeholder="00000-000"
                />
              </div>
              <div>
                <Label>Cidade *</Label>
                <Input
                  value={formData.endereco_cidade}
                  onChange={(e) => setFormData({ ...formData, endereco_cidade: e.target.value })}
                  placeholder="São Paulo"
                />
              </div>
              <div>
                <Label>Estado *</Label>
                <Input
                  value={formData.endereco_estado}
                  onChange={(e) => setFormData({ ...formData, endereco_estado: e.target.value })}
                  placeholder="SP"
                  maxLength="2"
                />
              </div>
            </div>
          </div>

          {/* Licença */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-4">Configurações de Licença</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Email do Admin</Label>
                <Input
                  type="email"
                  value={formData.email_admin}
                  onChange={(e) => setFormData({ ...formData, email_admin: e.target.value })}
                  placeholder="admin@empresa.com"
                />
              </div>
              <div>
                <Label>Tipo de Licença</Label>
                <Select
                  value={formData.tipo_licenca}
                  onValueChange={(value) => setFormData({ ...formData, tipo_licenca: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Subconta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
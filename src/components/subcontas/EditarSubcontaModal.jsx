import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { Loader2 } from 'lucide-react';

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

  // Buscar empresas JD (para trazer para subconta)
  const { data: empresasJD = [], isLoading: loadingEmpresas } = useQuery({
    queryKey: ['empresas-jd'],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.Empresa.list('-created_date');
      return all.filter(e => e.nome && e.nome.toLowerCase().includes('jd'));
    },
    enabled: open,
  });

  // Mutation para vincular empresa JD à subconta
  const vinculaMutation = useMutation({
    mutationFn: async (empresaJdId) => {
      const empresaJd = empresasJD.find(e => e.id === empresaJdId);
      if (!empresaJd) throw new Error('Empresa JD não encontrada');
      
      // Copiar dados relevantes da empresa JD para a subconta
      const dadosVinculacao = {
        cpf_cnpj: empresaJd.cpf_cnpj,
        endereco_rua: empresaJd.endereco_rua,
        endereco_numero: empresaJd.endereco_numero,
        endereco_complemento: empresaJd.endereco_complemento,
        endereco_cep: empresaJd.endereco_cep,
        endereco_cidade: empresaJd.endereco_cidade,
        endereco_estado: empresaJd.endereco_estado,
      };
      
      return base44.asServiceRole.entities.Empresa.update(empresa.id, dadosVinculacao);
    },
    onSuccess: () => {
      toast.success('Empresa vinculada à subconta com sucesso!');
      onSuccess();
    },
    onError: (error) => toast.error('Erro ao vincular empresa: ' + error.message),
  });

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
              <Label>Email do Admin</Label>
              <Input
                type="email"
                value={formData.email_admin}
                onChange={(e) => setFormData({ ...formData, email_admin: e.target.value })}
                placeholder="admin@empresa.com"
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

          {/* Vinculação de Empresa JD */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-4">Trazer Empresa JD para Subconta</h3>
            <div>
              <Label>Selecionar Empresa JDPromotora</Label>
              <div className="flex gap-2">
                <Select onValueChange={(value) => vinculaMutation.mutate(value)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={loadingEmpresas ? "Carregando..." : "Selecione uma empresa JD"} />
                  </SelectTrigger>
                  <SelectContent>
                    {empresasJD.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vinculaMutation.isPending && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Isso irá copiar os dados de CPF/CNPJ e endereço da empresa JD para esta subconta.
              </p>
            </div>
          </div>

          {/* Observações */}
          <div className="border-t pt-4">
            <Label>Observações</Label>
            <textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Notas adicionais sobre a subconta..."
              rows="3"
              className="w-full px-3 py-2 border rounded-md"
            />
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
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
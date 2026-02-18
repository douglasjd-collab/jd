import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function PropostaEditModal({ proposta, open, onOpenChange }) {
  const [formData, setFormData] = useState(proposta || {});
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (proposta) {
      setFormData(proposta);
    }
  }, [proposta]);

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => {
      const colabs = await base44.entities.Colaborador.filter({
        perfil: 'vendedor',
        status: 'ativo'
      });
      return colabs;
    },
  });

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-propostas-edit'],
    queryFn: () => base44.entities.StatusProposta.filter({ ativo: true }),
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios-edit'],
    queryFn: () => base44.entities.Convenio.filter({ ativo: true }),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Proposta.update(proposta.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
      toast.success('Proposta atualizada com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Erro ao atualizar proposta');
      console.error(error);
    }
  });

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const dataToUpdate = {
        valor_credito: parseFloat(formData.valor_credito) || 0,
        valor_comissao: parseFloat(formData.valor_comissao) || 0,
        comissao_recebida: parseFloat(formData.comissao_recebida) || 0,
        status: formData.status,
        observacoes: formData.observacoes || '',
        grupo: formData.grupo || '',
        cota: formData.cota || '',
        contrato: formData.contrato || '',
      };

      if (formData.produto === 'emprestimo' && formData.emprestimo_tipo) {
        dataToUpdate.emprestimo_tipo = formData.emprestimo_tipo;
      }

      await updateMutation.mutateAsync(dataToUpdate);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const produtoLabels = {
    consorcio: 'Consórcio',
    emprestimo: 'Empréstimo',
    financiamento: 'Financiamento'
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Proposta</DialogTitle>
          <DialogDescription>
            {formData.cliente_nome} - {produtoLabels[formData.produto] || formData.produto}
          </DialogDescription>
        </DialogHeader>

        {proposta && (
          <div className="space-y-6">
            {/* Informações Básicas */}
            <div>
              <h3 className="text-sm font-semibold mb-4 text-slate-700">Informações Básicas</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Input disabled value={formData.cliente_nome || ''} />
                </div>
                <div>
                  <Label className="text-xs">Produto</Label>
                  <Input disabled value={produtoLabels[formData.produto] || formData.produto} />
                </div>
              </div>
            </div>

            {/* Dados Específicos por Produto */}
            {formData.produto === 'consorcio' && (
              <div>
                <h3 className="text-sm font-semibold mb-4 text-slate-700">Dados do Consórcio</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="grupo">Grupo</Label>
                    <Input
                      id="grupo"
                      value={formData.grupo || ''}
                      onChange={(e) => setFormData({ ...formData, grupo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cota">Cota</Label>
                    <Input
                      id="cota"
                      value={formData.cota || ''}
                      onChange={(e) => setFormData({ ...formData, cota: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="contrato">Contrato</Label>
                    <Input
                      id="contrato"
                      value={formData.contrato || ''}
                      onChange={(e) => setFormData({ ...formData, contrato: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.produto === 'emprestimo' && (
              <div>
                <h3 className="text-sm font-semibold mb-4 text-slate-700">Dados do Empréstimo</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tipo">Tipo de Empréstimo</Label>
                    <Select
                      value={formData.emprestimo_tipo || 'NOVO'}
                      onValueChange={(value) => setFormData({ ...formData, emprestimo_tipo: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NOVO">Novo</SelectItem>
                        <SelectItem value="REFINANCIAMENTO">Refinanciamento</SelectItem>
                        <SelectItem value="PORTABILIDADE_PURA">Portabilidade Pura</SelectItem>
                        <SelectItem value="REFIN_PORTABILIDADE">Refin + Portabilidade</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="numero_beneficio">Número do Benefício</Label>
                    <Input
                      id="numero_beneficio"
                      value={formData.emprestimo_numero_beneficio || ''}
                      onChange={(e) => setFormData({ ...formData, emprestimo_numero_beneficio: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="numero_ade">Número ADE</Label>
                    <Input
                      id="numero_ade"
                      value={formData.emprestimo_numero_ade || ''}
                      onChange={(e) => setFormData({ ...formData, emprestimo_numero_ade: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="prazo">Prazo (meses)</Label>
                    <Input
                      id="prazo"
                      type="number"
                      value={formData.emprestimo_prazo || ''}
                      onChange={(e) => setFormData({ ...formData, emprestimo_prazo: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Valores */}
            <div>
              <h3 className="text-sm font-semibold mb-4 text-slate-700">Valores</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="valor_credito">Valor do Crédito</Label>
                  <Input
                    id="valor_credito"
                    type="number"
                    step="0.01"
                    value={formData.valor_credito || ''}
                    onChange={(e) => setFormData({ ...formData, valor_credito: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="valor_comissao">Valor Comissão (estimado)</Label>
                  <Input
                    id="valor_comissao"
                    type="number"
                    step="0.01"
                    value={formData.valor_comissao || ''}
                    onChange={(e) => setFormData({ ...formData, valor_comissao: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="comissao_recebida">Comissão Recebida</Label>
                  <Input
                    id="comissao_recebida"
                    type="number"
                    step="0.01"
                    value={formData.comissao_recebida || ''}
                    onChange={(e) => setFormData({ ...formData, comissao_recebida: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="administradora">Banco/Administradora</Label>
                  <Select
                    value={formData.administradora_id || ''}
                    onValueChange={(value) => {
                      const admin = administradoras.find(a => a.id === value);
                      setFormData({
                        ...formData,
                        administradora_id: value,
                        administradora_nome: admin?.nome_fantasia || admin?.razao_social || ''
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {administradoras.map(adm => (
                        <SelectItem key={adm.id} value={adm.id}>
                          {adm.nome_fantasia || adm.razao_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Status e Observações */}
            <div>
              <h3 className="text-sm font-semibold mb-4 text-slate-700">Status e Observações</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status || 'ativa'}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={formData.observacoes || ''}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    rows={4}
                  />
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isLoading}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
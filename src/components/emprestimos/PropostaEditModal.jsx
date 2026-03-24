import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const normCpf = cpf => String(cpf || '').replace(/\D/g, '');
const formatCpf = cpf => {
  const clean = normCpf(cpf);
  return clean.length === 11 ? `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6,9)}-${clean.slice(9)}` : cpf;
};
const formatValor = val => {
  if (!val) return '';
  const num = parseFloat(String(val).replace(/\D/g, '')) / 100 || 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseValor = val => {
  if (!val) return 0;
  return parseFloat(String(val).replace(/\D/g, '')) / 100 || parseFloat(val) || 0;
};

export default function PropostaEditModal({ open, onOpenChange, propostaId, onSuccess }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: proposta } = useQuery({
    queryKey: ['proposta-edit', propostaId],
    enabled: !!propostaId && open,
    queryFn: () => base44.entities.Proposta.filter({ id: propostaId }).then(r => r[0] || null),
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente-edit', proposta?.cliente_id],
    enabled: !!proposta?.cliente_id,
    queryFn: () => base44.entities.Cliente.filter({ id: proposta.cliente_id }).then(r => r[0] || null),
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos-edit'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios-edit'],
    queryFn: () => base44.entities.Convenio.filter({ ativo: true }),
  });

  const { data: tipos = [] } = useQuery({
    queryKey: ['tipos-edit'],
    queryFn: () => base44.entities.TipoEmprestimo.filter({ ativo: true }),
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores-edit'],
    queryFn: () => base44.entities.Colaborador.filter({ status: 'ativo', perfil: 'vendedor' }),
  });

  useEffect(() => {
    if (proposta) {
      setFormData({
        cliente_nome: proposta.cliente_nome || '',
        cliente_cpf: proposta.cliente_cpf || '',
        produto: proposta.produto || 'emprestimo',
        emprestimo_tipo: proposta.emprestimo_tipo || '',
        emprestimo_convenio_id: proposta.emprestimo_convenio_id || '',
        emprestimo_numero_beneficio: proposta.emprestimo_numero_beneficio || '',
        emprestimo_numero_ade: proposta.emprestimo_numero_ade || '',
        emprestimo_prazo: proposta.emprestimo_prazo || '',
        emprestimo_valor_parcela: proposta.emprestimo_valor_parcela || '',
        emprestimo_banco_anterior: proposta.emprestimo_banco_anterior || '',
        emprestimo_saldo_devedor: proposta.emprestimo_saldo_devedor || '',
        data_venda: proposta.data_venda || '',
        emprestimo_data_liberacao: proposta.emprestimo_data_liberacao || '',
        valor_credito: proposta.valor_credito || '',
        valor_comissao: proposta.valor_comissao || '',
        comissao_recebida: proposta.comissao_recebida || 0,
        administradora_id: proposta.administradora_id || '',
        vendedor_id: proposta.vendedor_id || '',
        contrato: proposta.contrato || '',
        observacoes: proposta.observacoes || '',
        
        // Comissões em %
        comissao_empresa_percentual: proposta.valor_comissao && proposta.valor_credito ? 
          ((proposta.valor_comissao / proposta.valor_credito) * 100) : 0,
        comissao_vendedor_percentual: 0,

        // Endereço do cliente
        res_endereco: cliente?.res_endereco || '',
        res_numero: cliente?.res_numero || '',
        res_complemento: cliente?.res_complemento || '',
        res_bairro: cliente?.res_bairro || '',
        res_cidade: cliente?.res_cidade || '',
        res_uf: cliente?.res_uf || '',
        res_cep: cliente?.res_cep || '',
        com_endereco: cliente?.com_endereco || '',
        com_numero: cliente?.com_numero || '',
        com_complemento: cliente?.com_complemento || '',
        com_bairro: cliente?.com_bairro || '',
        com_cidade: cliente?.com_cidade || '',
        com_uf: cliente?.com_uf || '',
        com_cep: cliente?.com_cep || '',
      });
    }
  }, [proposta, cliente]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      // Calcular valor de comissão a partir do percentual
      const comissaoValor = data.comissao_empresa_percentual && data.valor_credito 
        ? (data.valor_credito * data.comissao_empresa_percentual / 100)
        : data.valor_comissao || 0;

      const updateData = {
        cliente_nome: data.cliente_nome,
        cliente_cpf: data.cliente_cpf,
        emprestimo_tipo: data.emprestimo_tipo || null,
        emprestimo_convenio_id: data.emprestimo_convenio_id || null,
        emprestimo_numero_beneficio: data.emprestimo_numero_beneficio || null,
        emprestimo_numero_ade: data.emprestimo_numero_ade || null,
        emprestimo_prazo: data.emprestimo_prazo ? parseInt(data.emprestimo_prazo) : null,
        emprestimo_valor_parcela: data.emprestimo_valor_parcela ? parseFloat(data.emprestimo_valor_parcela) : null,
        data_venda: data.data_venda || null,
        emprestimo_data_liberacao: data.emprestimo_data_liberacao || null,
        valor_credito: parseValor(data.valor_credito),
        valor_comissao: comissaoValor,
        comissao_recebida: parseValor(data.comissao_recebida),
        administradora_id: data.administradora_id || null,
        vendedor_id: data.vendedor_id || null,
        contrato: data.contrato || null,
        observacoes: data.observacoes || null,
      };

      await base44.asServiceRole.entities.Proposta.update(propostaId, updateData);

      // Atualizar cliente com endereço
      if (proposta?.cliente_id) {
        const clienteUpdate = {
          res_endereco: data.res_endereco || null,
          res_numero: data.res_numero || null,
          res_complemento: data.res_complemento || null,
          res_bairro: data.res_bairro || null,
          res_cidade: data.res_cidade || null,
          res_uf: data.res_uf || null,
          res_cep: data.res_cep || null,
          com_endereco: data.com_endereco || null,
          com_numero: data.com_numero || null,
          com_complemento: data.com_complemento || null,
          com_bairro: data.com_bairro || null,
          com_cidade: data.com_cidade || null,
          com_uf: data.com_uf || null,
          com_cep: data.com_cep || null,
        };
        await base44.asServiceRole.entities.Cliente.update(proposta.cliente_id, clienteUpdate);
      }
    },
    onSuccess: () => {
      toast.success('Proposta atualizada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['proposta-edit'] });
      queryClient.invalidateQueries({ queryKey: ['proposta-emp-detalhes'] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error('Erro ao atualizar: ' + err.message);
    },
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateMutation.mutateAsync(formData);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fieldProps = (field) => ({
    value: formData[field] || '',
    onChange: (e) => handleChange(field, e.target.value),
  });

  const isPortabilidade = formData.emprestimo_tipo === 'PORTABILIDADE_PURA' || formData.emprestimo_tipo === 'REFIN_PORTABILIDADE';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Proposta</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-full pr-4">
          <div className="space-y-6">
            {/* Informações Básicas */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Informações Básicas</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Input {...fieldProps('cliente_nome')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">CPF</Label>
                  <Input {...fieldProps('cliente_cpf')} placeholder="000.000.000-00" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Produto</Label>
                  <Input {...fieldProps('produto')} disabled className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Tipo de Empréstimo</Label>
                  <Select value={formData.emprestimo_tipo || ''} onValueChange={(v) => handleChange('emprestimo_tipo', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tipos.map(t => <SelectItem key={t.id} value={t.slug}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Dados do Empréstimo */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Dados do Empréstimo</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Convênio</Label>
                  <Select value={formData.emprestimo_convenio_id || ''} onValueChange={(v) => handleChange('emprestimo_convenio_id', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {convenios.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Banco</Label>
                  <Select value={formData.administradora_id || ''} onValueChange={(v) => handleChange('administradora_id', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Nº Benefício</Label>
                  <Input {...fieldProps('emprestimo_numero_beneficio')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Nº ADE</Label>
                  <Input {...fieldProps('emprestimo_numero_ade')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Prazo (meses)</Label>
                  <Input type="number" {...fieldProps('emprestimo_prazo')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Valor da Parcela (R$)</Label>
                  <Input type="number" step="0.01" {...fieldProps('emprestimo_valor_parcela')} placeholder="0,00" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Nº Contrato</Label>
                  <Input {...fieldProps('contrato')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Data da Venda</Label>
                  <Input type="date" {...fieldProps('data_venda')} className="mt-1" />
                </div>
                <div>
                   <Label className="text-xs">Data de Liberação</Label>
                   <Input type="date" {...fieldProps('emprestimo_data_liberacao')} className="mt-1" />
                 </div>
                 {isPortabilidade && (
                   <>
                     <div>
                       <Label className="text-xs">Banco Anterior</Label>
                       <Input {...fieldProps('emprestimo_banco_anterior')} className="mt-1" />
                     </div>
                     <div>
                       <Label className="text-xs">Saldo Devedor (R$)</Label>
                       <Input type="number" step="0.01" {...fieldProps('emprestimo_saldo_devedor')} className="mt-1" />
                     </div>
                   </>
                 )}
                </div>
                </div>

            {/* Valores */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Valores</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Valor do Crédito</Label>
                  <Input type="number" step="0.01" {...fieldProps('valor_credito')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Comissão Empresa (%)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={formData.comissao_empresa_percentual || 0}
                    onChange={(e) => handleChange('comissao_empresa_percentual', parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Comissão Vendedor (%)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={formData.comissao_vendedor_percentual || 0}
                    onChange={(e) => handleChange('comissao_vendedor_percentual', parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Comissão Recebida</Label>
                  <Input type="number" step="0.01" {...fieldProps('comissao_recebida')} className="mt-1" />
                </div>
              </div>
            </div>

            {/* Vendedor */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Vendedor</h3>
              <div>
                <Label className="text-xs">Vendedor</Label>
                <Select value={formData.vendedor_id || ''} onValueChange={(v) => handleChange('vendedor_id', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Endereço Residencial */}
            <div>
              <h3 className="font-semibold text-sm mb-3">📍 Endereço Residencial</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs">Logradouro</Label>
                  <Input {...fieldProps('res_endereco')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Número</Label>
                  <Input {...fieldProps('res_numero')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Complemento</Label>
                  <Input {...fieldProps('res_complemento')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Bairro</Label>
                  <Input {...fieldProps('res_bairro')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Cidade</Label>
                  <Input {...fieldProps('res_cidade')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">UF</Label>
                  <Input {...fieldProps('res_uf')} maxLength="2" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">CEP</Label>
                  <Input {...fieldProps('res_cep')} className="mt-1" />
                </div>
              </div>
            </div>

            {/* Endereço Comercial */}
            <div>
              <h3 className="font-semibold text-sm mb-3">🏢 Endereço Comercial</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs">Logradouro</Label>
                  <Input {...fieldProps('com_endereco')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Número</Label>
                  <Input {...fieldProps('com_numero')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Complemento</Label>
                  <Input {...fieldProps('com_complemento')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Bairro</Label>
                  <Input {...fieldProps('com_bairro')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Cidade</Label>
                  <Input {...fieldProps('com_cidade')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">UF</Label>
                  <Input {...fieldProps('com_uf')} maxLength="2" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">CEP</Label>
                  <Input {...fieldProps('com_cep')} className="mt-1" />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <Label className="text-xs">Observações</Label>
              <textarea 
                {...fieldProps('observacoes')}
                className="w-full mt-1 p-2 border rounded-md text-sm"
                rows="4"
              />
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button 
                onClick={handleSave}
                disabled={loading || updateMutation.isPending}
                className="gap-2"
              >
                {loading || updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
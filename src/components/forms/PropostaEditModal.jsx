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

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos-edit'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores-edit'],
    queryFn: async () => {
      return base44.entities.Colaborador.filter({ status: 'ativo' }, 'nome', 200);
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

  const { data: tiposEmprestimo = [] } = useQuery({
    queryKey: ['tipos-emprestimo-edit'],
    queryFn: () => base44.entities.TipoEmprestimo.filter({ ativo: true }, 'nome'),
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
        status_id: formData.status_id || '',
        observacoes: formData.observacoes || '',
        grupo: formData.grupo || '',
        cota: formData.cota || '',
        contrato: formData.contrato || '',
        data_venda: formData.data_venda || '',
        vendedor_id: formData.vendedor_id || '',
        vendedor_nome: formData.vendedor_nome || '',
        administradora_id: formData.administradora_id || '',
        administradora_nome: formData.administradora_nome || '',
      };

      if (formData.produto === 'emprestimo') {
        dataToUpdate.emprestimo_tipo = formData.emprestimo_tipo || '';
        dataToUpdate.emprestimo_convenio_id = formData.emprestimo_convenio_id || '';
        dataToUpdate.emprestimo_convenio_nome = formData.emprestimo_convenio_nome || '';
        dataToUpdate.emprestimo_numero_beneficio = formData.emprestimo_numero_beneficio || '';
        dataToUpdate.emprestimo_numero_ade = formData.emprestimo_numero_ade || '';
        dataToUpdate.emprestimo_prazo = parseInt(formData.emprestimo_prazo) || 0;
        dataToUpdate.emprestimo_valor_parcela = parseFloat(formData.emprestimo_valor_parcela) || 0;
        dataToUpdate.emprestimo_banco_anterior = formData.emprestimo_banco_anterior || '';
        dataToUpdate.emprestimo_saldo_devedor = parseFloat(formData.emprestimo_saldo_devedor) || 0;
        dataToUpdate.emprestimo_data_liberacao = formData.emprestimo_data_liberacao || '';
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

  const parseCurrency = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  };

  const formatInputCurrency = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const num = typeof value === 'string' ? parseCurrency(value) : value;
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
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
                    <Label>Tipo de Empréstimo</Label>
                    <Select
                      value={formData.emprestimo_tipo || ''}
                      onValueChange={(value) => setFormData({ ...formData, emprestimo_tipo: value })}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {tiposEmprestimo.length > 0 ? (
                          tiposEmprestimo.map(tipo => (
                            <SelectItem key={tipo.id} value={tipo.slug}>{tipo.nome}</SelectItem>
                          ))
                        ) : (
                          <>
                            <SelectItem value="NOVO">Novo</SelectItem>
                            <SelectItem value="REFINANCIAMENTO">Refinanciamento</SelectItem>
                            <SelectItem value="PORTABILIDADE_PURA">Portabilidade Pura</SelectItem>
                            <SelectItem value="REFIN_PORTABILIDADE">Refin + Portabilidade</SelectItem>
                            <SelectItem value="CARTAO_CONSIGNADO">Cartão Consignado</SelectItem>
                            <SelectItem value="CARTAO_CONSIGNADO_SAQUE">Cartão com Saque</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Convênio</Label>
                    <Select
                      value={formData.emprestimo_convenio_id || ''}
                      onValueChange={(value) => {
                        const conv = convenios.find(c => c.id === value);
                        setFormData({ ...formData, emprestimo_convenio_id: value, emprestimo_convenio_nome: conv?.nome || '' });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {convenios.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Número do Benefício</Label>
                    <Input value={formData.emprestimo_numero_beneficio || ''} onChange={(e) => setFormData({ ...formData, emprestimo_numero_beneficio: e.target.value })} />
                  </div>
                  <div>
                    <Label>Número ADE</Label>
                    <Input value={formData.emprestimo_numero_ade || ''} onChange={(e) => setFormData({ ...formData, emprestimo_numero_ade: e.target.value })} />
                  </div>
                  <div>
                    <Label>Número do Contrato</Label>
                    <Input value={formData.contrato || ''} onChange={(e) => setFormData({ ...formData, contrato: e.target.value })} />
                  </div>
                   <div>
                    <Label>Prazo (meses)</Label>
                   <Input type="number" value={formData.emprestimo_prazo || ''} onChange={(e) => setFormData({ ...formData, emprestimo_prazo: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                   <Label>Valor da Parcela</Label>
                   <div className="relative">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                     <Input
                       type="number"
                       step="0.01"
                       min="0"
                       className="pl-9"
                       value={formData.emprestimo_valor_parcela || ''}
                       onChange={(e) => setFormData({ ...formData, emprestimo_valor_parcela: parseFloat(e.target.value) || 0 })}
                       placeholder="0,00"
                     />
                   </div>
                  </div>
                  {(formData.emprestimo_tipo === 'PORTABILIDADE_PURA' || formData.emprestimo_tipo === 'REFIN_PORTABILIDADE') && (
                    <>
                      <div>
                        <Label>Banco Anterior</Label>
                        <Input value={formData.emprestimo_banco_anterior || ''} onChange={(e) => setFormData({ ...formData, emprestimo_banco_anterior: e.target.value })} />
                      </div>
                      <div>
                        <Label>Saldo Devedor</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                          <Input
                            className="pl-9"
                            value={formatInputCurrency(formData.emprestimo_saldo_devedor)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d,]/g, '');
                              setFormData({ ...formData, emprestimo_saldo_devedor: parseCurrency(raw) });
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Data de Liberação</Label>
                    <Input type="date" value={formData.emprestimo_data_liberacao || ''} onChange={(e) => setFormData({ ...formData, emprestimo_data_liberacao: e.target.value })} />
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
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                    <Input
                      id="valor_credito"
                      className="pl-9"
                      value={formatInputCurrency(formData.valor_credito)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d,]/g, '');
                        setFormData({ ...formData, valor_credito: parseCurrency(raw) });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="valor_comissao">Valor Comissão (estimado)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                    <Input
                      id="valor_comissao"
                      className="pl-9"
                      value={formatInputCurrency(formData.valor_comissao)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d,]/g, '');
                        setFormData({ ...formData, valor_comissao: parseCurrency(raw) });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="comissao_recebida">Comissão Recebida</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                    <Input
                      id="comissao_recebida"
                      className="pl-9"
                      value={formatInputCurrency(formData.comissao_recebida)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d,]/g, '');
                        setFormData({ ...formData, comissao_recebida: parseCurrency(raw) });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label>{formData.produto === 'emprestimo' ? 'Banco' : 'Administradora'}</Label>
                  {formData.produto === 'emprestimo' ? (
                    <Select
                      value={formData.administradora_id || ''}
                      onValueChange={(value) => {
                        const banco = bancos.find(b => b.id === value);
                        setFormData({ ...formData, administradora_id: value, administradora_nome: banco?.nome || '' });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={formData.administradora_id || ''}
                      onValueChange={(value) => {
                        const admin = administradoras.find(a => a.id === value);
                        setFormData({ ...formData, administradora_id: value, administradora_nome: admin?.nome_fantasia || admin?.razao_social || '' });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {administradoras.map(adm => (
                          <SelectItem key={adm.id} value={adm.id}>{adm.nome_fantasia || adm.razao_social}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            {/* Vendedor e Data */}
            <div>
              <h3 className="text-sm font-semibold mb-4 text-slate-700">Vendedor e Data</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vendedor</Label>
                  <Select
                    value={formData.vendedor_id || ''}
                    onValueChange={(value) => {
                      const vend = vendedores.find(v => v.id === value);
                      setFormData({ ...formData, vendedor_id: value, vendedor_nome: vend?.nome || '' });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione">
                        {formData.vendedor_nome || 'Selecione'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data da Venda</Label>
                  <Input type="date" value={formData.data_venda || ''} onChange={(e) => setFormData({ ...formData, data_venda: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Status e Observações */}
            <div>
              <h3 className="text-sm font-semibold mb-4 text-slate-700">Status e Observações</h3>
              <div className="space-y-4">
                <div>
                  <Label>Status</Label>
                  <Select
                    value={formData.status_id || formData.status || ''}
                    onValueChange={(value) => {
                      const s = statusList.find(s => s.id === value);
                      setFormData({ ...formData, status_id: value, status: s?.nome || value });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {statusList.length > 0
                        ? statusList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                          ))
                        : <>
                            <SelectItem value="ativa">Ativa</SelectItem>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="cancelada">Cancelada</SelectItem>
                          </>
                      }
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
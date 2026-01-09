import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function VendaForm({ open, onOpenChange, venda, onSubmit, isLoading, currentUser, oportunidade, onSuccess }) {
  const [tabelas, setTabelas] = useState([]);
  
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: venda || {
      cliente_id: oportunidade?.cliente_id || '',
      administradora_id: '',
      tabela_id: '',
      grupo: '',
      cota: '',
      contrato: '',
      valorCredito: oportunidade?.valor_estimado || 0,
      taxaAdministracao: 0,
      vendedor_id: oportunidade?.vendedor_id || currentUser?.id || '',
      gerente_id: currentUser?.gerente_id || '',
      data_venda: format(new Date(), 'yyyy-MM-dd'),
      status: 'ativa'
    }
  });

  const administradoraId = watch('administradora_id');
  const tabelaId = watch('tabela_id');
  const vendedorId = watch('vendedor_id');
  const valorCredito = watch('valorCredito');
  const taxaAdministracao = watch('taxaAdministracao');
  const tipoEmpresa = watch('tipoEmpresa');

  const empresaId = currentUser?.empresa_id;
  const isMaster = currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin';
  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'admin';

  // React Query - Clientes
  const { data: clientes = [], isLoading: clientesLoading } = useQuery({
    queryKey: ['clientes-venda-form', empresaId],
    enabled: open,
    queryFn: async () => {
      const result = await base44.entities.Cliente.list();
      return result.filter(c => c.status === 'ativo');
    },
  });

  // React Query - Administradoras
  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras-venda-form', empresaId],
    enabled: open && (!!empresaId || isMaster),
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });

  // React Query - Vendedores
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores-venda-form', empresaId],
    enabled: open && isAdmin,
    queryFn: async () => {
      try {
        const result = await base44.entities.Colaborador.list();
        if (isMaster) {
          // Master vê todos os vendedores
          return result.filter(u => u.perfil === 'vendedor' && u.status === 'ativo');
        } else if (empresaId) {
          // Admin vê vendedores da sua empresa
          return result.filter(u => 
            u.perfil === 'vendedor' && 
            u.status === 'ativo' &&
            u.empresa_id === empresaId
          );
        }
        return [];
      } catch (err) {
        console.error('Erro ao carregar vendedores:', err);
        return [];
      }
    },
  });

  // React Query - Gerentes
  const { data: gerentes = [] } = useQuery({
    queryKey: ['gerentes-venda-form'],
    enabled: open && isAdmin,
    queryFn: async () => {
      try {
        return await base44.entities.Colaborador.filter({ perfil: 'gerente', status: 'ativo' });
      } catch (err) {
        console.error('Erro ao carregar gerentes:', err);
        return [];
      }
    },
  });

  // React Query - Empresas (só para Master)
  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-venda-form'],
    enabled: open && isMaster,
    queryFn: () => base44.entities.Empresa.filter({ status: 'ativa' }),
  });

  useEffect(() => {
    if (open) {
      if (venda) {
        // Modo edição - preencher todos os campos
        Object.keys(venda).forEach(key => {
          setValue(key, venda[key]);
        });
      } else {
        // Modo criação - valores padrão
        reset({
          cliente_id: oportunidade?.cliente_id || '',
          administradora_id: '',
          tabela_id: '',
          grupo: '',
          cota: '',
          contrato: '',
          valorCredito: oportunidade?.valor_estimado || 0,
          taxaAdministracao: 0,
          vendedor_id: oportunidade?.vendedor_id || currentUser?.id || '',
          gerente_id: currentUser?.gerente_id || '',
          data_venda: format(new Date(), 'yyyy-MM-dd'),
          status: 'ativa'
        });
      }
    }
  }, [open, venda, oportunidade, setValue, reset, currentUser]);

  useEffect(() => {
    if (administradoraId) {
      loadTabelas(administradoraId);
    }
  }, [administradoraId]);

  useEffect(() => {
    if (tabelaId && tabelas.length > 0) {
      const tabela = tabelas.find(t => t.id === tabelaId);
      if (tabela) {
        setValue('tipoEmpresa', tabela.tipoEmpresa);
        setValue('tabela_nome', tabela.nomeTabela);
      }
    }
  }, [tabelaId, tabelas, setValue]);

  // Calcular comissão automaticamente
  useEffect(() => {
    const credito = parseFloat(valorCredito) || 0;
    const taxa = parseFloat(taxaAdministracao) || 0;
    
    if (credito > 0 && taxa > 0 && tipoEmpresa) {
      const fator = tipoEmpresa === 'MEI' ? 0.25 : (tipoEmpresa === 'ME' || tipoEmpresa === 'LTDA') ? 0.30 : 0;
      const percentualComissao = taxa * fator;
      const valorComissao = credito * (percentualComissao / 100);
      
      setValue('percentualComissao', percentualComissao);
      setValue('valorComissao', valorComissao);
    } else {
      setValue('percentualComissao', 0);
      setValue('valorComissao', 0);
    }
  }, [valorCredito, taxaAdministracao, tipoEmpresa, setValue]);

  useEffect(() => {
    if (vendedorId && vendedores.length > 0) {
      const vendedor = vendedores.find(v => v.id === vendedorId);
      if (vendedor?.gerente_id) {
        setValue('gerente_id', vendedor.gerente_id);
      }
    }
  }, [vendedorId, vendedores, setValue]);

  const loadTabelas = async (adminId) => {
    const data = await base44.entities.TabelaConsorcio.filter({ 
      administradora_id: adminId, 
      status: 'ativa' 
    });
    setTabelas(data);
  };



  const formatarMoeda = (valor) => {
    if (!valor) return '';
    const numero = valor.replace(/\D/g, '');
    const valorFormatado = (Number(numero) / 100).toFixed(2);
    return valorFormatado.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const handleValorCreditoChange = (e) => {
    const valorFormatado = formatarMoeda(e.target.value);
    const valorNumerico = parseFloat(valorFormatado.replace(/\./g, '').replace(',', '.')) || 0;
    setValue('valorCredito', valorNumerico, { shouldValidate: true });
  };

  const formatarPercentual = (valor) => {
    if (!valor) return '';
    const numero = valor.replace(/\D/g, '');
    const valorFormatado = (Number(numero) / 100).toFixed(2);
    return valorFormatado.replace('.', ',');
  };

  const handleTaxaChange = (e) => {
    const input = e.target.value.replace(/\D/g, '');
    const valorNumerico = parseFloat((Number(input) / 100).toFixed(2)) || 0;
    setValue('taxaAdministracao', valorNumerico, { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{venda ? 'Editar Venda' : 'Nova Venda'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Card Empresa (apenas para Master) */}
          {isMaster && (
            <div className="border rounded-lg p-4 bg-white shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-3">Empresa *</h3>
              <Select
                value={watch('empresa_id') || ''}
                onValueChange={(value) => {
                  console.log('Empresa selecionada:', value);
                  setValue('empresa_id', value, { shouldValidate: true });
                }}
              >
                <SelectTrigger className="h-auto min-h-[60px] py-3">
                  <SelectValue placeholder="Selecione a empresa para esta venda">
                    {watch('empresa_id') && (() => {
                      const empresa = empresas.find(e => e.id === watch('empresa_id'));
                      return empresa ? (
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium">{empresa.nome}</span>
                          <span className="text-xs text-slate-500">{empresa.cpf_cnpj}</span>
                        </div>
                      ) : null;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {empresas.length > 0 ? (
                    empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{e.nome}</span>
                          <span className="text-xs text-slate-500">{e.cpf_cnpj}</span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500">
                      Nenhuma empresa cadastrada
                    </div>
                  )}
                </SelectContent>
              </Select>
              {errors.empresa_id && <p className="text-sm text-red-500 mt-1">Empresa é obrigatória</p>}
            </div>
          )}

          {/* Card Cliente */}
          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900">Cliente *</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(createPageUrl('Clientes'), '_blank')}
                className="text-xs"
              >
                + Cadastrar Novo Cliente
              </Button>
            </div>
            <Select
              value={watch('cliente_id')}
              onValueChange={(value) => {
                if (venda) return; // Bloqueia alteração em vendas existentes
                setValue('cliente_id', value);
                const cliente = clientes.find(c => c.id === value);
                if (cliente) {
                  setValue('cliente_nome', cliente.nome);
                  setValue('cliente_cpf', cliente.cpf);
                }
              }}
              disabled={!!venda}
            >
              <SelectTrigger className="h-auto min-h-[60px] py-3">
                <SelectValue placeholder="Selecione um cliente">
                  {watch('cliente_id') && (() => {
                    const cliente = clientes.find(c => c.id === watch('cliente_id'));
                    return cliente ? (
                      <div className="flex flex-col items-start text-left">
                        <span className="font-medium">{cliente.nome}</span>
                        <span className="text-xs text-slate-500">CPF: {cliente.cpf}</span>
                      </div>
                    ) : null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clientes.slice(0, 30).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} - CPF: {c.cpf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.cliente_id && <p className="text-sm text-red-500 mt-1">Cliente é obrigatório</p>}
          </div>
            
          {/* Card Administradora e Tabela */}
          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Administradora e Tabela</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Administradora *</Label>
                <Select
                  value={watch('administradora_id')}
                  onValueChange={(value) => {
                    setValue('administradora_id', value);
                    setValue('tabela_id', '');
                    const admin = administradoras.find(a => a.id === value);
                    if (admin) {
                      setValue('administradora_nome', admin.nome_fantasia || admin.razao_social);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {administradoras.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome_fantasia || a.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Tabela de Consórcio *</Label>
                <Select
                  value={watch('tabela_id')}
                  onValueChange={(value) => setValue('tabela_id', value)}
                  disabled={!administradoraId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabelas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nomeTabela} ({t.tipoEmpresa})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
            
          {/* Card Grupo, Cota e Contrato */}
          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Dados do Consórcio</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="grupo">Grupo *</Label>
                <Input
                  id="grupo"
                  {...register('grupo', { required: true })}
                  placeholder="Ex: 1234"
                />
              </div>
              
              <div>
                <Label htmlFor="cota">Cota</Label>
                <Input
                  id="cota"
                  {...register('cota')}
                  placeholder="Ex: 56 (deixar vazio = pendente)"
                />
                <p className="text-xs text-slate-500 mt-1">Se não preencher, ficará pendente</p>
              </div>
              
              <div>
                <Label htmlFor="contrato">Contrato (opcional)</Label>
                <Input
                  id="contrato"
                  {...register('contrato')}
                  placeholder="Número do contrato"
                />
              </div>
              
              <div>
                <Label>Tipo Empresa</Label>
                <Input
                  value={tipoEmpresa || '-'}
                  disabled
                  className="bg-slate-100"
                />
              </div>
            </div>
          </div>
            
          {/* Card Valores e Comissão */}
          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Valores e Comissão</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="valorCredito">Valor do Crédito *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 font-medium">R$</span>
                  <Input
                    id="valorCredito"
                    value={watch('valorCredito') ? formatarMoeda((parseFloat(watch('valorCredito')) * 100).toString()) : ''}
                    onChange={handleValorCreditoChange}
                    placeholder="0,00"
                    className="pl-12"
                  />
                </div>
                {errors.valorCredito && <p className="text-sm text-red-500 mt-1">Valor obrigatório</p>}
              </div>
              
              <div>
                <Label htmlFor="taxaAdministracao">Taxa Administração (%) *</Label>
                <div className="relative">
                  <Input
                    id="taxaAdministracao"
                    value={watch('taxaAdministracao') ? formatarPercentual((parseFloat(watch('taxaAdministracao')) * 100).toFixed(0)) : ''}
                    onChange={handleTaxaChange}
                    placeholder="0,00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 font-medium">%</span>
                </div>
                {errors.taxaAdministracao && <p className="text-sm text-red-500 mt-1">Taxa obrigatória</p>}
              </div>
              
              <div>
                <Label>Percentual Comissão (calculado)</Label>
                <Input
                  value={watch('percentualComissao')?.toFixed(2) || '0.00'}
                  disabled
                  className="bg-slate-100"
                />
              </div>
              
              <div>
                <Label>Valor Comissão (calculado)</Label>
                <Input
                  value={`R$ ${(watch('valorComissao') || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  disabled
                  className="bg-slate-100 font-semibold text-green-700"
                />
              </div>
            </div>
          </div>
            
          {/* Card Informações Adicionais */}
          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Informações Adicionais</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vendedor *</Label>
                <Select
                  value={watch('vendedor_id') || ''}
                  onValueChange={(value) => {
                    console.log('Vendedor selecionado:', value);
                    setValue('vendedor_id', value, { shouldValidate: true });
                    const vendedor = vendedores.find(v => v.id === value);
                    if (vendedor) {
                      setValue('vendedor_nome', vendedor.nome);
                      if (vendedor.gerente_id) {
                        setValue('gerente_id', vendedor.gerente_id);
                        const gerente = gerentes.find(g => g.id === vendedor.gerente_id);
                        if (gerente) {
                          setValue('gerente_nome', gerente.nome);
                        }
                      }
                    }
                    }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o vendedor">
                      {watch('vendedor_id') && vendedores.find(v => v.id === watch('vendedor_id'))?.nome}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vendedores.length > 0 ? (
                      vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-500">
                        Nenhum vendedor cadastrado
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {errors.vendedor_id && <p className="text-sm text-red-500 mt-1">Vendedor é obrigatório</p>}
              </div>
              
              <div>
                <Label htmlFor="data_venda">Data da Venda *</Label>
                <Input
                  id="data_venda"
                  type="date"
                  {...register('data_venda', { required: true })}
                />
              </div>
              
              <div>
                <Label>Status</Label>
                <Select
                  value={watch('status')}
                  onValueChange={(value) => setValue('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="em_atraso">Em Atraso</SelectItem>
                    <SelectItem value="contemplada">Contemplada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || (isMaster && !watch('empresa_id')) || !watch('cliente_id') || !watch('administradora_id') || !watch('tabela_id') || !watch('grupo') || !watch('vendedor_id') || parseFloat(watch('valorCredito') || 0) <= 0 || parseFloat(watch('taxaAdministracao') || 0) <= 0} 
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {venda ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
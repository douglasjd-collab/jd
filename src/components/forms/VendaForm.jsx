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
import ClienteSearchModal from './ClienteSearchModal';

export default function VendaForm({ open, onOpenChange, venda, onSubmit, isLoading, currentUser, oportunidade, onSuccess }) {
  const [tabelas, setTabelas] = useState([]);
  const [clienteSearchOpen, setClienteSearchOpen] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: venda || {
      cliente_id: oportunidade?.cliente_id || '',
      administradora_id: '',
      tabela_id: '',
      tipo: 'automovel',
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
  const { data: administradoras = [], isLoading: adminLoading } = useQuery({
    queryKey: ['administradoras-venda-form'],
    enabled: open,
    queryFn: async () => {
      try {
        return await base44.entities.Administradora.filter({ status: 'ativa' });
      } catch (error) {
        console.error('Erro ao carregar administradoras:', error);
        return [];
      }
    },
  });

  // React Query - Vendedores
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores-venda-form', empresaId],
    enabled: open,
    queryFn: async () => {
      try {
        const result = await base44.entities.Colaborador.filter({ status: 'ativo' });
        
        if (isMaster) {
          // Master vê todos os vendedores
          return result.filter(u => ['vendedor', 'gerente', 'admin'].includes(u.perfil));
        } else if (empresaId) {
          // Filtrar por empresa
          return result.filter(u => 
            ['vendedor', 'gerente', 'admin'].includes(u.perfil) &&
            u.empresa_id === empresaId
          );
        }
        return result.filter(u => ['vendedor', 'gerente', 'admin'].includes(u.perfil));
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
    if (!open) {
      // Limpa estado ao fechar
      setClienteSelecionado(null);
      setTabelas([]);
      return;
    }

    if (venda) {
      // Modo edição - preencher todos os campos
      Object.keys(venda).forEach(key => {
        setValue(key, venda[key]);
      });
      // Se houver cliente, carregar dados
      if (venda.cliente_id && clientes.length > 0) {
        const cliente = clientes.find(c => c.id === venda.cliente_id);
        if (cliente) {
          setClienteSelecionado(cliente);
        }
      }
    } else {
      // Modo criação - valores padrão
      reset({
        cliente_id: oportunidade?.cliente_id || '',
        administradora_id: '',
        tabela_id: '',
        tipo: 'automovel',
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
      
      // Se oportunidade tem cliente, carregar
      if (oportunidade?.cliente_id && clientes.length > 0) {
        const cliente = clientes.find(c => c.id === oportunidade.cliente_id);
        if (cliente) {
          setClienteSelecionado(cliente);
        }
      } else {
        setClienteSelecionado(null);
      }
    }
  }, [open]);

  useEffect(() => {
    if (administradoraId && open) {
      loadTabelas(administradoraId);
    } else {
      setTabelas([]);
    }
  }, [administradoraId, open]);

  useEffect(() => {
    if (tabelaId && tabelas.length > 0) {
      const tabela = tabelas.find(t => t.id === tabelaId);
      if (tabela) {
        setValue('tabela_nome', tabela.nomeTabela);
      }
    }
  }, [tabelaId, tabelas, setValue]);

  // Calcular comissão automaticamente baseado no tipo de empresa
  useEffect(() => {
    const calcularComissao = async () => {
      const credito = parseFloat(valorCredito) || 0;
      const taxa = parseFloat(taxaAdministracao) || 0;
      const empresaIdValue = watch('empresa_id') || empresaId;
      
      if (credito > 0 && taxa > 0 && empresaIdValue) {
        try {
          // Buscar tipo da empresa
          const empresas = await base44.entities.Empresa.filter({ id: empresaIdValue });
          const empresa = empresas[0];
          
          const fator = empresa?.tipo_empresa === 'MEI' ? 0.25 : 0.30;
          const percentualComissao = taxa * fator;
          const valorComissao = credito * (percentualComissao / 100);
          
          setValue('percentualComissao', percentualComissao);
          setValue('valorComissao', valorComissao);
        } catch (error) {
          console.error('Erro ao calcular comissão:', error);
          setValue('percentualComissao', 0);
          setValue('valorComissao', 0);
        }
      } else {
        setValue('percentualComissao', 0);
        setValue('valorComissao', 0);
      }
    };
    
    calcularComissao();
  }, [valorCredito, taxaAdministracao, watch('empresa_id'), empresaId, setValue]);

  useEffect(() => {
    if (vendedorId && vendedores.length > 0) {
      const vendedor = vendedores.find(v => v.id === vendedorId);
      if (vendedor?.gerente_id) {
        setValue('gerente_id', vendedor.gerente_id);
      }
    }
  }, [vendedorId, vendedores, setValue]);

  const loadTabelas = async (adminId) => {
    try {
      const data = await base44.entities.TabelaConsorcio.filter({ 
        administradora_id: adminId, 
        status: 'ativa' 
      });
      setTabelas(data || []);
    } catch (error) {
      console.error('Erro ao carregar tabelas:', error);
      setTabelas([]);
    }
  };



  const handleValorCreditoChange = (e) => {
    // Remove tudo exceto números
    const apenasNumeros = e.target.value.replace(/\D/g, '');
    // Converte para número decimal (centavos para reais)
    const valorNumerico = parseFloat(apenasNumeros) / 100 || 0;
    setValue('valorCredito', valorNumerico, { shouldValidate: true });
  };

  const formatarValorParaExibicao = (valor) => {
    if (!valor && valor !== 0) return '';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(valor);
  };

  const handleTaxaChange = (e) => {
    const apenasNumeros = e.target.value.replace(/\D/g, '');
    const valorNumerico = parseFloat(apenasNumeros) / 100 || 0;
    setValue('taxaAdministracao', valorNumerico, { shouldValidate: true });
  };

  const formatarPercentualParaExibicao = (valor) => {
    if (!valor && valor !== 0) return '';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(valor);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{venda ? 'Editar Venda' : 'Nova Venda'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Campos hidden para dados denormalizados */}
          <input type="hidden" {...register('cliente_nome')} />
          <input type="hidden" {...register('cliente_cpf')} />
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
            <h3 className="font-semibold text-slate-900 mb-3">Cliente *</h3>
            
            {/* Cliente Selecionado */}
            {clienteSelecionado || watch('cliente_id') ? (
              <div className="border-2 border-[#23BE84] rounded-lg p-4 bg-green-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">
                      {clienteSelecionado?.nome_completo || clienteSelecionado?.pj_razao_social || clientes.find(c => c.id === watch('cliente_id'))?.nome_completo || clientes.find(c => c.id === watch('cliente_id'))?.pj_razao_social}
                    </h4>
                    <div className="text-sm text-slate-600 mt-1">
                      <p>CPF/CNPJ: {clienteSelecionado?.cpf || clienteSelecionado?.pj_cnpj || clientes.find(c => c.id === watch('cliente_id'))?.cpf || clientes.find(c => c.id === watch('cliente_id'))?.pj_cnpj}</p>
                      {(clienteSelecionado?.celular || clientes.find(c => c.id === watch('cliente_id'))?.celular) && (
                        <p>Telefone: {clienteSelecionado?.celular || clientes.find(c => c.id === watch('cliente_id'))?.celular}</p>
                      )}
                    </div>
                  </div>
                  {!venda && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setClienteSelecionado(null);
                        setValue('cliente_id', '');
                        setValue('cliente_nome', '');
                        setValue('cliente_cpf', '');
                        setClienteSearchOpen(true);
                      }}
                    >
                      Trocar
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* Botão Buscar Cliente */
              <Button
                type="button"
                variant="outline"
                onClick={() => setClienteSearchOpen(true)}
                className="w-full h-auto min-h-[80px] flex flex-col items-center justify-center gap-2 hover:bg-slate-50"
                disabled={!!venda}
              >
                <Search className="w-6 h-6 text-slate-400" />
                <div className="text-center">
                  <p className="font-medium text-slate-900">Buscar Cliente</p>
                  <p className="text-xs text-slate-500 mt-1">Clique para buscar por CPF ou nome</p>
                </div>
              </Button>
            )}
            
            {errors.cliente_id && <p className="text-sm text-red-500 mt-2">Cliente é obrigatório</p>}
          </div>
          
          {/* Modal de Busca de Cliente */}
          <ClienteSearchModal
            open={clienteSearchOpen}
            onOpenChange={setClienteSearchOpen}
            currentUser={currentUser}
            onSelectCliente={(cliente) => {
              setClienteSelecionado(cliente);
              setValue('cliente_id', cliente.id);
              setValue('cliente_nome', cliente.nome_completo || cliente.pj_razao_social || cliente.nome || '');
              setValue('cliente_cpf', cliente.cpf || cliente.pj_cnpj || '');
            }}
          />
            
          {/* Card Administradora e Tabela */}
          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Administradora e Tabela</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Administradora *</Label>
                <Select
                  value={watch('administradora_id') || ''}
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
                    {adminLoading ? (
                      <div className="p-4 text-center text-sm text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        Carregando...
                      </div>
                    ) : administradoras.length > 0 ? (
                      administradoras.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nome_fantasia || a.razao_social}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-500">
                        Nenhuma administradora cadastrada
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Tabela de Consórcio *</Label>
                <Select
                  value={watch('tabela_id') || ''}
                  onValueChange={(value) => setValue('tabela_id', value)}
                  disabled={!administradoraId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabelas.length > 0 ? (
                    tabelas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nomeTabela}
                      </SelectItem>
                    ))
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-500">
                        {administradoraId ? 'Nenhuma tabela cadastrada' : 'Selecione uma administradora'}
                      </div>
                    )}
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
                <Label>Tipo *</Label>
                <Select
                  value={watch('tipo')}
                  onValueChange={(value) => setValue('tipo', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automovel">Automóvel</SelectItem>
                    <SelectItem value="imovel">Imóvel</SelectItem>
                    <SelectItem value="motocicleta">Motocicleta</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="bens_moveis">Bens Móveis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
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
                    value={formatarValorParaExibicao(watch('valorCredito'))}
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
                    value={formatarPercentualParaExibicao(watch('taxaAdministracao'))}
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
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendedores.length > 0 ? (
                      vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nome} ({v.perfil})
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-500">
                        Carregando vendedores...
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